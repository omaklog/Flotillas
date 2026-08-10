import type { Database } from '~/types/database.types'

type AsignacionRow = Database['public']['Tables']['asignaciones_conductor_vehiculo']['Row']
type AsignacionConConductor = AsignacionRow & {
  conductores: { nombre: string; apellidos: string } | null
}
type AsignacionConVehiculo = AsignacionRow & {
  vehiculos: { marca: string; modelo: string; placa: string } | null
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * CRUD de asignaciones_conductor_vehiculo (contracts/asignaciones.md): sin `server/api/`
 * intermedio (research.md R6). Un solo mutador `asignar()` cubre los 3 flujos de UI de la spec
 * (research.md R4) — las reglas de advertencia/confirmación son lecturas previas + decisiones de
 * UI, resueltas por quien llama a este composable, no lógica de escritura distinta por punto de
 * entrada.
 */
export function useAsignaciones() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const error = ref<string | null>(null)

  async function listarHistorialVehiculo(vehiculoId: string) {
    const { data, error: err } = await client
      .from('asignaciones_conductor_vehiculo')
      .select('*, conductores(nombre, apellidos)')
      .eq('vehiculo_id', vehiculoId)
      .order('fecha_inicio', { ascending: false })
      .order('created_at', { ascending: false })
    if (err) throw err
    return (data ?? []) as unknown as AsignacionConConductor[]
  }

  async function listarHistorialConductor(conductorId: string) {
    const { data, error: err } = await client
      .from('asignaciones_conductor_vehiculo')
      .select('*, vehiculos(marca, modelo, placa)')
      .eq('conductor_id', conductorId)
      .order('fecha_inicio', { ascending: false })
      .order('created_at', { ascending: false })
    if (err) throw err
    return (data ?? []) as unknown as AsignacionConVehiculo[]
  }

  async function listarVehiculosActivosDeConductor(conductorId: string) {
    const { data, error: err } = await client
      .from('asignaciones_conductor_vehiculo')
      .select('*, vehiculos(marca, modelo, placa)')
      .eq('conductor_id', conductorId)
      .is('fecha_fin', null)
    if (err) throw err
    return (data ?? []) as unknown as AsignacionConVehiculo[]
  }

  /** Para la confirmación fuerte de FR-006: ¿este vehículo ya tiene otro conductor activo? */
  async function obtenerAsignacionActivaDeVehiculo(vehiculoId: string) {
    const { data, error: err } = await client
      .from('asignaciones_conductor_vehiculo')
      .select('id, conductor_id, conductores(nombre, apellidos)')
      .eq('vehiculo_id', vehiculoId)
      .is('fecha_fin', null)
      .maybeSingle()
    if (err) throw err
    return data as unknown as
      | (Pick<AsignacionRow, 'id' | 'conductor_id'> & {
          conductores: { nombre: string; apellidos: string } | null
        })
      | null
  }

  /** Para el indicador "Sin conductor" del listado de vehículos (FR-013, research.md R5) — no un
   * `select` anidado con filtro embebido, dos consultas simples cruzadas en el cliente. */
  async function listarVehiculosConAsignacionActiva(vehiculoIds: string[]) {
    if (vehiculoIds.length === 0) return []
    const { data, error: err } = await client
      .from('asignaciones_conductor_vehiculo')
      .select('vehiculo_id')
      .in('vehiculo_id', vehiculoIds)
      .is('fecha_fin', null)
    if (err) throw err
    return (data ?? []).map((fila) => fila.vehiculo_id)
  }

  /** Cierra la asignación activa del vehículo (si la había) y crea la nueva — la misma operación
   * para los 3 flujos de la spec (research.md R4); las reglas de advertencia/confirmación ya se
   * resolvieron en la UI antes de llamar a esta función. */
  async function asignar(vehiculoId: string, conductorId: string) {
    error.value = null
    const { data: activa, error: errActiva } = await client
      .from('asignaciones_conductor_vehiculo')
      .select('id')
      .eq('vehiculo_id', vehiculoId)
      .is('fecha_fin', null)
      .maybeSingle()
    if (errActiva) {
      error.value = errActiva.message
      throw errActiva
    }

    if (activa) {
      const { error: errCierre } = await client
        .from('asignaciones_conductor_vehiculo')
        .update({ fecha_fin: hoy() })
        .eq('id', activa.id)
      if (errCierre) {
        error.value = errCierre.message
        throw errCierre
      }
    }

    const { error: errInsert } = await client.from('asignaciones_conductor_vehiculo').insert({
      empresa_id: usuario.value!.empresa_id!,
      vehiculo_id: vehiculoId,
      conductor_id: conductorId,
      asignado_por: usuario.value!.id
    })
    if (errInsert) {
      error.value = errInsert.message
      throw errInsert
    }
  }

  /** Finaliza una asignación activa sin reemplazarla (FR-008). */
  async function finalizar(asignacionId: string) {
    error.value = null
    const { error: err } = await client
      .from('asignaciones_conductor_vehiculo')
      .update({ fecha_fin: hoy() })
      .eq('id', asignacionId)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  return {
    error,
    listarHistorialVehiculo,
    listarHistorialConductor,
    listarVehiculosActivosDeConductor,
    obtenerAsignacionActivaDeVehiculo,
    listarVehiculosConAsignacionActiva,
    asignar,
    finalizar
  }
}

export type { AsignacionRow, AsignacionConConductor, AsignacionConVehiculo }
