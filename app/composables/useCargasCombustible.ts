import type { Database } from '~/types/database.types'
import { nombreArchivoUnico } from '~/utils/archivos'

type CargaCombustibleRow = Database['public']['Tables']['cargas_combustible']['Row']
type CargaCombustibleInsert = Database['public']['Tables']['cargas_combustible']['Insert']
type ArchivoRow = Database['public']['Tables']['archivos']['Row']
type EstadoRegistro = Database['public']['Enums']['estado_registro']
type CargaListado = CargaCombustibleRow & {
  vehiculos: { placa: string; marca: string; modelo: string } | null
  proveedores: { nombre: string } | null
}

const BUCKET = 'documentos'

/**
 * CRUD de cargas de combustible (contracts/cargas-combustible.md): sin `server/api/` intermedio
 * (research.md R7). Sin `editar`/`eliminar` — el registro es inmutable salvo cancelación
 * (FR-008/FR-014). Sin `obtener(id)` — el detalle consulta directo (research.md, tasks.md
 * "Lecciones").
 */
export function useCargasCombustible() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const registros = useState<CargaListado[]>('cargas-combustible:listado', () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  async function crear(valores: Omit<CargaCombustibleInsert, 'empresa_id' | 'creado_por'>) {
    error.value = null
    const { data, error: err } = await client
      .from('cargas_combustible')
      .insert({ ...valores, empresa_id: usuario.value!.empresa_id!, creado_por: usuario.value!.id })
      .select('id')
      .single()
    if (err) {
      error.value = err.message
      throw err
    }
    return data.id
  }

  /** Devuelve el odómetro de la última carga ACTIVA de ese vehículo, o `null` si no tiene
   * ninguna previa (data-model.md, research.md R4) — validación de cliente, respaldada por el
   * trigger `private.validar_odometro_creciente()`. */
  async function obtenerUltimoOdometroActivo(vehiculoId: string): Promise<number | null> {
    const { data, error: err } = await client
      .from('cargas_combustible')
      .select('odometro')
      .eq('vehiculo_id', vehiculoId)
      .eq('estado', 'activo')
      .order('odometro', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (err) throw err
    return data?.odometro ?? null
  }

  /** Sube la factura y mueve el puntero de versión vigente — mismo patrón "con historial" que
   * `adjuntarPoliza`/`adjuntarLicencia` (research.md R3): nunca sobreescribe una versión
   * anterior, inserta una nueva fila en `archivos` y actualiza `factura_archivo_id`. */
  async function adjuntarFactura(cargaId: string, archivo: File) {
    error.value = null
    const empresaId = usuario.value!.empresa_id!
    const ruta = `factura/${empresaId}/${cargaId}/${nombreArchivoUnico(archivo.name)}`

    const { error: errSubida } = await client.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type })
    if (errSubida) {
      error.value = 'No se pudo subir el archivo de factura.'
      throw errSubida
    }

    const { data: archivoRow, error: errArchivo } = await client
      .from('archivos')
      .insert({
        empresa_id: empresaId,
        tipo: 'factura',
        storage_path: ruta,
        entidad_tipo: 'carga_combustible',
        entidad_id: cargaId,
        subido_por: usuario.value!.id
      })
      .select('id')
      .single()
    if (errArchivo) {
      error.value = errArchivo.message
      throw errArchivo
    }

    const { error: errUpdate } = await client
      .from('cargas_combustible')
      .update({ factura_archivo_id: archivoRow.id })
      .eq('id', cargaId)
    if (errUpdate) {
      error.value = errUpdate.message
      throw errUpdate
    }
  }

  async function listarHistorialFactura(cargaId: string) {
    const { data, error: err } = await client
      .from('archivos')
      .select('*, usuarios(nombre)')
      .eq('entidad_tipo', 'carga_combustible')
      .eq('entidad_id', cargaId)
      .eq('tipo', 'factura')
      .order('created_at', { ascending: false })
    if (err) throw err
    return (data ?? []) as unknown as (ArchivoRow & { usuarios: { nombre: string } | null })[]
  }

  async function descargarArchivo(storagePath: string, nombreDescarga?: string) {
    const { data, error: err } = await client.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60, { download: nombreDescarga ?? true })
    if (err) throw err
    return data.signedUrl
  }

  async function verArchivo(storagePath: string) {
    const { data, error: err } = await client.storage.from(BUCKET).createSignedUrl(storagePath, 60)
    if (err) throw err
    return data.signedUrl
  }

  type Filtros = {
    vehiculoId?: string
    fechaDesde?: string
    fechaHasta?: string
    proveedorId?: string
    estado?: EstadoRegistro
  }

  async function listar(filtros: Filtros = {}) {
    cargando.value = true
    error.value = null
    let query = client
      .from('cargas_combustible')
      .select('*, vehiculos(placa, marca, modelo), proveedores(nombre)')
      .order('fecha', { ascending: false })
    if (filtros.vehiculoId) query = query.eq('vehiculo_id', filtros.vehiculoId)
    if (filtros.fechaDesde) query = query.gte('fecha', filtros.fechaDesde)
    if (filtros.fechaHasta) query = query.lte('fecha', filtros.fechaHasta)
    if (filtros.proveedorId) query = query.eq('proveedor_id', filtros.proveedorId)
    if (filtros.estado) query = query.eq('estado', filtros.estado)
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = (data ?? []) as unknown as CargaListado[]
  }

  async function cancelar(id: string, motivo: string) {
    error.value = null
    const { error: err } = await client
      .from('cargas_combustible')
      .update({ estado: 'cancelado', motivo_cancelacion: motivo })
      .eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  return {
    registros,
    cargando,
    error,
    crear,
    obtenerUltimoOdometroActivo,
    adjuntarFactura,
    listarHistorialFactura,
    descargarArchivo,
    verArchivo,
    listar,
    cancelar
  }
}

export type { CargaCombustibleRow, CargaListado, ArchivoRow }
