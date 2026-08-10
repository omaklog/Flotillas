import type { PostgrestError } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

type ProveedorRow = Database['public']['Tables']['proveedores']['Row']
type ProveedorInsert = Database['public']['Tables']['proveedores']['Insert']
type ProveedorUpdate = Database['public']['Tables']['proveedores']['Update']

const ETIQUETAS_DEPENDIENTES: Record<string, string> = {
  mantenimientos: 'mantenimientos',
  cargas_combustible: 'cargas de combustible'
}

/**
 * CRUD de proveedores (contracts/proveedores.md): sin `server/api/` intermedio (research.md R7).
 * Dedicado — no extiende `useCatalogo.ts` (research.md R4): necesita `desactivar`/`reactivar`,
 * que el CRUD genérico no soporta.
 */
export function useProveedores() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const registros = useState<ProveedorRow[]>('proveedores:listado', () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  function mapearErrorEscritura(err: PostgrestError): string {
    if (err.code === '23503') {
      const coincidencia = err.message.match(/foreign key constraint "[^"]+" on table "(\w+)"/)
      const tabla = coincidencia?.[1]
      const etiqueta = tabla ? ETIQUETAS_DEPENDIENTES[tabla] : null
      return etiqueta
        ? `No se puede eliminar: tiene ${etiqueta} registrados.`
        : 'No se puede eliminar: tiene registros relacionados.'
    }
    return err.message
  }

  async function listar(busqueda = '', incluirInactivos = false) {
    cargando.value = true
    error.value = null
    let query = client.from('proveedores').select('*').order('nombre')
    if (!incluirInactivos) query = query.eq('activo', true)
    const texto = busqueda.trim()
    if (texto) {
      // Mismo escape que useCatalogo.ts/useVehiculos.ts/useConductores.ts: PostgREST usa
      // `,`/`.`/`(`/`)` como sintaxis estructural en or() — un texto con esos caracteres rompe el
      // filtro en silencio si no se envuelve en comillas dobles.
      const valorEscapado = `"%${texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`
      query = query.or(`nombre.ilike.${valorEscapado},rfc.ilike.${valorEscapado}`)
    }
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = data ?? []
  }

  async function crear(valores: Omit<ProveedorInsert, 'empresa_id'>) {
    error.value = null
    const { error: err } = await client
      .from('proveedores')
      .insert({ ...valores, empresa_id: usuario.value!.empresa_id! })
    if (err) {
      error.value = mapearErrorEscritura(err)
      throw err
    }
  }

  async function editar(id: string, valores: ProveedorUpdate) {
    error.value = null
    const { error: err } = await client.from('proveedores').update(valores).eq('id', id)
    if (err) {
      error.value = mapearErrorEscritura(err)
      throw err
    }
  }

  async function desactivar(id: string, motivo: string) {
    error.value = null
    const { error: err } = await client
      .from('proveedores')
      .update({ activo: false, motivo_baja: motivo })
      .eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  async function reactivar(id: string) {
    error.value = null
    const { error: err } = await client.from('proveedores').update({ activo: true }).eq('id', id)
    if (err) {
      error.value = err.message
      throw err
    }
  }

  async function eliminar(id: string) {
    error.value = null
    const { error: err } = await client.from('proveedores').delete().eq('id', id)
    if (err) {
      error.value = mapearErrorEscritura(err)
      throw err
    }
  }

  return {
    registros,
    cargando,
    error,
    listar,
    crear,
    editar,
    desactivar,
    reactivar,
    eliminar
  }
}

export type { ProveedorRow }
