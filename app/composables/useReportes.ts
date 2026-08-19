import type { Database } from '~/types/database.types'

/**
 * Reportes (contracts/reportes.md, data-model.md): un método de solo lectura por reporte,
 * mismo patrón que `useDashboard.ts` — consulta Supabase directa + agregación en JS donde
 * PostgREST no puede expresarla. Sin `crear`/`editar`/`eliminar`. RLS ya garantiza que un
 * usuario sin `ver` en el módulo de origen recibe 0 filas (Edge Cases de spec.md), así que
 * ningún método necesita lógica de permisos propia más allá de lo que la página ya verifica
 * con `usePermisos.ts` antes de montar la sección (FR-002).
 */

type TipoMantenimiento = Database['public']['Enums']['tipo_mantenimiento']
type UnidadCombustible = Database['public']['Enums']['unidad_combustible']

export type RangoFechas = { desde?: string; hasta?: string }
export type FiltrosReporte = RangoFechas & { vehiculoId?: string }

export type ReporteClave =
  | 'reporte_mantenimiento'
  | 'reporte_combustible'
  | 'reporte_vencimientos'
  | 'reporte_cumplimiento'

function fechaISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

function fechaEnDiasISO(dias: number): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fechaISO(fecha)
}

function primerDiaMesISO(): string {
  const hoy = new Date()
  return fechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
}

function ultimoDiaMesISO(): string {
  const hoy = new Date()
  return fechaISO(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))
}

function primerDiaMesAnteriorISO(): string {
  const hoy = new Date()
  return fechaISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1))
}

function ultimoDiaMesAnteriorISO(): string {
  const hoy = new Date()
  return fechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 0))
}

/** Atajos de UI del selector de periodo compartido (FR-003). */
export function atajoUltimos30Dias(): RangoFechas {
  return { desde: fechaEnDiasISO(-30), hasta: fechaISO(new Date()) }
}

export function atajoMesActual(): RangoFechas {
  return { desde: primerDiaMesISO(), hasta: ultimoDiaMesISO() }
}

export function atajoMesAnterior(): RangoFechas {
  return { desde: primerDiaMesAnteriorISO(), hasta: ultimoDiaMesAnteriorISO() }
}

/**
 * FR-004: rechaza con mensaje claro cualquier rango donde "desde" sea posterior a "hasta".
 * Los 4 métodos de reporte MUST llamarlo como primer paso (contracts/reportes.md).
 */
export function validarRango(rango: RangoFechas): void {
  if (rango.desde && rango.hasta && rango.desde > rango.hasta) {
    throw new Error('La fecha "desde" no puede ser posterior a la fecha "hasta".')
  }
}

export interface RegistrarExportacionInput {
  reporte: ReporteClave
  formato: 'excel' | 'pdf'
  filtros: FiltrosReporte
}

/**
 * FR-017: registra la exportación en la bitácora de auditoría vía el endpoint privilegiado
 * (server/api/reportes/auditar-exportacion.post.ts, research.md R4). Un fallo de este
 * endpoint MUST NOT impedir ni revertir la descarga ya iniciada — solo se loggea
 * (contracts/reportes.md).
 */
export async function registrarExportacion(input: RegistrarExportacionInput): Promise<void> {
  try {
    await $fetch('/api/reportes/auditar-exportacion', { method: 'POST', body: input })
  } catch (err) {
    console.error('No se pudo registrar la auditoría de exportación:', err)
  }
}

export interface FilaCostoMantenimiento {
  vehiculoId: string
  vehiculoLabel: string
  tipo: TipoMantenimiento
  costoTotal: number
}

export interface ReporteCostosMantenimiento {
  total: number
  porTipo: { correctivo: number; preventivo: number }
  porVehiculo: FilaCostoMantenimiento[]
}

export interface FilaCombustible {
  vehiculoId: string
  fecha: string
  odometro: number
  cantidad: number
  costoTotal: number
  /** `null` = "N/D" (FR-008) — solo la primera carga activa de toda la historia del vehículo. */
  rendimiento: number | null
}

export interface VehiculoCombustible {
  vehiculoId: string
  vehiculoLabel: string
  totalCantidad: number
  totalCosto: number
  /** Promedio de `rendimiento` no nulo entre las cargas visibles de este vehículo, o `null`. */
  rendimientoPromedio: number | null
  cargas: FilaCombustible[]
}

export interface ReporteCombustible {
  total: { cantidad: number; costo: number }
  porVehiculo: VehiculoCombustible[]
}

export type TipoVencimiento = 'licencia' | 'poliza' | 'permiso'
export type EstadoVencimiento = 'vigente' | 'por_vencer' | 'vencido'

export interface FilaVencimiento {
  tipo: TipoVencimiento
  entidadLabel: string
  fechaVencimiento: string
  estado: EstadoVencimiento
}

export interface FilaCumplimientoChecklist {
  tipoVehiculoId: string
  tipoVehiculoNombre: string
  /** 0-100, redondeado. `null` = "Sin datos" (ningún checklist en el rango) — nunca 0. */
  porcentajeAprobado: number | null
}

export interface FilaCumplimientoServicio {
  tipoVehiculoId: string
  tipoVehiculoNombre: string
  /** 0-100, redondeado. `null` = "Sin datos" (ningún servicio obligatorio registrado). */
  porcentajeVigente: number | null
}

export interface ReporteCumplimiento {
  checklists: FilaCumplimientoChecklist[]
  serviciosObligatorios: FilaCumplimientoServicio[]
}

export function useReportes() {
  const client = useSupabaseClient<Database>()

  /**
   * US-13.1 (contracts/reportes.md, data-model.md § FilaCostoMantenimiento): solo órdenes
   * `estado='activo'`, agrupadas por tipo y por vehículo (FR-005). El desglose por vehículo
   * MUST NOT incluir vehículos sin movimientos en el rango — se logra de forma natural: solo
   * se agregan filas para combinaciones vehículo+tipo que sí aparecieron en la respuesta.
   */
  async function reporteCostosMantenimiento(
    filtros: FiltrosReporte
  ): Promise<ReporteCostosMantenimiento> {
    validarRango(filtros)

    let query = client
      .from('mantenimientos')
      .select('vehiculo_id, tipo, costo_total, vehiculos(marca, modelo, placa)')
      .eq('estado', 'activo')
    if (filtros.desde) query = query.gte('fecha', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha', filtros.hasta)
    if (filtros.vehiculoId) query = query.eq('vehiculo_id', filtros.vehiculoId)

    const { data, error } = await query
    if (error) throw error

    const porTipo = { correctivo: 0, preventivo: 0 }
    const porVehiculoMapa = new Map<string, FilaCostoMantenimiento>()

    for (const fila of data ?? []) {
      porTipo[fila.tipo] += fila.costo_total
      const vehiculoLabel = fila.vehiculos
        ? `${fila.vehiculos.marca} ${fila.vehiculos.modelo} — ${fila.vehiculos.placa}`
        : fila.vehiculo_id
      const clave = `${fila.vehiculo_id}|${fila.tipo}`
      const existente = porVehiculoMapa.get(clave)
      if (existente) {
        existente.costoTotal += fila.costo_total
      } else {
        porVehiculoMapa.set(clave, {
          vehiculoId: fila.vehiculo_id,
          vehiculoLabel,
          tipo: fila.tipo,
          costoTotal: fila.costo_total
        })
      }
    }

    return {
      total: porTipo.correctivo + porTipo.preventivo,
      porTipo,
      porVehiculo: Array.from(porVehiculoMapa.values())
    }
  }

  /** FR-006: la cantidad del reporte de combustible se etiqueta según la unidad configurada
   * por la empresa (`empresas.unidad_combustible`, Feature 001), sin conversión. */
  async function obtenerUnidadCombustible(empresaId: string): Promise<UnidadCombustible> {
    const { data, error } = await client
      .from('empresas')
      .select('unidad_combustible')
      .eq('id', empresaId)
      .single()
    if (error) throw error
    return data.unidad_combustible
  }

  /**
   * US-13.2 (contracts/reportes.md, data-model.md § FilaCombustible, research.md R1): el `LAG`
   * se calcula sobre TODA la historia activa del vehículo (sin filtrar por fecha en el query),
   * ordenada por vehículo y luego por fecha — el rango filtrado solo decide qué filas quedan
   * visibles/agregadas al final (Clarifications sesión 2026-08-19, Q1; FR-007/FR-008). Las
   * cargas canceladas ni siquiera se traen (excluidas del cálculo por completo). Solo vehículos
   * con ≥1 carga visible en el rango aparecen en `porVehiculo` (misma regla que FR-005/FR-006).
   */
  async function reporteCombustible(filtros: FiltrosReporte): Promise<ReporteCombustible> {
    validarRango(filtros)

    let query = client
      .from('cargas_combustible')
      .select('vehiculo_id, fecha, odometro, cantidad, costo_total, vehiculos(marca, modelo, placa)')
      .eq('estado', 'activo')
      .order('vehiculo_id', { ascending: true })
      .order('fecha', { ascending: true })
    if (filtros.vehiculoId) query = query.eq('vehiculo_id', filtros.vehiculoId)

    const { data, error } = await query
    if (error) throw error

    const porVehiculoMapa = new Map<string, VehiculoCombustible>()
    let vehiculoActualId: string | null = null
    let odometroAnterior: number | null = null

    for (const fila of data ?? []) {
      if (fila.vehiculo_id !== vehiculoActualId) {
        vehiculoActualId = fila.vehiculo_id
        odometroAnterior = null
      }

      const rendimiento = odometroAnterior === null ? null : (fila.odometro - odometroAnterior) / fila.cantidad
      odometroAnterior = fila.odometro

      const enRango =
        (!filtros.desde || fila.fecha >= filtros.desde) && (!filtros.hasta || fila.fecha <= filtros.hasta)
      if (!enRango) continue

      const vehiculoLabel = fila.vehiculos
        ? `${fila.vehiculos.marca} ${fila.vehiculos.modelo} — ${fila.vehiculos.placa}`
        : fila.vehiculo_id

      const grupo = porVehiculoMapa.get(fila.vehiculo_id) ?? {
        vehiculoId: fila.vehiculo_id,
        vehiculoLabel,
        totalCantidad: 0,
        totalCosto: 0,
        rendimientoPromedio: null,
        cargas: []
      }
      grupo.totalCantidad += fila.cantidad
      grupo.totalCosto += fila.costo_total
      grupo.cargas.push({
        vehiculoId: fila.vehiculo_id,
        fecha: fila.fecha,
        odometro: fila.odometro,
        cantidad: fila.cantidad,
        costoTotal: fila.costo_total,
        rendimiento
      })
      porVehiculoMapa.set(fila.vehiculo_id, grupo)
    }

    let totalCantidad = 0
    let totalCosto = 0
    for (const grupo of porVehiculoMapa.values()) {
      const rendimientosValidos = grupo.cargas
        .map((carga) => carga.rendimiento)
        .filter((r): r is number => r !== null)
      grupo.rendimientoPromedio =
        rendimientosValidos.length > 0
          ? rendimientosValidos.reduce((suma, valor) => suma + valor, 0) / rendimientosValidos.length
          : null
      totalCantidad += grupo.totalCantidad
      totalCosto += grupo.totalCosto
    }

    return {
      total: { cantidad: totalCantidad, costo: totalCosto },
      porVehiculo: Array.from(porVehiculoMapa.values())
    }
  }

  /**
   * US-13.3 (contracts/reportes.md, data-model.md § FilaVencimiento): 3 queries independientes
   * (licencias, pólizas, permisos), ninguna filtra por `activo`/`baja` (FR-010 — reporte
   * histórico). El rango filtra por `fecha_vencimiento`, ambos extremos opcionales e
   * independientes (FR-009) — "desde" vacío incluye todo lo ya vencido sin importar
   * antigüedad, "hasta" vacío incluye todo lo que vence en adelante sin límite. `estado` usa
   * el mismo umbral de 60 días ya establecido en Vehículos/Conductores, siempre relativo a
   * **hoy**, no al rango filtrado.
   */
  async function reporteVencimientos(rango: RangoFechas): Promise<FilaVencimiento[]> {
    validarRango(rango)

    const hoy = fechaISO(new Date())
    const limitePorVencer = fechaEnDiasISO(60)

    function estadoDe(fechaVencimiento: string): EstadoVencimiento {
      if (fechaVencimiento < hoy) return 'vencido'
      if (fechaVencimiento <= limitePorVencer) return 'por_vencer'
      return 'vigente'
    }

    let queryLicencias = client
      .from('conductores')
      .select('nombre, apellidos, numero_licencia, fecha_vencimiento_licencia')
    if (rango.desde) queryLicencias = queryLicencias.gte('fecha_vencimiento_licencia', rango.desde)
    if (rango.hasta) queryLicencias = queryLicencias.lte('fecha_vencimiento_licencia', rango.hasta)

    let queryPolizas = client
      .from('vehiculos')
      .select('placa, numero_poliza, fecha_vencimiento_poliza')
      .not('fecha_vencimiento_poliza', 'is', null)
    if (rango.desde) queryPolizas = queryPolizas.gte('fecha_vencimiento_poliza', rango.desde)
    if (rango.hasta) queryPolizas = queryPolizas.lte('fecha_vencimiento_poliza', rango.hasta)

    let queryPermisos = client
      .from('vehiculo_permisos')
      .select('fecha_vencimiento, permisos(nombre), vehiculos(placa)')
      .not('fecha_vencimiento', 'is', null)
    if (rango.desde) queryPermisos = queryPermisos.gte('fecha_vencimiento', rango.desde)
    if (rango.hasta) queryPermisos = queryPermisos.lte('fecha_vencimiento', rango.hasta)

    const [licencias, polizas, permisos] = await Promise.all([queryLicencias, queryPolizas, queryPermisos])
    if (licencias.error) throw licencias.error
    if (polizas.error) throw polizas.error
    if (permisos.error) throw permisos.error

    const filas: FilaVencimiento[] = []

    for (const conductor of licencias.data ?? []) {
      filas.push({
        tipo: 'licencia',
        entidadLabel: `${conductor.nombre} ${conductor.apellidos} — Lic. ${conductor.numero_licencia}`,
        fechaVencimiento: conductor.fecha_vencimiento_licencia,
        estado: estadoDe(conductor.fecha_vencimiento_licencia)
      })
    }
    for (const vehiculo of polizas.data ?? []) {
      filas.push({
        tipo: 'poliza',
        entidadLabel: `${vehiculo.placa} — Póliza ${vehiculo.numero_poliza ?? 's/n'}`,
        fechaVencimiento: vehiculo.fecha_vencimiento_poliza!,
        estado: estadoDe(vehiculo.fecha_vencimiento_poliza!)
      })
    }
    for (const permiso of permisos.data ?? []) {
      const placa = permiso.vehiculos?.placa ?? ''
      const nombrePermiso = permiso.permisos?.nombre ?? 'Permiso'
      filas.push({
        tipo: 'permiso',
        entidadLabel: `${placa} — ${nombrePermiso}`,
        fechaVencimiento: permiso.fecha_vencimiento!,
        estado: estadoDe(permiso.fecha_vencimiento!)
      })
    }

    filas.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))
    return filas
  }

  /**
   * US-13.4 (contracts/reportes.md, data-model.md § FilaCumplimiento): dos sub-tablas
   * independientes, ambas agrupadas por **todos** los tipos de vehículo de la empresa (no solo
   * los que aparecen en los datos) — así un tipo de vehículo sin ningún checklist/servicio
   * obligatorio queda con `null` ("Sin datos") en vez de simplemente no aparecer (FR-011/
   * FR-012, Clarifications sesión 2026-08-19). Los checklists se filtran por `rango`; los
   * servicios obligatorios reflejan la vigencia **al momento de generar el reporte**, sin
   * filtrar por `rango` (FR-012).
   */
  async function reporteCumplimiento(rango: RangoFechas): Promise<ReporteCumplimiento> {
    validarRango(rango)

    const { data: tiposVehiculo, error: errorTipos } = await client.from('tipos_vehiculo').select('id, nombre')
    if (errorTipos) throw errorTipos

    let queryChecklists = client.from('checklists').select('tipo_vehiculo_id, resultado')
    if (rango.desde) queryChecklists = queryChecklists.gte('fecha', rango.desde)
    if (rango.hasta) queryChecklists = queryChecklists.lte('fecha', rango.hasta)

    const queryServicios = client
      .from('servicios_obligatorios')
      .select('fecha_vencimiento, vehiculos(tipo_vehiculo_id)')

    const [checklistsResp, serviciosResp] = await Promise.all([queryChecklists, queryServicios])
    if (checklistsResp.error) throw checklistsResp.error
    if (serviciosResp.error) throw serviciosResp.error

    const conteoChecklists = new Map<string, { aprobados: number; conObservaciones: number }>()
    for (const fila of checklistsResp.data ?? []) {
      const acumulado = conteoChecklists.get(fila.tipo_vehiculo_id) ?? { aprobados: 0, conObservaciones: 0 }
      if (fila.resultado === 'aprobado') acumulado.aprobados++
      else acumulado.conObservaciones++
      conteoChecklists.set(fila.tipo_vehiculo_id, acumulado)
    }

    const hoy = fechaISO(new Date())
    const conteoServicios = new Map<string, { vigentes: number; vencidos: number }>()
    for (const fila of serviciosResp.data ?? []) {
      const tipoVehiculoId = fila.vehiculos?.tipo_vehiculo_id
      if (!tipoVehiculoId) continue
      const acumulado = conteoServicios.get(tipoVehiculoId) ?? { vigentes: 0, vencidos: 0 }
      if (fila.fecha_vencimiento < hoy) acumulado.vencidos++
      else acumulado.vigentes++
      conteoServicios.set(tipoVehiculoId, acumulado)
    }

    const checklists: FilaCumplimientoChecklist[] = []
    const serviciosObligatorios: FilaCumplimientoServicio[] = []

    for (const tipo of tiposVehiculo ?? []) {
      const conteoChecklist = conteoChecklists.get(tipo.id)
      const totalChecklist = conteoChecklist ? conteoChecklist.aprobados + conteoChecklist.conObservaciones : 0
      checklists.push({
        tipoVehiculoId: tipo.id,
        tipoVehiculoNombre: tipo.nombre,
        porcentajeAprobado:
          totalChecklist > 0 ? Math.round((conteoChecklist!.aprobados / totalChecklist) * 100) : null
      })

      const conteoServicio = conteoServicios.get(tipo.id)
      const totalServicio = conteoServicio ? conteoServicio.vigentes + conteoServicio.vencidos : 0
      serviciosObligatorios.push({
        tipoVehiculoId: tipo.id,
        tipoVehiculoNombre: tipo.nombre,
        porcentajeVigente:
          totalServicio > 0 ? Math.round((conteoServicio!.vigentes / totalServicio) * 100) : null
      })
    }

    return { checklists, serviciosObligatorios }
  }

  return {
    validarRango,
    atajoUltimos30Dias,
    atajoMesActual,
    atajoMesAnterior,
    registrarExportacion,
    reporteCostosMantenimiento,
    reporteCombustible,
    obtenerUnidadCombustible,
    reporteVencimientos,
    reporteCumplimiento
  }
}
