import type { Database } from '~/types/database.types'

type ItemPlantillaRow = Database['public']['Tables']['checklist_item_plantillas']['Row']
type ItemPlantillaInsert = Database['public']['Tables']['checklist_item_plantillas']['Insert']
type ItemPlantillaUpdate = Database['public']['Tables']['checklist_item_plantillas']['Update']

/**
 * CRUD de ítems de plantilla de checklist (contracts/checklist.md): sin `server/api/`
 * intermedio. Dedicado — no extiende `useCatalogo.ts` (research.md R4): necesita filtrar por
 * `tipo_vehiculo_id`, algo que el CRUD genérico no soporta.
 */
export function useChecklistPlantillas() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const registros = useState<ItemPlantillaRow[]>('checklist-plantillas:listado', () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  async function listar(tipoVehiculoId: string) {
    cargando.value = true
    error.value = null
    const { data, error: err } = await client
      .from('checklist_item_plantillas')
      .select('*')
      .eq('tipo_vehiculo_id', tipoVehiculoId)
      .order('orden')
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = data ?? []
  }

  async function crear(valores: Omit<ItemPlantillaInsert, 'empresa_id'>) {
    error.value = null
    const { error: err } = await client
      .from('checklist_item_plantillas')
      .insert({ ...valores, empresa_id: usuario.value!.empresa_id! })
    if (err) {
      error.value = err.message
      throw err
    }
  }

  async function editar(id: string, valores: ItemPlantillaUpdate) {
    error.value = null
    const { error: err } = await client.from('checklist_item_plantillas').update(valores).eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  async function eliminar(id: string) {
    error.value = null
    const { error: err } = await client.from('checklist_item_plantillas').delete().eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  return { registros, cargando, error, listar, crear, editar, eliminar }
}

export type { ItemPlantillaRow }
