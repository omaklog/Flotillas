import type { BrowserContext, Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'

/**
 * Nuxt es SSR: el HTML llega funcional-looking antes de que Vue termine de hidratar. Si se
 * interactúa con un formulario antes de que la hidratación reconcilie su estado reactivo
 * (que sigue vacío), un evento de hidratación tardío puede resetear campos ya llenados —
 * incluso después de haber verificado su valor, si el reset ocurre justo después de esa
 * verificación (probado: reintentar fill()/toHaveValue() da falsos positivos aquí).
 *
 * `waitForLoadState('networkidle')` tampoco sirve como señal: el WebSocket de HMR de Vite
 * mantiene la red activa indefinidamente en dev, así que a veces nunca se resuelve.
 *
 * `app.vue` expone `data-hydrated="true"` en el `<v-app>` raíz una vez que `onMounted` corrió
 * (que solo pasa en cliente, después de que la hidratación terminó) — es una señal real, no
 * una heurística.
 */
export async function esperarHidratacion(page: Page) {
  await page.waitForSelector('[data-hydrated="true"]', { timeout: 15_000 })
}

export const PASSWORD_PRUEBAS = 'Flotillas#2026Dev'

function cookieNameParaUrl(url: string): string {
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64url')
}

/** Replica @supabase/ssr createChunks: una sola cookie si cabe, si no, `${key}.0`, `${key}.1`, ... */
function crearCookiesDeSesion(key: string, encoded: string): { name: string; value: string }[] {
  const MAX_CHUNK_SIZE = 3180
  const encodedLength = encodeURIComponent(encoded).length
  if (encodedLength <= MAX_CHUNK_SIZE) {
    return [{ name: key, value: encoded }]
  }
  const chunks: string[] = []
  let remaining = encodeURIComponent(encoded)
  while (remaining.length > 0) {
    const head = remaining.slice(0, MAX_CHUNK_SIZE)
    chunks.push(decodeURIComponent(head))
    remaining = remaining.slice(head.length)
  }
  return chunks.map((value, i) => ({ name: `${key}.${i}`, value }))
}

/**
 * Inyecta una sesión de Supabase Auth ya iniciada como cookies en un `BrowserContext`,
 * replicando el formato interno de `@supabase/ssr` (mismo mecanismo que
 * `global-setup.ts` usa para los 3 fixtures fijos por rol — extraído aquí para
 * reusarse en tests que necesitan autenticar como un usuario ad-hoc, p. ej. el
 * administrador de una empresa creada dentro del propio test).
 *
 * FRÁGIL A PROPÓSITO DOCUMENTADO (igual que en `global-setup.ts`): si esto empieza a
 * fallar tras actualizar `@nuxtjs/supabase`/`@supabase/ssr`, revisar
 * `node_modules/@supabase/ssr/.../cookies.js` y `utils/chunker.js`.
 */
export async function inyectarSesion(
  context: BrowserContext,
  session: { [key: string]: unknown },
  supabaseUrl: string
) {
  const cookieKey = cookieNameParaUrl(supabaseUrl)
  const encoded = 'base64-' + toBase64Url(JSON.stringify(session))
  const cookieChunks = crearCookiesDeSesion(cookieKey, encoded)
  const appUrl = new URL('http://localhost:3030')
  await context.addCookies(
    cookieChunks.map((c) => ({
      name: c.name,
      value: c.value,
      domain: appUrl.hostname,
      path: '/',
      sameSite: 'Lax' as const,
      httpOnly: false,
      secure: false
    }))
  )
}

/** Inicia sesión con el cliente `anon` y devuelve la sesión, lista para `inyectarSesion`. */
export async function crearSesionParaUsuario(email: string, password = PASSWORD_PRUEBAS) {
  const anon = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesión como ${email}: ${error?.message}`)
  }
  return data.session
}

/**
 * Formato simplificado, suficiente para probar unicidad (no valida estructura real de
 * RFC). `Date.now()` sólo no basta: varios workers de Playwright pueden llamarlo en el
 * mismo milisegundo — se le agrega un sufijo aleatorio (mismo hallazgo que
 * `empresas.spec.ts`).
 */
export function rfcUnico(): string {
  const azar = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `T${Date.now().toString(36).toUpperCase().slice(-9)}${azar}`
}

/**
 * Crea una empresa nueva + su administrador directo vía `service_role` (sin flujo de
 * invitación por correo — no es lo que se está probando aquí, ver `usuarios.spec.ts`
 * T073 para el mismo patrón de "sembrar solo lo necesario"). Devuelve credenciales
 * listas para `crearSesionParaUsuario` + `inyectarSesion`.
 */
export async function crearEmpresaConAdmin(
  admin: ReturnType<typeof createClient<Database>>,
  opciones?: { nombre?: string }
) {
  const rfc = rfcUnico()
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({ nombre: opciones?.nombre ?? `Empresa Catálogos E2E ${Date.now()}`, rfc })
    .select('id')
    .single()
  if (empresaError) throw empresaError

  const correo = `admin-catalogos-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@flotillas.local`
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: correo,
    password: PASSWORD_PRUEBAS,
    email_confirm: true
  })
  if (authError) throw authError

  const { error: usuarioError } = await admin.from('usuarios').insert({
    auth_user_id: authUser.user.id,
    empresa_id: empresa.id,
    nombre: 'Admin Catálogos E2E',
    correo,
    rol: 'admin',
    activo: true
  })
  if (usuarioError) throw usuarioError

  return { empresaId: empresa.id, correo }
}
