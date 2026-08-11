import type { Database } from '~/types/database.types'

type AuditoriaRow = Database['public']['Tables']['auditoria']['Row']
type AccionAuditoria = Database['public']['Enums']['accion_auditoria']
type AuditoriaListado = AuditoriaRow & {
  usuarios: { nombre: string } | null
}

/**
 * Bitácora de auditoría (contracts/historial-auditoria.md): sin `server/api/` intermedio, mismo
 * criterio que el resto del proyecto. Sin `crear`/`editar`/`eliminar` — `auditoria` solo se
 * escribe vía triggers, nunca directo desde el cliente.
 */
export function useAuditoria() {
  const client = useSupabaseClient<Database>()

  const registros = useState<AuditoriaListado[]>('auditoria:listado', () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  type Filtros = {
    entidad?: string
    usuarioId?: string
    accion?: AccionAuditoria
    fechaDesde?: string
    fechaHasta?: string
  }

  async function listar(filtros: Filtros = {}) {
    cargando.value = true
    error.value = null
    let query = client
      .from('auditoria')
      .select('*, usuarios(nombre)')
      .order('created_at', { ascending: false })
    if (filtros.entidad) query = query.eq('entidad', filtros.entidad)
    if (filtros.usuarioId) query = query.eq('usuario_id', filtros.usuarioId)
    if (filtros.accion) query = query.eq('accion', filtros.accion)
    if (filtros.fechaDesde) query = query.gte('created_at', filtros.fechaDesde)
    if (filtros.fechaHasta) query = query.lte('created_at', filtros.fechaHasta)
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = (data ?? []) as unknown as AuditoriaListado[]
  }

  return { registros, cargando, error, listar }
}

export type { AuditoriaRow, AuditoriaListado }
