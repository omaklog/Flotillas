import type { Database } from '~/types/database.types'

type PermisoRow = Pick<
  Database['public']['Tables']['usuario_permisos']['Row'],
  'modulo_clave' | 'accion'
>

/**
 * Permisos del usuario actual (solo aplica de verdad a operarios — admin/superusuario
 * tienen acceso por rol, no por esta tabla). Sin caché entre navegaciones (FR-029): se
 * vuelve a consultar en cada llamada a `cargarPermisos()`, que `app/middleware/auth.ts`
 * invoca en cada cambio de ruta, para que un cambio de permisos hecho por el admin se
 * refleje sin que el operario tenga que cerrar e iniciar sesión de nuevo.
 *
 * Esto es solo para UI (mostrar/ocultar botones y navegación) — la autorización real la
 * hacen las políticas RLS en la base de datos (constitución §2), no este composable.
 */
export function usePermisos() {
  const { usuario } = useAuth()
  const client = useSupabaseClient<Database>()

  const permisos = useState<PermisoRow[]>('permisos:actual', () => [])

  async function cargarPermisos() {
    if (!usuario.value || usuario.value.rol !== 'operario') {
      permisos.value = []
      return
    }
    const { data, error } = await client
      .from('usuario_permisos')
      .select('modulo_clave, accion')
      .eq('usuario_id', usuario.value.id)
    if (error) throw error
    permisos.value = data ?? []
  }

  function tienePermiso(moduloClave: string, accion: string): boolean {
    if (!usuario.value) return false
    // admin/superusuario: acceso completo por rol (igual que las políticas RLS).
    if (usuario.value.rol === 'admin' || usuario.value.rol === 'superusuario') return true
    return permisos.value.some(
      (p) => p.modulo_clave === moduloClave && (p.accion === accion || p.accion === 'todos')
    )
  }

  return {
    permisos,
    cargarPermisos,
    tienePermiso
  }
}
