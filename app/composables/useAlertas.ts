import type { Database } from '~/types/database.types'

type AlertaRow = Database['public']['Tables']['alertas']['Row']
type EstadoAlerta = Database['public']['Enums']['estado_alerta']

/**
 * Alertas (contracts/alertas-dashboard.md de specs/012-alertas-dashboard/): sin
 * `crear`/`eliminar` — las alertas solo las inserta la Edge Function `generar-alertas`
 * (`service_role`, bypassea RLS). El cliente solo lista y, con permiso `aprobar`, resuelve.
 */
export function useAlertas() {
  const client = useSupabaseClient<Database>()

  const registros = useState<AlertaRow[]>('alertas:listado', () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  type Filtros = {
    tipo?: string
    estado?: EstadoAlerta
  }

  async function listar(filtros: Filtros = {}) {
    cargando.value = true
    error.value = null
    let query = client.from('alertas').select('*').order('created_at', { ascending: false })
    if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
    if (filtros.estado) query = query.eq('estado', filtros.estado)
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = data ?? []
  }

  /** Conteo liviano (sin traer filas) para el badge de la barra superior — FR-007. */
  async function contarAbiertas(): Promise<number> {
    const { count, error: err } = await client
      .from('alertas')
      .select('*', { count: 'exact', head: true })
      .in('estado', ['pendiente', 'enviada'])
    if (err) throw err
    return count ?? 0
  }

  /** FR-009: la única escritura de cliente sobre `alertas`, gateada por RLS (`aprobar`). */
  async function marcarResuelta(id: string) {
    const { error: err } = await client.from('alertas').update({ estado: 'resuelta' }).eq('id', id)
    if (err) throw err
  }

  return { registros, cargando, error, listar, contarAbiertas, marcarResuelta }
}

export type { AlertaRow }
