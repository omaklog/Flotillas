import type { Database } from '~/types/database.types'
import { nombreArchivoUnico } from '~/utils/archivos'

type ServicioRow = Database['public']['Tables']['servicios_obligatorios']['Row']
type ServicioInsert = Database['public']['Tables']['servicios_obligatorios']['Insert']
type ServicioUpdate = Database['public']['Tables']['servicios_obligatorios']['Update']
type ArchivoRow = Database['public']['Tables']['archivos']['Row']
type TipoServicio = Database['public']['Enums']['tipo_servicio_obligatorio']
type ServicioListado = ServicioRow & {
  vehiculos: { placa: string; marca: string; modelo: string } | null
}

const BUCKET = 'documentos'

/**
 * CRUD de servicios obligatorios (contracts/servicios-obligatorios.md): sin `server/api/`
 * intermedio, mismo criterio que el resto del proyecto. A diferencia de Combustible/
 * Mantenimiento/Checklist, esta feature SÍ tiene `editar`/`eliminar` libres (no inmutable,
 * FR-006/FR-007). El permiso real que desbloquea las 3 acciones de escritura es únicamente
 * `'editar'` (research.md R2) — `usePermisos().tienePermiso('servicios_obligatorios', 'editar')`
 * gatea registrar/editar/eliminar en la UI.
 */
export function useServiciosObligatorios() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const registros = useState<ServicioListado[]>('servicios-obligatorios:listado', () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  async function crear(valores: Omit<ServicioInsert, 'empresa_id'>) {
    error.value = null
    const { data, error: err } = await client
      .from('servicios_obligatorios')
      .insert({ ...valores, empresa_id: usuario.value!.empresa_id! })
      .select('id')
      .single()
    if (err) {
      error.value = err.message
      throw err
    }
    return data.id as string
  }

  async function editar(id: string, valores: ServicioUpdate) {
    error.value = null
    const { error: err } = await client.from('servicios_obligatorios').update(valores).eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  /** Sin dependientes que bloqueen la eliminación (FR-007, data-model.md) — si tenía comprobante
   * adjunto, se limpia después de que la fila ya se eliminó (mismo patrón de limpieza que
   * `useConductores.eliminar()`/`useVehiculos.eliminar()`). */
  async function eliminar(id: string) {
    error.value = null
    const { data: servicio } = await client
      .from('servicios_obligatorios')
      .select('archivo_id')
      .eq('id', id)
      .single()

    const { error: err } = await client.from('servicios_obligatorios').delete().eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }

    if (servicio?.archivo_id) {
      const { data: archivo } = await client
        .from('archivos')
        .select('storage_path')
        .eq('id', servicio.archivo_id)
        .maybeSingle()
      await client.from('archivos').delete().eq('id', servicio.archivo_id)
      if (archivo) {
        await client.storage.from(BUCKET).remove([archivo.storage_path])
      }
    }
  }

  /** Sube el comprobante y reemplaza el anterior — SIN historial de versiones (research.md R4,
   * a diferencia de `adjuntarPoliza`/`adjuntarFactura`): cada fila de `servicios_obligatorios` ya
   * es un evento puntual, un único comprobante vigente por fila. El anterior (si había) se borra
   * solo *después* de que el nuevo ya quedó vinculado exitosamente, mismo criterio que
   * `adjuntarFoto()`. */
  async function adjuntarComprobante(servicioId: string, archivo: File) {
    error.value = null
    const empresaId = usuario.value!.empresa_id!
    const ruta = `testigo_servicio/${empresaId}/${servicioId}/${nombreArchivoUnico(archivo.name)}`

    const { data: servicioActual } = await client
      .from('servicios_obligatorios')
      .select('archivo_id')
      .eq('id', servicioId)
      .single()
    const archivoAnteriorId = servicioActual?.archivo_id ?? null

    const { error: errSubida } = await client.storage
      .from(BUCKET)
      .upload(ruta, archivo, { contentType: archivo.type })
    if (errSubida) {
      error.value = 'No se pudo subir el comprobante.'
      throw errSubida
    }

    const { data: archivoRow, error: errArchivo } = await client
      .from('archivos')
      .insert({
        empresa_id: empresaId,
        tipo: 'testigo_servicio',
        storage_path: ruta,
        entidad_tipo: 'servicio_obligatorio',
        entidad_id: servicioId,
        subido_por: usuario.value!.id
      })
      .select('id')
      .single()
    if (errArchivo) {
      error.value = errArchivo.message
      throw errArchivo
    }

    const { error: errUpdate } = await client
      .from('servicios_obligatorios')
      .update({ archivo_id: archivoRow.id })
      .eq('id', servicioId)
    if (errUpdate) {
      error.value = errUpdate.message
      throw errUpdate
    }

    if (archivoAnteriorId) {
      const { data: anterior } = await client
        .from('archivos')
        .select('storage_path')
        .eq('id', archivoAnteriorId)
        .maybeSingle()
      await client.from('archivos').delete().eq('id', archivoAnteriorId)
      if (anterior) {
        await client.storage.from(BUCKET).remove([anterior.storage_path])
      }
    }
  }

  async function obtenerComprobante(servicioId: string) {
    const { data, error: err } = await client
      .from('archivos')
      .select('*')
      .eq('entidad_tipo', 'servicio_obligatorio')
      .eq('entidad_id', servicioId)
      .eq('tipo', 'testigo_servicio')
      .maybeSingle()
    if (err) throw err
    return data as ArchivoRow | null
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
    tipo?: TipoServicio
    fechaDesde?: string
    fechaHasta?: string
  }

  async function listar(filtros: Filtros = {}) {
    cargando.value = true
    error.value = null
    let query = client
      .from('servicios_obligatorios')
      .select('*, vehiculos(placa, marca, modelo)')
      .order('fecha_vencimiento', { ascending: true })
    if (filtros.vehiculoId) query = query.eq('vehiculo_id', filtros.vehiculoId)
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
    if (filtros.fechaDesde) query = query.gte('fecha_realizado', filtros.fechaDesde)
    if (filtros.fechaHasta) query = query.lte('fecha_realizado', filtros.fechaHasta)
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = (data ?? []) as unknown as ServicioListado[]
  }

  return {
    registros,
    cargando,
    error,
    crear,
    editar,
    eliminar,
    adjuntarComprobante,
    obtenerComprobante,
    descargarArchivo,
    verArchivo,
    listar
  }
}

export type { ServicioRow, ServicioListado, ArchivoRow }
