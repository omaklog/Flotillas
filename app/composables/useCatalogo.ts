import type { PostgrestError } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

type TablaCatalogo = 'tipos_vehiculo' | 'aseguradoras' | 'permisos'

interface OpcionesCatalogo {
  /** Columnas sobre las que buscar (unidas con OR vía `ilike`). */
  camposBusqueda: string[]
  /** Columna de orden del listado. */
  ordenarPor: string
  /** Mensaje a mostrar cuando un DELETE choca con la FK de un vehículo dependiente (23503). */
  mensajeDependientes: string
}

/**
 * CRUD genérico para los 3 catálogos de Feature 002 (contracts/catalogos.md): lectura protegida
 * por RLS, sin `server/api/` intermedio (research.md R5). Mapea los errores de Postgres que
 * `spec.md` pide traducir a lenguaje de negocio: 23505 (clave duplicada, respaldo de FR-006) y
 * 23503 (registro en uso, FR-010).
 */
export function useCatalogo<Tabla extends TablaCatalogo>(tabla: Tabla, opciones: OpcionesCatalogo) {
  type Row = Database['public']['Tables'][Tabla]['Row']
  type Insert = Database['public']['Tables'][Tabla]['Insert']
  type Update = Database['public']['Tables'][Tabla]['Update']

  const client = useSupabaseClient<Database>()

  const registros = useState<Row[]>(`catalogo:${tabla}`, () => [])
  const cargando = ref(false)
  const error = ref<string | null>(null)

  function mapearError(err: PostgrestError): string {
    if (err.code === '23505') return 'Ya existe un registro con esa clave.'
    if (err.code === '23503') return opciones.mensajeDependientes
    return err.message
  }

  async function listar(busqueda = '') {
    cargando.value = true
    error.value = null
    let query = client.from(tabla).select('*').order(opciones.ordenarPor)
    const texto = busqueda.trim()
    if (texto) {
      // PostgREST usa `,`/`.`/`(`/`)` como sintaxis estructural en or() — un texto de búsqueda
      // que contenga esos caracteres (p. ej. "Nombre (Sucursal Norte)") rompe el parseo del
      // filtro si se interpola sin escapar, devolviendo 0 resultados en silencio (200 OK, sin
      // error). Envolver el valor en comillas dobles lo trata como dato literal.
      const valorEscapado = `"%${texto.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}%"`
      const filtro = opciones.camposBusqueda.map((campo) => `${campo}.ilike.${valorEscapado}`).join(',')
      query = query.or(filtro)
    }
    const { data, error: err } = await query
    cargando.value = false
    if (err) {
      error.value = mapearError(err)
      throw err
    }
    registros.value = (data ?? []) as Row[]
  }

  async function crear(valores: Insert) {
    error.value = null
    const { error: err } = await client.from(tabla).insert(valores)
    if (err) {
      error.value = mapearError(err)
      throw err
    }
  }

  async function editar(id: string, valores: Update) {
    error.value = null
    const { error: err } = await client.from(tabla).update(valores).eq('id', id)
    if (err) {
      error.value = mapearError(err)
      throw err
    }
  }

  async function eliminar(id: string) {
    error.value = null
    const { error: err } = await client.from(tabla).delete().eq('id', id)
    if (err) {
      error.value = mapearError(err)
      throw err
    }
  }

  return { registros, cargando, error, listar, crear, editar, eliminar }
}
