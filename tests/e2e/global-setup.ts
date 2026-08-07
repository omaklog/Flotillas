import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'

// research.md R10: sesiones pre-autenticadas por rol, sin pasar por la UI de login (que
// para US1 en adelante todavía no existe). Se siembra vía service_role, se inicia sesión
// programáticamente con el cliente anon, y se inyecta la cookie de sesión directamente
// en un contexto de Playwright — replicando el formato exacto que usa
// @supabase/ssr (createBrowserClient) para leerla de vuelta.
//
// FRÁGIL A PROPÓSITO DOCUMENTADO: si esto empieza a fallar tras actualizar
// @nuxtjs/supabase o @supabase/ssr, revisar node_modules/@supabase/ssr/.../cookies.js y
// utils/chunker.js — el formato de cookie (nombre derivado de la URL, prefijo
// "base64-", chunking sobre 3180 bytes) es interno de esa librería, no un contrato
// público estable.

const PASSWORD_PRUEBAS = 'Flotillas#2026Dev'
const EMPRESA_PRUEBA_RFC = 'E2E010101AAA'

interface RoleFixture {
  role: 'superusuario' | 'admin' | 'operario'
  email: string
}

process.loadEnvFile(new URL('../../.env', import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function ensureEmpresaDePrueba(admin: ReturnType<typeof createClient<Database>>) {
  const { data: existente } = await admin
    .from('empresas')
    .select('id')
    .eq('rfc', EMPRESA_PRUEBA_RFC)
    .maybeSingle()
  if (existente) return existente.id

  const { data, error } = await admin
    .from('empresas')
    .insert({ nombre: 'Empresa E2E', rfc: EMPRESA_PRUEBA_RFC })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function ensureUsuarioDePrueba(
  admin: ReturnType<typeof createClient<Database>>,
  input: { email: string; rol: 'admin' | 'operario'; empresaId: string }
) {
  const { data: existente } = await admin
    .from('usuarios')
    .select('id')
    .eq('correo', input.email)
    .maybeSingle()
  if (existente) return

  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: PASSWORD_PRUEBAS,
    email_confirm: true
  })
  if (authError) throw authError

  const { error } = await admin.from('usuarios').insert({
    auth_user_id: authUser.user.id,
    empresa_id: input.empresaId,
    nombre: input.rol === 'admin' ? 'Admin E2E' : 'Operario E2E',
    correo: input.email,
    rol: input.rol,
    activo: true
  })
  if (error) throw error
}

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

async function iniciarSesionYGuardarStorageState(fixture: RoleFixture) {
  const anon = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data, error } = await anon.auth.signInWithPassword({
    email: fixture.email,
    password: PASSWORD_PRUEBAS
  })
  if (error || !data.session) {
    throw new Error(`No se pudo iniciar sesión como ${fixture.email}: ${error?.message}`)
  }

  const cookieKey = cookieNameParaUrl(SUPABASE_URL)
  const encoded = 'base64-' + toBase64Url(JSON.stringify(data.session))
  const cookieChunks = crearCookiesDeSesion(cookieKey, encoded)

  const appUrl = new URL('http://localhost:3030')
  const browser = await chromium.launch()
  const context = await browser.newContext()
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
  await context.storageState({ path: `tests/e2e/.auth/${fixture.role}.json` })
  await browser.close()
}

export default async function globalSetup() {
  const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const empresaId = await ensureEmpresaDePrueba(admin)
  await ensureUsuarioDePrueba(admin, {
    email: 'admin-e2e@flotillas.local',
    rol: 'admin',
    empresaId
  })
  await ensureUsuarioDePrueba(admin, {
    email: 'operario-e2e@flotillas.local',
    rol: 'operario',
    empresaId
  })

  const fixtures: RoleFixture[] = [
    // El superusuario ya existe vía supabase/seed.sql (T023) — mismas credenciales.
    { role: 'superusuario', email: 'superusuario@flotillas.local' },
    { role: 'admin', email: 'admin-e2e@flotillas.local' },
    { role: 'operario', email: 'operario-e2e@flotillas.local' }
  ]

  for (const fixture of fixtures) {
    await iniciarSesionYGuardarStorageState(fixture)
  }
}
