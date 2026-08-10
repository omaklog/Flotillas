import type { PostgrestError } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import { nombreArchivoUnico } from '~/utils/archivos'

type ConductorRow = Database['public']['Tables']['conductores']['Row']
type ConductorInsert = Database['public']['Tables']['conductores']['Insert']
type ConductorUpdate = Database['public']['Tables']['conductores']['Update']
type ArchivoRow = Database['public']['Tables']['archivos']['Row']

const BUCKET = 'documentos'

const ETIQUETAS_DEPENDIENTES: Record<string, string> = {
  asignaciones_conductor_vehiculo: 'asignaciones'
}

/**
 * CRUD de conductores (contracts/conductores.md): sin `server/api/` intermedio (research.md R7).
 * Mismo shape que `useVehiculos.ts` (research.md R9) — no comparten código: alta en dos pasos,
 * desactivación/reactivación, eliminación con limpieza de archivos, historial de versiones de
 * licencia.
 */
export function useConductores() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const registros = useState<ConductorRow[]>('conductores:listado', () => [])
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

  async function listar(busqueda = '', incluirInactivos = false) {
    cargando.value = true
    error.value = null
    let query = client.from('conductores').select('*').order('nombre')
    if (!incluirInactivos) query = query.eq('activo', true)
    const texto = busqueda.trim()
    if (texto) {
      // Mismo escape que useCatalogo.ts/useVehiculos.ts: PostgREST usa `,`/`.`/`(`/`)` como
      // sintaxis estructural en or() — un texto con esos caracteres rompe el filtro en silencio
      // si no se envuelve en comillas dobles.
      const valorEscapado = `"%${texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`
      query = query.or(`nombre.ilike.${valorEscapado},apellidos.ilike.${valorEscapado}`)
    }
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = data ?? []
  }

  async function crear(valores: Omit<ConductorInsert, 'empresa_id' | 'licencia_archivo_id'>) {
    error.value = null
    const { data, error: err } = await client
      .from('conductores')
      .insert({ ...valores, empresa_id: usuario.value!.empresa_id! })
      .select('id')
      .single()
    if (err) {
      error.value = mapearErrorEscritura(err, 'Ya existe un conductor con ese número de licencia.')
      throw err
    }
    return data.id
  }

  async function editar(id: string, valores: ConductorUpdate) {
    error.value = null
    const { error: err } = await client.from('conductores').update(valores).eq('id', id)
    if (err) {
      error.value = mapearErrorEscritura(err, 'Ya existe un conductor con ese número de licencia.')
      throw err
    }
  }

  /** Alta paso 2 / reemplazo en edición: sube el archivo, registra la versión, y actualiza el
   * puntero de licencia vigente (FR-003/FR-010, contracts/conductores.md). */
  async function adjuntarLicencia(conductorId: string, archivo: File) {
    error.value = null
    const empresaId = usuario.value!.empresa_id!
    const ruta = `licencia/${empresaId}/${conductorId}/${nombreArchivoUnico(archivo.name)}`

    const { error: errSubida } = await client.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type })
    if (errSubida) {
      error.value = 'No se pudo subir el archivo de licencia.'
      throw errSubida
    }

    const { data: archivoRow, error: errArchivo } = await client
      .from('archivos')
      .insert({
        empresa_id: empresaId,
        tipo: 'licencia',
        storage_path: ruta,
        entidad_tipo: 'conductor',
        entidad_id: conductorId,
        subido_por: usuario.value!.id
      })
      .select('id')
      .single()
    if (errArchivo) {
      error.value = errArchivo.message
      throw errArchivo
    }

    const { error: errUpdate } = await client
      .from('conductores')
      .update({ licencia_archivo_id: archivoRow.id })
      .eq('id', conductorId)
    if (errUpdate) {
      error.value = errUpdate.message
      throw errUpdate
    }
  }

  async function desactivar(id: string, motivo: string) {
    error.value = null
    const { error: err } = await client
      .from('conductores')
      .update({ activo: false, motivo_baja: motivo })
      .eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  async function reactivar(id: string) {
    error.value = null
    const { error: err } = await client.from('conductores').update({ activo: true }).eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  /** Eliminación con limpieza (FR-016a): orden deliberado — el conductor primero, para que un
   * rechazo por dependientes (FR-016) no toque nada más (research.md R7). */
  async function eliminar(id: string) {
    error.value = null

    const { error: errConductor } = await client.from('conductores').delete().eq('id', id)
    if (errConductor) {
      error.value = mapearErrorEscritura(
        errConductor,
        'Ya existe un conductor con ese número de licencia.'
      )
      throw errConductor
    }

    const { data: archivosDelConductor } = await client
      .from('archivos')
      .select('storage_path')
      .eq('entidad_tipo', 'conductor')
      .eq('entidad_id', id)

    if (archivosDelConductor && archivosDelConductor.length > 0) {
      await client
        .from('archivos')
        .delete()
        .eq('entidad_tipo', 'conductor')
        .eq('entidad_id', id)
      await client.storage.from(BUCKET).remove(archivosDelConductor.map((a) => a.storage_path))
    }
  }

  async function listarHistorialLicencia(conductorId: string) {
    const { data, error: err } = await client
      .from('archivos')
      .select('*, usuarios(nombre)')
      .eq('entidad_tipo', 'conductor')
      .eq('entidad_id', conductorId)
      .eq('tipo', 'licencia')
      .order('created_at', { ascending: false })
    if (err) throw err
    return (data ?? []) as unknown as (ArchivoRow & { usuarios: { nombre: string } | null })[]
  }

  /** `download` fuerza `Content-Disposition: attachment` aunque Storage sirva desde otro origen —
   * sin esto, un `<a>` con `download` no dispara descarga cross-origin. */
  async function descargarArchivo(storagePath: string, nombreDescarga?: string) {
    const { data, error: err } = await client.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60, { download: nombreDescarga ?? true })
    if (err) throw err
    return data.signedUrl
  }

  /** A diferencia de `descargarArchivo`, sin `download` — el navegador respeta el
   * `Content-Disposition` inline que Storage sirve por defecto y previsualiza el PDF/imagen en
   * una pestaña nueva en vez de forzar la descarga (botón "Ver" del historial de licencia). */
  async function verArchivo(storagePath: string) {
    const { data, error: err } = await client.storage.from(BUCKET).createSignedUrl(storagePath, 60)
    if (err) throw err
    return data.signedUrl
  }

  return {
    registros,
    cargando,
    error,
    listar,
    crear,
    editar,
    adjuntarLicencia,
    desactivar,
    reactivar,
    eliminar,
    listarHistorialLicencia,
    descargarArchivo,
    verArchivo
  }
}

export type { ConductorRow, ArchivoRow }
