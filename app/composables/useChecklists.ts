import type { Database } from '~/types/database.types'

type ChecklistRow = Database['public']['Tables']['checklists']['Row']
type ChecklistInsert = Database['public']['Tables']['checklists']['Insert']
type ChecklistItemInsert = Database['public']['Tables']['checklist_items']['Insert']
type ChecklistListado = ChecklistRow & {
  vehiculos: { placa: string; marca: string; modelo: string } | null
  conductores: { nombre: string; apellidos: string } | null
  usuarios: { nombre: string } | null
  checklist_items: { count: number }[]
}

type ItemRespuesta = Omit<ChecklistItemInsert, 'empresa_id' | 'checklist_id'>

/**
 * CRUD de checklists (contracts/checklist.md): sin `server/api/` intermedio. Sin `editar`/
 * `eliminar`/`cancelar` — no existen en esta feature, ni siquiera para el rol admin (FR-010, ya
 * garantizado por RLS `using (false)` incondicional desde el diseño original de la BD).
 */
export function useChecklists() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const registros = useState<ChecklistListado[]>('checklists:listado', () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  /** Checklist primero, ítems en un solo `insert` masivo después (research.md R8) — sin
   * transacción entre ambos pasos. Si el segundo falla, devuelve el error junto con el id del
   * checklist ya creado para poder reintentar (`reintentarItems`), sin duplicarlo. */
  async function crear(valores: Omit<ChecklistInsert, 'empresa_id' | 'responsable_id'>, itemsRespuesta: ItemRespuesta[]) {
    error.value = null
    const { data, error: errChecklist } = await client
      .from('checklists')
      .insert({ ...valores, empresa_id: usuario.value!.empresa_id!, responsable_id: usuario.value!.id })
      .select('id')
      .single()
    if (errChecklist) {
      error.value = errChecklist.message
      throw errChecklist
    }
    const checklistId = data.id as string

    try {
      await reintentarItems(checklistId, itemsRespuesta)
    } catch (errItems) {
      return { checklistId, itemsFallaron: true, error: errItems }
    }
    return { checklistId, itemsFallaron: false }
  }

  async function reintentarItems(checklistId: string, itemsRespuesta: ItemRespuesta[]) {
    error.value = null
    const empresaId = usuario.value!.empresa_id!
    const { error: errItems } = await client
      .from('checklist_items')
      .insert(itemsRespuesta.map((i) => ({ ...i, empresa_id: empresaId, checklist_id: checklistId })))
    if (errItems) {
      error.value = errItems.message
      throw errItems
    }
  }

  type Filtros = {
    vehiculoId?: string
    fechaDesde?: string
    fechaHasta?: string
    resultado?: Database['public']['Enums']['resultado_checklist']
    conductorId?: string
  }

  async function listar(filtros: Filtros = {}) {
    cargando.value = true
    error.value = null
    let query = client
      .from('checklists')
      .select('*, vehiculos(placa, marca, modelo), conductores(nombre, apellidos), usuarios(nombre), checklist_items(count)')
      .order('fecha', { ascending: false })
    if (filtros.vehiculoId) query = query.eq('vehiculo_id', filtros.vehiculoId)
    if (filtros.fechaDesde) query = query.gte('fecha', filtros.fechaDesde)
    if (filtros.fechaHasta) query = query.lte('fecha', filtros.fechaHasta)
    if (filtros.resultado) query = query.eq('resultado', filtros.resultado)
    if (filtros.conductorId) query = query.eq('conductor_id', filtros.conductorId)
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = (data ?? []) as unknown as ChecklistListado[]
  }

  return { registros, cargando, error, crear, reintentarItems, listar }
}

export type { ChecklistRow, ChecklistListado, ItemRespuesta }
