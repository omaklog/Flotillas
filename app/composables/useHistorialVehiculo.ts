import { etiquetaTipo as etiquetaTipoServicio } from '~/utils/servicios-obligatorios'

type TipoEvento = 'combustible' | 'mantenimiento' | 'checklist' | 'servicio_obligatorio' | 'conductor'

type EventoHistorial = {
  id: string
  tipo: TipoEvento
  fecha: string
  resumen: string
  icono: string
  color: string
  rutaDetalle: string | null
}

/**
 * Línea de tiempo de un vehículo (contracts/historial-auditoria.md): NO es una consulta SQL
 * nueva — combina en paralelo las 5 fuentes ya existentes, cada una con su propio filtro de
 * RLS/permiso ya aplicado (research.md R2). Sin `crear`/`editar`/`eliminar` — es una vista
 * compuesta de solo lectura.
 */
export function useHistorialVehiculo() {
  const cargasCombustible = useCargasCombustible()
  const mantenimientos = useMantenimientos()
  const checklists = useChecklists()
  const serviciosObligatorios = useServiciosObligatorios()
  const asignaciones = useAsignaciones()

  const eventos = useState<EventoHistorial[]>('historial-vehiculo:eventos', () => [])
  const cargando = ref(false)

  async function listar(vehiculoId: string) {
    cargando.value = true

    const [, , , , historialConductor] = await Promise.all([
      cargasCombustible.listar({ vehiculoId }),
      mantenimientos.listar({ vehiculoId }),
      checklists.listar({ vehiculoId }),
      serviciosObligatorios.listar({ vehiculoId }),
      asignaciones.listarHistorialVehiculo(vehiculoId)
    ])

    const eventosCombustible: EventoHistorial[] = cargasCombustible.registros.value.map((c) => ({
      id: c.id,
      tipo: 'combustible',
      fecha: c.fecha,
      resumen:
        `Carga de combustible — ${c.cantidad} L — $${c.costo_total}` +
        (c.estado === 'cancelado' ? ' (cancelada)' : ''),
      icono: 'mdi-gas-station-outline',
      color: c.estado === 'cancelado' ? 'grey' : 'primary',
      rutaDetalle: `/admin/combustible/${c.id}`
    }))

    const eventosMantenimiento: EventoHistorial[] = mantenimientos.registros.value.map((m) => ({
      id: m.id,
      tipo: 'mantenimiento',
      fecha: m.fecha,
      resumen:
        `Mantenimiento ${m.tipo === 'preventivo' ? 'preventivo' : 'correctivo'} — $${m.costo_total}` +
        (m.estado === 'cancelado' ? ' (cancelada)' : ''),
      icono: 'mdi-wrench-outline',
      color: m.estado === 'cancelado' ? 'grey' : 'primary',
      rutaDetalle: `/admin/mantenimiento/${m.id}`
    }))

    const eventosChecklist: EventoHistorial[] = checklists.registros.value.map((c) => ({
      id: c.id,
      tipo: 'checklist',
      fecha: c.fecha,
      resumen: `Checklist — ${c.resultado === 'aprobado' ? 'Aprobado' : 'Con observaciones'}`,
      icono: 'mdi-clipboard-check-outline',
      color: c.resultado === 'aprobado' ? 'success' : 'warning',
      rutaDetalle: `/admin/checklist/${c.id}`
    }))

    const eventosServicio: EventoHistorial[] = serviciosObligatorios.registros.value.map((s) => ({
      id: s.id,
      tipo: 'servicio_obligatorio',
      fecha: s.fecha_realizado,
      resumen: etiquetaTipoServicio(s.tipo),
      icono: 'mdi-file-certificate-outline',
      color: 'primary',
      rutaDetalle: `/admin/servicios-obligatorios/${s.id}`
    }))

    const eventosConductor: EventoHistorial[] = historialConductor.map((a) => ({
      id: a.id,
      tipo: 'conductor',
      fecha: a.fecha_inicio,
      resumen: a.fecha_fin
        ? `Conductor asignado — ${a.conductores?.nombre} ${a.conductores?.apellidos}, hasta ${a.fecha_fin}`
        : `Conductor asignado — ${a.conductores?.nombre} ${a.conductores?.apellidos}`,
      icono: 'mdi-account-switch-outline',
      color: 'secondary',
      // Sin ruta propia (research.md R3) — el consumidor cambia de pestaña en vez de navegar.
      rutaDetalle: null
    }))

    // Comparación por Date, no por string: las fuentes mezclan columnas `date` ("2026-08-11") con
    // `timestamptz` (checklists, "2026-08-11T18:26:08+00:00") — comparar los strings crudos
    // ordenaría mal dentro de un mismo día, ya que un string más corto es "menor" que cualquier
    // string del que es prefijo, sin importar la hora real que representa.
    eventos.value = [
      ...eventosCombustible,
      ...eventosMantenimiento,
      ...eventosChecklist,
      ...eventosServicio,
      ...eventosConductor
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())

    cargando.value = false
  }

  return { eventos, cargando, listar }
}

export type { EventoHistorial }
