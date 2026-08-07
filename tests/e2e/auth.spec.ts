import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { esperarHidratacion } from './helpers'

const PASSWORD_PRUEBAS = 'Flotillas#2026Dev'
const EMPRESA_PRUEBA_RFC = 'E2E010101AAA'

function adminClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

test.describe('US2 — Inicio de sesión', () => {
  // T035 desactiva/reactiva la empresa E2E compartida (misma que usan T033/T034 para
  // iniciar sesión) — con fullyParallel, T033 puede correr mientras la empresa está
  // temporalmente inactiva. Serial evita la carrera sobre ese fixture compartido.
  test.describe.configure({ mode: 'serial' })
  test.use({ storageState: { cookies: [], origins: [] } })

  test('T033: login exitoso redirige a la home del rol correspondiente', async ({ page }) => {
    await page.goto('/login')
    await esperarHidratacion(page)

    await page.getByLabel('Correo').fill('admin-e2e@flotillas.local')
    await page.getByLabel('Contraseña').fill(PASSWORD_PRUEBAS)
    await expect(page.getByTestId('submit-btn')).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId('submit-btn').click()

    await expect(page).toHaveURL(/\/admin/, { timeout: 10_000 })
  })

  test('T034: credenciales incorrectas muestran mensaje genérico y permiten reintentar', async ({
    page
  }) => {
    await page.goto('/login')
    await esperarHidratacion(page)

    await page.getByLabel('Correo').fill('admin-e2e@flotillas.local')
    await page.getByLabel('Contraseña').fill('contraseña-incorrecta')
    await expect(page.getByTestId('submit-btn')).toBeEnabled({ timeout: 10_000 })
    await page.getByTestId('submit-btn').click()

    await expect(page.getByTestId('login-error')).toContainText('Usuario o Contraseña Incorrecta')
    await expect(page).toHaveURL(/\/login/)

    // Permite reintentar: el formulario sigue interactivo.
    await expect(page.getByLabel('Correo')).toBeEditable()
  })

  test('T035: empresa desactivada bloquea el login con mensaje explícito', async ({ page }) => {
    const admin = adminClient()
    const { data: empresa } = await admin
      .from('empresas')
      .select('id')
      .eq('rfc', EMPRESA_PRUEBA_RFC)
      .single()

    await admin.from('empresas').update({ activo: false }).eq('id', empresa!.id)

    try {
      await page.goto('/login')
      await esperarHidratacion(page)

      await page.getByLabel('Correo').fill('admin-e2e@flotillas.local')
      await page.getByLabel('Contraseña').fill(PASSWORD_PRUEBAS)
      await expect(page.getByTestId('submit-btn')).toBeEnabled({ timeout: 10_000 })
      await page.getByTestId('submit-btn').click()

      await expect(page.getByTestId('login-error')).toContainText('empresa', { ignoreCase: true })
      await expect(page).toHaveURL(/\/login/)
    } finally {
      // Restaurar: otras pruebas (y el fixture de global-setup) dependen de esta empresa activa.
      await admin.from('empresas').update({ activo: true }).eq('id', empresa!.id)
    }
  })

  test('T036: el formulario no se envía si el captcha no está resuelto', async ({ page }) => {
    await page.goto('/login')
    // Deliberadamente SIN esperar a que Turnstile (modo prueba) resuelva — el botón debe
    // arrancar deshabilitado.
    await expect(page.getByTestId('submit-btn')).toBeDisabled()
  })
})

test.describe('US3 — Recuperar contraseña', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('T041: mensaje de confirmación idéntico exista o no la cuenta', async ({ page }) => {
    await page.goto('/recuperar-password')
    await esperarHidratacion(page)
    await page.getByLabel('Correo').fill('admin-e2e@flotillas.local')
    await page.getByTestId('submit-btn').click()
    await expect(page.getByTestId('recuperar-confirmacion')).toBeVisible({ timeout: 10_000 })
    const mensajeExistente = await page.getByTestId('recuperar-confirmacion').textContent()

    await page.goto('/recuperar-password')
    await esperarHidratacion(page)
    await page.getByLabel('Correo').fill(`no-existe-${Date.now()}@flotillas.local`)
    await page.getByTestId('submit-btn').click()
    await expect(page.getByTestId('recuperar-confirmacion')).toBeVisible({ timeout: 10_000 })
    const mensajeInexistente = await page.getByTestId('recuperar-confirmacion').textContent()

    expect(mensajeExistente).toBeTruthy()
    expect(mensajeExistente).toBe(mensajeInexistente)
  })
})

test.describe('US10 — Cierre de sesión', () => {
  const roles: { storageState: string; home: string }[] = [
    { storageState: 'tests/e2e/.auth/superusuario.json', home: '/superusuario' },
    { storageState: 'tests/e2e/.auth/admin.json', home: '/admin' },
    { storageState: 'tests/e2e/.auth/operario.json', home: '/operario' }
  ]

  for (const rol of roles) {
    test(`T079: cerrar sesión funciona y redirige a login (${rol.home})`, async ({ browser }) => {
      // `browser.newContext()` con `storageState` explícito por rol — no depende del proyecto
      // de Playwright activo (ver la nota de T028 sobre por qué NO se debe omitir esta opción).
      const context = await browser.newContext({ storageState: rol.storageState })
      const page = await context.newPage()

      await page.goto(rol.home)
      await esperarHidratacion(page)
      await expect(page).toHaveURL(new RegExp(rol.home))

      await page.getByTestId('menu-perfil').click()
      await page.getByTestId('cerrar-sesion').click()
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

      // La sesión quedó realmente cerrada, no solo redirigida: volver a pedir la home ya no
      // funciona sin iniciar sesión de nuevo.
      await page.goto(rol.home)
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

      await context.close()
    })
  }
})
