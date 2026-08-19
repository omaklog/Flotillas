import type { Database } from '~/types/database.types'

/**
 * Dashboard (data-model.md § Consultas del dashboard, contracts/alertas-dashboard.md): un método
 * de solo lectura por sección, cada uno con su propia consulta. Sin gate de permisos explícito
 * (research.md R6) — cada tabla hereda su propia RLS; si el usuario actual no tiene `ver` en el
 * módulo de origen, la consulta simplemente devuelve 0 filas (FR-012), nunca un error.
 */

const VENTANA_DIAS = 30

function fechaEnDiasISO(dias: number): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

function primerDiaMesISO(): string {
  const hoy = new Date()
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10)
}

function ultimoDiaMesISO(): string {
  const hoy = new Date()
  return new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().slice(0, 10)
}

export function useDashboard() {
  const client = useSupabaseClient<Database>()

  async function contarVehiculosActivos(): Promise<number> {
    const { count, error } = await client
      .from('vehiculos')
      .select('*', { count: 'exact', head: true })
      .eq('baja', false)
    if (error) throw error
    return count ?? 0
  }

  async function contarLicenciasPorVencer(): Promise<number> {
    const { count, error } = await client
      .from('conductores')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true)
      .lte('fecha_vencimiento_licencia', fechaEnDiasISO(VENTANA_DIAS))
    if (error) throw error
    return count ?? 0
  }

  async function contarPolizasPorVencer(): Promise<number> {
    const { count, error } = await client
      .from('vehiculos')
      .select('*', { count: 'exact', head: true })
      .eq('baja', false)
      .not('fecha_vencimiento_poliza', 'is', null)
      .lte('fecha_vencimiento_poliza', fechaEnDiasISO(VENTANA_DIAS))
    if (error) throw error
    return count ?? 0
  }

  /** R8: alertas tipo `checklist` abiertas creadas en los últimos 30 días. */
  async function contarChecklistsSinAtender(): Promise<number> {
    const { count, error } = await client
      .from('alertas')
      .select('*', { count: 'exact', head: true })
      .eq('tipo', 'checklist')
      .in('estado', ['pendiente', 'enviada'])
      .gte('created_at', fechaEnDiasISO(-VENTANA_DIAS))
    if (error) throw error
    return count ?? 0
  }

  /** PostgREST no agrega `sum()...group by` directo — se trae lo mínimo (tipo + costo_total) y
   * se agrega en JS (contracts/alertas-dashboard.md § useDashboard.ts). */
  async function montosMantenimientoPorTipo(): Promise<{ correctivo: number; preventivo: number }> {
    const { data, error } = await client
      .from('mantenimientos')
      .select('tipo, costo_total')
      .eq('estado', 'activo')
      .gte('fecha', fechaEnDiasISO(-VENTANA_DIAS))
    if (error) throw error
    return (data ?? []).reduce(
      (acumulado, fila) => {
        acumulado[fila.tipo] += fila.costo_total
        return acumulado
      },
      { correctivo: 0, preventivo: 0 }
    )
  }

  async function licenciasPorVencerMesActual(): Promise<{ porVencer: number; totalActivos: number }> {
    const [{ count: porVencer, error: errorPorVencer }, { count: totalActivos, error: errorTotal }] =
      await Promise.all([
        client
          .from('conductores')
          .select('*', { count: 'exact', head: true })
          .eq('activo', true)
          .gte('fecha_vencimiento_licencia', primerDiaMesISO())
          .lte('fecha_vencimiento_licencia', ultimoDiaMesISO()),
        client.from('conductores').select('*', { count: 'exact', head: true }).eq('activo', true)
      ])
    if (errorPorVencer) throw errorPorVencer
    if (errorTotal) throw errorTotal
    return { porVencer: porVencer ?? 0, totalActivos: totalActivos ?? 0 }
  }

  async function polizasPorVencerMesActual(): Promise<{ porVencer: number; totalActivos: number }> {
    const [{ count: porVencer, error: errorPorVencer }, { count: totalActivos, error: errorTotal }] =
      await Promise.all([
        client
          .from('vehiculos')
          .select('*', { count: 'exact', head: true })
          .eq('baja', false)
          .not('fecha_vencimiento_poliza', 'is', null)
          .gte('fecha_vencimiento_poliza', primerDiaMesISO())
          .lte('fecha_vencimiento_poliza', ultimoDiaMesISO()),
        client.from('vehiculos').select('*', { count: 'exact', head: true }).eq('baja', false)
      ])
    if (errorPorVencer) throw errorPorVencer
    if (errorTotal) throw errorTotal
    return { porVencer: porVencer ?? 0, totalActivos: totalActivos ?? 0 }
  }

  async function cumplimientoChecklistsPorTipoVehiculo(): Promise<
    { tipoVehiculo: string; aprobados: number; conObservaciones: number }[]
  > {
    const { data, error } = await client
      .from('checklists')
      .select('resultado, tipos_vehiculo(nombre)')
      .gte('fecha', fechaEnDiasISO(-VENTANA_DIAS))
    if (error) throw error

    const porTipo = new Map<string, { aprobados: number; conObservaciones: number }>()
    for (const fila of data ?? []) {
      const nombreTipo = fila.tipos_vehiculo?.nombre ?? 'Sin tipo'
      const acumulado = porTipo.get(nombreTipo) ?? { aprobados: 0, conObservaciones: 0 }
      if (fila.resultado === 'aprobado') acumulado.aprobados++
      else acumulado.conObservaciones++
      porTipo.set(nombreTipo, acumulado)
    }
    return Array.from(porTipo.entries()).map(([tipoVehiculo, valores]) => ({ tipoVehiculo, ...valores }))
  }

  return {
    contarVehiculosActivos,
    contarLicenciasPorVencer,
    contarPolizasPorVencer,
    contarChecklistsSinAtender,
    montosMantenimientoPorTipo,
    licenciasPorVencerMesActual,
    polizasPorVencerMesActual,
    cumplimientoChecklistsPorTipoVehiculo
  }
}
