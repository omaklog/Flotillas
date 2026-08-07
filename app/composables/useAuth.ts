import type { Database } from '~/types/database.types'

export type Usuario = Database['public']['Tables']['usuarios']['Row']

/**
 * Sesión + perfil (public.usuarios) del usuario actual. `useSupabaseUser()` da el JWT
 * decodificado (`getClaims()`, no el `User` clásico) — el id del usuario viene en `.sub`,
 * no en `.id` (JwtPayload declara `[key: string]: any`, así que usar `.id` por error no
 * lo marca el type-check; usar siempre `.sub`). Este composable agrega rol/empresa/activo,
 * que es lo que el resto de la app necesita para decidir qué mostrar.
 */
export function useAuth() {
  const authUser = useSupabaseUser()
  const client = useSupabaseClient<Database>()

  const usuario = useState<Usuario | null>('auth:usuario', () => null)
  const cargando = useState<boolean>('auth:cargando', () => false)

  async function cargarPerfil() {
    if (!authUser.value?.sub) {
      usuario.value = null
      return
    }
    cargando.value = true
    try {
      const { data, error } = await client
        .from('usuarios')
        .select('*')
        .eq('auth_user_id', authUser.value.sub)
        .single()
      if (error) throw error
      usuario.value = data
    } finally {
      cargando.value = false
    }
  }

  watch(
    authUser,
    () => {
      cargarPerfil()
    },
    { immediate: true }
  )

  async function cerrarSesion() {
    await client.auth.signOut()
    usuario.value = null
    await navigateTo('/login')
  }

  return {
    authUser,
    usuario,
    cargando,
    cargarPerfil,
    cerrarSesion
  }
}
