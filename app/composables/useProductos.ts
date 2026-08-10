import type { PostgrestError } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

type ProductoRow = Database['public']['Tables']['productos']['Row']
type ProductoInsert = Database['public']['Tables']['productos']['Insert']
type ProductoUpdate = Database['public']['Tables']['productos']['Update']
type TipoProducto = Database['public']['Enums']['tipo_producto']

const ETIQUETAS_DEPENDIENTES: Record<string, string> = {
  cargas_combustible: 'cargas de combustible',
  mantenimiento_detalles: 'detalles de mantenimiento'
}

/**
 * CRUD de productos (contracts/productos.md): sin `server/api/` intermedio (research.md R7).
 * Dedicado — no extiende `useCatalogo.ts` (research.md R4): necesita `tieneRegistrosAsociados()`,
 * que el CRUD genérico no soporta.
 */
export function useProductos() {
  const client = useSupabaseClient<Database>()
  const { usuario } = useAuth()

  const registros = useState<ProductoRow[]>('productos:listado', () => [])
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

  async function listar(busqueda = '', tipo: TipoProducto | null = null) {
    cargando.value = true
    error.value = null
    let query = client.from('productos').select('*').order('nombre')
    const texto = busqueda.trim()
    if (texto) {
      // A diferencia de useCatalogo.ts/useVehiculos.ts/useConductores.ts/useProveedores.ts (que
      // usan .or(), un string-DSL de PostgREST donde `,`/`.`/`(`/`)` son sintaxis estructural y
      // el valor debe envolverse en comillas dobles), `.ilike()` es un método normal que recibe
      // el patrón como argumento plano — envolver en comillas aquí lo vuelve parte literal del
      // patrón buscado, sin encontrar nada.
      query = query.ilike('nombre', `%${texto}%`)
    }
    if (tipo) query = query.eq('tipo', tipo)
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = err.message
      throw err
    }
    registros.value = data ?? []
  }

  async function crear(valores: Omit<ProductoInsert, 'empresa_id'>) {
    error.value = null
    const { error: err } = await client
      .from('productos')
      .insert({ ...valores, empresa_id: usuario.value!.empresa_id! })
    if (err) {
      error.value = mapearErrorEscritura(err)
      throw err
    }
  }

  async function editar(id: string, valores: ProductoUpdate) {
    error.value = null
    const { error: err } = await client.from('productos').update(valores).eq('id', id)
    if (err) {
      error.value = mapearErrorEscritura(err)
      throw err
    }
  }

  async function eliminar(id: string) {
    error.value = null
    const { error: err } = await client.from('productos').delete().eq('id', id)
    if (err) {
      error.value = mapearErrorEscritura(err)
      throw err
    }
  }

  /** FR-009, research.md R6: dos `count`, OR-eados en el cliente — sin restricción a nivel de
   * BD, ver spec.md Fuera de Alcance. */
  async function tieneRegistrosAsociados(productoId: string): Promise<boolean> {
    const [{ count: cargas }, { count: detalles }] = await Promise.all([
      client
        .from('cargas_combustible')
        .select('id', { count: 'exact', head: true })
        .eq('producto_id', productoId),
      client
        .from('mantenimiento_detalles')
        .select('id', { count: 'exact', head: true })
        .eq('producto_id', productoId)
    ])
    return (cargas ?? 0) > 0 || (detalles ?? 0) > 0
  }

  return {
    registros,
    cargando,
    error,
    listar,
    crear,
    editar,
    eliminar,
    tieneRegistrosAsociados
  }
}

export type { ProductoRow }
