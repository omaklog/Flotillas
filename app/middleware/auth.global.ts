import type { Database } from '~/types/database.types'

// Global (sufijo .global.ts): protegido por default salvo que la ruta esté en
// PUBLIC_ROUTES — así una página nueva nunca queda desprotegida por olvido.
const PUBLIC_ROUTES = ['/login', '/recuperar-password', '/restablecer-password']

const PREFIJO_POR_ROL: Record<Database['public']['Tables']['usuarios']['Row']['rol'], string> = {
  superusuario: '/superusuario',
  admin: '/admin',
  operario: '/operario'
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (PUBLIC_ROUTES.includes(to.path)) return

  const supabaseUser = useSupabaseUser()
  if (!supabaseUser.value) {
    return navigateTo('/login')
  }

  const { usuario, cargarPerfil, cerrarSesion } = useAuth()
  if (!usuario.value || usuario.value.auth_user_id !== supabaseUser.value.sub) {
    await cargarPerfil()
  }

  if (!usuario.value) {
    return navigateTo('/login')
  }

  // Verificación de activo/a en CADA navegación, no solo en el login (FR-007,
  // Assumptions de spec.md: "las sesiones se cortan en la siguiente solicitud
  // autenticada"). Sin esto, un usuario ya logueado conservaría acceso hasta que
  // expire su JWT (hasta 1h) en vez de perderlo de inmediato.
  if (!usuario.value.activo) {
    await cerrarSesion()
    return navigateTo({ path: '/login', query: { motivo: 'usuario_inactivo' } })
  }

  if (usuario.value.empresa_id) {
    const client = useSupabaseClient<Database>()
    const { data: empresa } = await client
      .from('empresas')
      .select('activo')
      .eq('id', usuario.value.empresa_id)
      .single()
    if (empresa && !empresa.activo) {
      await cerrarSesion()
      return navigateTo({ path: '/login', query: { motivo: 'empresa_inactiva' } })
    }
  }

  // Guard de sección por rol: un operario no puede navegar a /admin/** ni
  // /superusuario/** solo cambiando la URL (defensa adicional de UX — la real es RLS).
  const prefijoPropio = PREFIJO_POR_ROL[usuario.value.rol]
  const enOtraSeccion = Object.values(PREFIJO_POR_ROL).some(
    (prefijo) => prefijo !== prefijoPropio && to.path.startsWith(prefijo)
  )
  if (enOtraSeccion || to.path === '/') {
    return navigateTo(prefijoPropio)
  }

  // Sin caché entre navegaciones (FR-029) — se reconsulta siempre.
  const { cargarPermisos } = usePermisos()
  await cargarPermisos()
})
