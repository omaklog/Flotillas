import type { Database } from '~/types/database.types'
import { nombreArchivoUnico } from '~/utils/archivos'

type MantenimientoRow = Database['public']['Tables']['mantenimientos']['Row']
type MantenimientoInsert = Database['public']['Tables']['mantenimientos']['Insert']
type MantenimientoDetalleInsert = Database['public']['Tables']['mantenimiento_detalles']['Insert']
type ArchivoRow = Database['public']['Tables']['archivos']['Row']
type EstadoRegistro = Database['public']['Enums']['estado_registro']
type MantenimientoListado = MantenimientoRow & {
  vehiculos: { placa: string; marca: string; modelo: string } | null
  proveedores: { nombre: string } | null
  mantenimiento_detalles: { count: number }[]
}

const BUCKET = 'documentos'

type LineaValores = Omit<MantenimientoDetalleInsert, 'empresa_id' | 'mantenimiento_id'>

/**
 * CRUD de órdenes de mantenimiento (contracts/mantenimiento.md): sin `server/api/` intermedio
 * (research.md R7). Sin `editar`/`eliminar` — el registro es inmutable salvo cancelación
 * (FR-010/FR-017). Sin `obtener(id)` — el detalle consulta directo (tasks.md "Lecciones").
 */
export function useMantenimientos() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const registros = useState<MantenimientoListado[]>('mantenimientos:listado', () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  /** Orden primero, líneas en un solo `insert` masivo después (research.md R13) — sin
   * transacción entre ambos pasos. Si el segundo falla, devuelve el error junto con el id de la
   * orden ya creada para poder reintentar (`reintentarLineas`), sin duplicarla. */
  async function crear(valores: Omit<MantenimientoInsert, 'empresa_id' | 'creado_por'>, lineas: LineaValores[]) {
    error.value = null
    const { data, error: errOrden } = await client
      .from('mantenimientos')
      .insert({ ...valores, empresa_id: usuario.value!.empresa_id!, creado_por: usuario.value!.id })
      .select('id')
      .single()
    if (errOrden) {
      error.value = errOrden.message
      throw errOrden
    }
    const mantenimientoId = data.id as string

    try {
      await reintentarLineas(mantenimientoId, lineas)
    } catch (errLineas) {
      return { mantenimientoId, lineasFallaron: true, error: errLineas }
    }
    return { mantenimientoId, lineasFallaron: false }
  }

  async function reintentarLineas(mantenimientoId: string, lineas: LineaValores[]) {
    error.value = null
    const empresaId = usuario.value!.empresa_id!
    const { error: errLineas } = await client.from('mantenimiento_detalles').insert(
      lineas.map((l) => ({ ...l, empresa_id: empresaId, mantenimiento_id: mantenimientoId }))
    )
    if (errLineas) {
      error.value = errLineas.message
      throw errLineas
    }
  }

  /** Sube la factura y mueve el puntero de versión vigente — mismo patrón "con historial" que
   * Combustible (research.md R3). */
  async function adjuntarFactura(mantenimientoId: string, archivo: File) {
    error.value = null
    const empresaId = usuario.value!.empresa_id!
    const ruta = `factura/${empresaId}/${mantenimientoId}/${nombreArchivoUnico(archivo.name)}`

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
        entidad_tipo: 'mantenimiento',
        entidad_id: mantenimientoId,
        subido_por: usuario.value!.id
      })
      .select('id')
      .single()
    if (errArchivo) {
      error.value = errArchivo.message
      throw errArchivo
    }

    const { error: errUpdate } = await client
      .from('mantenimientos')
      .update({ factura_archivo_id: archivoRow.id })
      .eq('id', mantenimientoId)
    if (errUpdate) {
      error.value = errUpdate.message
      throw errUpdate
    }
  }

  async function listarHistorialFactura(mantenimientoId: string) {
    const { data, error: err } = await client
      .from('archivos')
      .select('*, usuarios(nombre)')
      .eq('entidad_tipo', 'mantenimiento')
      .eq('entidad_id', mantenimientoId)
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
    tipo?: Database['public']['Enums']['tipo_mantenimiento']
    fechaDesde?: string
    fechaHasta?: string
    proveedorId?: string
    estado?: EstadoRegistro
  }

  async function listar(filtros: Filtros = {}) {
    cargando.value = true
    error.value = null
    let query = client
      .from('mantenimientos')
      .select('*, vehiculos(placa, marca, modelo), proveedores(nombre), mantenimiento_detalles(count)')
      .order('fecha', { ascending: false })
    if (filtros.vehiculoId) query = query.eq('vehiculo_id', filtros.vehiculoId)
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
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
    registros.value = (data ?? []) as unknown as MantenimientoListado[]
  }

  async function cancelar(id: string, motivo: string) {
    error.value = null
    const { error: err } = await client
      .from('mantenimientos')
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
    reintentarLineas,
    adjuntarFactura,
    listarHistorialFactura,
    descargarArchivo,
    verArchivo,
    listar,
    cancelar
  }
}

export type { MantenimientoRow, MantenimientoListado, ArchivoRow, LineaValores }
