import type { PostgrestError } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import { nombreArchivoUnico } from '~/utils/archivos'

type VehiculoRow = Database['public']['Tables']['vehiculos']['Row']
type VehiculoInsert = Database['public']['Tables']['vehiculos']['Insert']
type VehiculoUpdate = Database['public']['Tables']['vehiculos']['Update']
type ArchivoRow = Database['public']['Tables']['archivos']['Row']
type VehiculoPermisoRow = Database['public']['Tables']['vehiculo_permisos']['Row']
type VehiculoListado = VehiculoRow & {
  tipos_vehiculo: { nombre: string } | null
  aseguradoras: { razon_social: string } | null
}

const BUCKET = 'documentos'

const ETIQUETAS_DEPENDIENTES: Record<string, string> = {
  cargas_combustible: 'cargas de combustible',
  mantenimientos: 'mantenimientos',
  checklists: 'checklists',
  servicios_obligatorios: 'servicios obligatorios'
}

/**
 * CRUD de vehículos (contracts/vehiculos.md): sin `server/api/` intermedio (research.md R5).
 * A diferencia de `useCatalogo.ts` (Catálogos Base), no es genérico — modela el alta en dos
 * pasos, baja/reactivación, eliminación con limpieza de archivos, y el sub-recurso de permisos
 * asignados (research.md R7).
 */
export function useVehiculos() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const registros = useState<VehiculoListado[]>('vehiculos:listado', () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  function mapearErrorEscritura(err: PostgrestError, mensajeDuplicado: string): string {
    if (err.code === '23505') return mensajeDuplicado
    if (err.code === '23503') {
      const coincidencia = err.message.match(/foreign key constraint "[^"]+" on table "(\w+)"/)
      const tabla = coincidencia?.[1]
      const etiqueta = tabla ? ETIQUETAS_DEPENDIENTES[tabla] : null
      return etiqueta
        ? `No se puede eliminar: tiene ${etiqueta} registrados.`
        : 'No se puede eliminar: tiene registros relacionados.'
    }
    return err.message
  }

  async function listar(busqueda = '', incluirBaja = false) {
    cargando.value = true
    error.value = null
    let query = client
      .from('vehiculos')
      .select('*, tipos_vehiculo(nombre), aseguradoras(razon_social)')
      .order('marca')
    if (!incluirBaja) query = query.eq('baja', false)
    const texto = busqueda.trim()
    if (texto) {
      // Mismo escape que useCatalogo.ts: PostgREST usa `,`/`.`/`(`/`)` como sintaxis
      // estructural en or() — un texto con esos caracteres rompe el filtro en silencio si no
      // se envuelve en comillas dobles (bug real ya encontrado y corregido en Catálogos Base).
      const valorEscapado = `"%${texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`
      query = query.or(
        `marca.ilike.${valorEscapado},modelo.ilike.${valorEscapado},placa.ilike.${valorEscapado}`
      )
    }
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = (data ?? []) as unknown as VehiculoListado[]
  }

  async function crear(valores: Omit<VehiculoInsert, 'empresa_id' | 'poliza_archivo_id'>) {
    error.value = null
    const { data, error: err } = await client
      .from('vehiculos')
      .insert({ ...valores, empresa_id: usuario.value!.empresa_id! })
      .select('id')
      .single()
    if (err) {
      error.value = mapearErrorEscritura(err, 'Ya existe un vehículo con esa placa.')
      throw err
    }
    return data.id
  }

  async function editar(id: string, valores: VehiculoUpdate) {
    error.value = null
    const { error: err } = await client.from('vehiculos').update(valores).eq('id', id)
    if (err) {
      error.value = mapearErrorEscritura(err, 'Ya existe un vehículo con esa placa.')
      throw err
    }
  }

  /** Alta paso 2 / reemplazo en edición: sube el archivo, registra la versión, y actualiza el
   * puntero de póliza vigente (FR-003/FR-010, contracts/vehiculos.md). */
  async function adjuntarPoliza(vehiculoId: string, archivo: File) {
    error.value = null
    const empresaId = usuario.value!.empresa_id!
    const ruta = `poliza/${empresaId}/${vehiculoId}/${nombreArchivoUnico(archivo.name)}`

    const { error: errSubida } = await client.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type })
    if (errSubida) {
      error.value = 'No se pudo subir el archivo de póliza.'
      throw errSubida
    }

    const { data: archivoRow, error: errArchivo } = await client
      .from('archivos')
      .insert({
        empresa_id: empresaId,
        tipo: 'poliza',
        storage_path: ruta,
        entidad_tipo: 'vehiculo',
        entidad_id: vehiculoId,
        subido_por: usuario.value!.id
      })
      .select('id')
      .single()
    if (errArchivo) {
      error.value = errArchivo.message
      throw errArchivo
    }

    const { error: errUpdate } = await client
      .from('vehiculos')
      .update({ poliza_archivo_id: archivoRow.id })
      .eq('id', vehiculoId)
    if (errUpdate) {
      error.value = errUpdate.message
      throw errUpdate
    }
  }

  async function darDeBaja(id: string, motivo: string) {
    error.value = null
    const { error: err } = await client
      .from('vehiculos')
      .update({ baja: true, motivo_baja: motivo })
      .eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  async function reactivar(id: string) {
    error.value = null
    const { error: err } = await client.from('vehiculos').update({ baja: false }).eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  /** Eliminación con limpieza (FR-016a): orden deliberado — el vehículo primero, para que un
   * rechazo por dependientes (FR-016) no toque nada más (research.md R5). */
  async function eliminar(id: string) {
    error.value = null

    const { error: errVehiculo } = await client.from('vehiculos').delete().eq('id', id)
    if (errVehiculo) {
      error.value = mapearErrorEscritura(errVehiculo, 'Ya existe un vehículo con esa placa.')
      throw errVehiculo
    }

    const { data: archivosDelVehiculo } = await client
      .from('archivos')
      .select('storage_path')
      .eq('entidad_tipo', 'vehiculo')
      .eq('entidad_id', id)

    if (archivosDelVehiculo && archivosDelVehiculo.length > 0) {
      await client
        .from('archivos')
        .delete()
        .eq('entidad_tipo', 'vehiculo')
        .eq('entidad_id', id)
      await client.storage.from(BUCKET).remove(archivosDelVehiculo.map((a) => a.storage_path))
    }
  }

  async function listarHistorialPoliza(vehiculoId: string) {
    const { data, error: err } = await client
      .from('archivos')
      .select('*, usuarios(nombre)')
      .eq('entidad_tipo', 'vehiculo')
      .eq('entidad_id', vehiculoId)
      .eq('tipo', 'poliza')
      .order('created_at', { ascending: false })
    if (err) throw err
    return (data ?? []) as unknown as (ArchivoRow & { usuarios: { nombre: string } | null })[]
  }

  /** `download` fuerza `Content-Disposition: attachment` aunque Storage sirva desde otro origen
   * (research.md R6) — sin esto, un `<a>` con `download` no dispara descarga cross-origin. */
  async function descargarArchivo(storagePath: string, nombreDescarga?: string) {
    const { data, error: err } = await client.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60, { download: nombreDescarga ?? true })
    if (err) throw err
    return data.signedUrl
  }

  async function listarPermisos(vehiculoId: string) {
    const { data, error: err } = await client
      .from('vehiculo_permisos')
      .select('*, permisos(clave, nombre, tipo)')
      .eq('vehiculo_id', vehiculoId)
    if (err) throw err
    return data ?? []
  }

  async function asignarPermiso(vehiculoId: string, permisoId: string, fechaVencimiento: string | null) {
    const { error: err } = await client.from('vehiculo_permisos').insert({
      empresa_id: usuario.value!.empresa_id!,
      vehiculo_id: vehiculoId,
      permiso_id: permisoId,
      fecha_vencimiento: fechaVencimiento
    })
    if (err) {
      throw new Error(
        err.code === '23505' ? 'Este permiso ya está asignado a este vehículo.' : err.message
      )
    }
  }

  async function editarVencimientoPermiso(asignacionId: string, fechaVencimiento: string | null) {
    const { error: err } = await client
      .from('vehiculo_permisos')
      .update({ fecha_vencimiento: fechaVencimiento })
      .eq('id', asignacionId)
    if (err) throw err
  }

  async function quitarPermiso(asignacionId: string) {
    const { error: err } = await client.from('vehiculo_permisos').delete().eq('id', asignacionId)
    if (err) throw err
  }

  return {
    registros,
    cargando,
    error,
    listar,
    crear,
    editar,
    adjuntarPoliza,
    darDeBaja,
    reactivar,
    eliminar,
    listarHistorialPoliza,
    descargarArchivo,
    listarPermisos,
    asignarPermiso,
    editarVencimientoPermiso,
    quitarPermiso
  }
}

export type { VehiculoRow, VehiculoListado, ArchivoRow, VehiculoPermisoRow }
