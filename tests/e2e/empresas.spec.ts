import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { esperarHidratacion } from './helpers'

const MAILPIT_URL = 'http://127.0.0.1:54424'
const EMPRESA_PRUEBA_RFC = 'E2E010101AAA'

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

interface MailpitMensaje {
  ID: string
  To: { Address: string }[]
}

/** Mailpit es el capturador de SMTP local (supabase/config.toml expone su REST API como
 * `[inbucket]` por compatibilidad de nombre con versiones previas de la CLI — no es Inbucket). */
async function obtenerHtmlCorreo(destinatario: string): Promise<string> {
  for (let intento = 0; intento < 20; intento++) {
    const listado: { messages: MailpitMensaje[] } = await fetch(
      `${MAILPIT_URL}/api/v1/messages`
    ).then((r) => r.json())
    const mensaje = listado.messages.find((m) =>
      m.To.some((destino) => destino.Address === destinatario)
    )
    if (mensaje) {
      const detalle: { HTML: string } = await fetch(
        `${MAILPIT_URL}/api/v1/message/${mensaje.ID}`
      ).then((r) => r.json())
      return detalle.HTML
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`No llegó ningún correo a ${destinatario} tras 10s (revisar Mailpit local)`)
}

/** La plantilla (server/utils/mailer.ts → renderEmailLayout) solo tiene un `<a href>`: el CTA
 * de la invitación — el único otro `href` del documento es un `<link>` de Google Fonts. */
function extraerEnlaceInvitacion(html: string): string {
  const coincidencia = html.match(/<a\s+href="([^"]+)"/)
  if (!coincidencia) throw new Error('No se encontró un enlace <a href> en el correo')
  return coincidencia[1]
}

function rfcUnico() {
  // Formato simplificado, suficiente para probar unicidad (no valida estructura real de RFC).
  // `Date.now()` sólo no basta: varios workers de Playwright pueden llamarlo en el mismo
  // milisegundo (probado: causó colisiones reales de RFC entre T026/T028/T044 corriendo en
  // paralelo) — se le agrega un sufijo aleatorio.
  const azar = Math.random().toString(36).toUpperCase().slice(2, 6)
  return `T${Date.now().toString(36).toUpperCase().slice(-9)}${azar}`
}

test.describe('US1 — Superusuario da de alta una nueva empresa', () => {
  test.use({ storageState: 'tests/e2e/.auth/superusuario.json' })

  test('T025: alta exitosa de empresa + administrador', async ({ page }) => {
    const rfc = rfcUnico()
    const correoAdmin = `admin-${Date.now()}@flotillas.local`

    await page.goto('/superusuario/empresas/nueva')
    await esperarHidratacion(page)

    await page.getByLabel('Nombre de la empresa').fill('Transportes Playwright SA de CV')
    await page.getByLabel('RFC').fill(rfc)
    await page.getByLabel('Nombre del administrador').fill('Admin Playwright')
    await page.getByLabel('Correo del administrador').fill(correoAdmin)

    await page.getByTestId('submit-btn').click()

    // Éxito esperado: redirige al listado de empresas (US7, ya con la nueva empresa visible)
    // o muestra confirmación en la misma pantalla — se acepta cualquiera de las dos señales.
    await expect(page.getByText('Transportes Playwright SA de CV')).toBeVisible({ timeout: 10_000 })
  })

  test('T026: alta rechazada por RFC duplicado', async ({ page, request }) => {
    const rfc = rfcUnico()
    const correoAdmin1 = `admin-dup1-${Date.now()}@flotillas.local`
    const correoAdmin2 = `admin-dup2-${Date.now()}@flotillas.local`

    // Primera alta directo contra el endpoint (más rápido que llenar el form dos veces).
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const primera = await request.post('/api/empresas', {
      headers: { cookie: cookieHeader },
      data: {
        empresa: {
          nombre: 'Empresa Original',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Original', correo: correoAdmin1 }
      }
    })
    expect(primera.status()).toBe(201)

    const segunda = await request.post('/api/empresas', {
      headers: { cookie: cookieHeader },
      data: {
        empresa: {
          nombre: 'Empresa Duplicada',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Duplicado', correo: correoAdmin2 }
      }
    })
    expect(segunda.status()).toBe(409)
    const body = await segunda.json()
    // Nitro serializa createError({data}) como { error: true, ..., data: {...} } — el
    // payload propio queda anidado bajo `data`, no en la raíz.
    expect(body.data.error).toBe('rfc_duplicado')
  })

  test('T027: un rol distinto a superusuario no puede acceder', async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'tests/e2e/.auth/admin.json' })
    const page = await context.newPage()

    // La página redirige fuera de /superusuario/** (guard de sección por rol, T021).
    await page.goto('/superusuario/empresas/nueva')
    await expect(page).not.toHaveURL(/\/superusuario/)

    // El endpoint también rechaza, no solo la UI (constitución §3: ningún endpoint de
    // escritura sin verificar rol).
    const cookies = await context.cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
    const response = await page.request.post('/api/empresas', {
      headers: { cookie: cookieHeader },
      data: {
        empresa: {
          nombre: 'No debería crearse',
          rfc: rfcUnico(),
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Intruso', correo: `intruso-${Date.now()}@flotillas.local` }
      }
    })
    expect(response.status()).toBe(403)

    await context.close()
  })

  test('T028: flujo completo de invitación — aceptar, establecer contraseña, iniciar sesión', async ({
    page,
    request,
    browser
  }) => {
    const rfc = rfcUnico()
    const correoAdmin = `admin-t028-${Date.now()}@flotillas.local`
    const contrasenaNueva = 'NuevaClave#2026'

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const respuesta = await request.post('/api/empresas', {
      headers: { cookie: cookieHeader },
      data: {
        empresa: {
          nombre: 'Empresa Invitación E2E',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Invitación', correo: correoAdmin }
      }
    })
    expect(respuesta.status()).toBe(201)

    const html = await obtenerHtmlCorreo(correoAdmin)
    const enlaceInvitacion = extraerEnlaceInvitacion(html)

    // Contexto anónimo aparte: aceptar la invitación no debe depender de (ni contaminar) la
    // sesión de superusuario usada para crear la empresa. `storageState` explícito y vacío es
    // obligatorio aquí — `browser.newContext()` sin esto hereda por defecto el `storageState`
    // configurado a nivel de proyecto (Playwright config), que para el proyecto `superusuario`
    // es justo la sesión que se quiere evitar (confirmado: sin este fix, el enlace de invitación
    // terminaba actualizando la contraseña del superusuario, no la del admin invitado).
    const contextoInvitado = await browser.newContext({
      storageState: { cookies: [], origins: [] }
    })
    const paginaInvitado = await contextoInvitado.newPage()

    await paginaInvitado.goto(enlaceInvitacion)
    await esperarHidratacion(paginaInvitado)
    await expect(paginaInvitado.getByTestId('submit-btn')).toBeVisible({ timeout: 10_000 })

    await paginaInvitado.getByLabel('Nueva contraseña').fill(contrasenaNueva)
    await paginaInvitado.getByLabel('Confirmar contraseña').fill(contrasenaNueva)
    await paginaInvitado.getByTestId('submit-btn').click()
    await expect(paginaInvitado.getByTestId('restablecer-confirmacion')).toBeVisible({
      timeout: 10_000
    })

    await paginaInvitado.goto('/login')
    await esperarHidratacion(paginaInvitado)
    await paginaInvitado.getByLabel('Correo').fill(correoAdmin)
    await paginaInvitado.getByLabel('Contraseña').fill(contrasenaNueva)
    await expect(paginaInvitado.getByTestId('submit-btn')).toBeEnabled({ timeout: 10_000 })
    await paginaInvitado.getByTestId('submit-btn').click()
    await expect(paginaInvitado).toHaveURL(/\/admin/, { timeout: 10_000 })

    await contextoInvitado.close()
  })
})

test.describe('US4 — Configuración de la empresa', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })
  // Ambas pruebas editan la misma empresa E2E compartida (global-setup.ts) — serial evita que
  // T044/T045 se pisen entre sí (mismo problema documentado para T035 en auth.spec.ts).
  test.describe.configure({ mode: 'serial' })

  test('T044: administrador edita configuración de empresa y los cambios persisten', async ({
    page
  }) => {
    const admin = adminSupabaseClient()
    const { data: empresaOriginal } = await admin
      .from('empresas')
      .select('*')
      .eq('rfc', EMPRESA_PRUEBA_RFC)
      .single()

    try {
      await page.goto('/admin/configuracion')
      await esperarHidratacion(page)

      const nuevoTelefono = `555${Date.now().toString().slice(-7)}`
      await page.getByLabel('Teléfono de oficina 1').fill(nuevoTelefono)
      await page.getByTestId('submit-btn').click()
      await expect(page.getByTestId('config-guardada')).toBeVisible({ timeout: 10_000 })

      await page.reload()
      await esperarHidratacion(page)
      await expect(page.getByLabel('Teléfono de oficina 1')).toHaveValue(nuevoTelefono)
    } finally {
      await admin
        .from('empresas')
        .update({ telefono_oficina_1: empresaOriginal!.telefono_oficina_1 })
        .eq('id', empresaOriginal!.id)
    }
  })

  test('T045: cambiar unidad de distancia/combustible no reescribe otros campos de la empresa', async ({
    page
  }) => {
    const admin = adminSupabaseClient()
    const { data: empresaOriginal } = await admin
      .from('empresas')
      .select('*')
      .eq('rfc', EMPRESA_PRUEBA_RFC)
      .single()

    const nuevaUnidad = empresaOriginal!.unidad_distancia === 'km' ? 'millas' : 'km'

    try {
      await page.goto('/admin/configuracion')
      await esperarHidratacion(page)

      // `force: true`: el overlay interno de Vuetify (`.v-field__input`) intercepta el punto de
      // click sobre el `<input>` real que resuelve `getByLabel` — es donde Vuetify engancha su
      // propio manejador de apertura, así que forzar el click ahí sí abre el menú.
      await page.getByLabel('Unidad de distancia').click({ force: true })
      await page
        .getByRole('option', { name: nuevaUnidad === 'millas' ? 'Millas' : 'Kilómetros' })
        .click()
      await page.getByTestId('submit-btn').click()
      await expect(page.getByTestId('config-guardada')).toBeVisible({ timeout: 10_000 })

      const { data: empresaActualizada } = await admin
        .from('empresas')
        .select('*')
        .eq('id', empresaOriginal!.id)
        .single()

      expect(empresaActualizada!.unidad_distancia).toBe(nuevaUnidad)
      expect(empresaActualizada!.nombre).toBe(empresaOriginal!.nombre)
      expect(empresaActualizada!.rfc).toBe(empresaOriginal!.rfc)
      expect(empresaActualizada!.correo).toBe(empresaOriginal!.correo)
    } finally {
      await admin
        .from('empresas')
        .update({ unidad_distancia: empresaOriginal!.unidad_distancia })
        .eq('id', empresaOriginal!.id)
    }
  })
})

test.describe('US7 — Superusuario administra empresas existentes', () => {
  test.use({ storageState: 'tests/e2e/.auth/superusuario.json' })

  test('T060: búsqueda de empresas por nombre y por RFC', async ({ page }) => {
    await page.goto('/superusuario/empresas')
    await esperarHidratacion(page)

    // `clearable` agrega un botón "Clear ..." cuyo aria-label también matchea
    // `getByLabel` por substring — se usa `getByRole('textbox', ...)` para no ambigüar.
    const busqueda = page.getByRole('textbox', { name: 'Buscar por nombre o RFC' })

    // "Empresa E2E" (RFC E2E010101AAA) la siembra global-setup.ts — siempre existe.
    await busqueda.fill('Empresa E2E')
    await expect(page.getByText('Empresa E2E')).toBeVisible()

    await busqueda.fill(EMPRESA_PRUEBA_RFC)
    await expect(page.getByText('Empresa E2E')).toBeVisible()

    await busqueda.fill('no-existe-xyz-123')
    await expect(page.getByText('Sin empresas que mostrar.')).toBeVisible()
  })

  test('T061: desactivar empresa (endpoint real) marca activo=false y notifica a sus administradores', async ({
    page,
    request
  }) => {
    // Empresa propia y desechable a propósito, no la "Empresa E2E" compartida: T027/T044/T045
    // (mismo archivo, corren en paralelo) dependen de que esa empresa siga activa durante toda
    // la corrida — desactivarla ahí, aunque sea momentáneamente, les cierra la sesión a media
    // request (el middleware hace `cerrarSesion()` en cuanto detecta `empresa.activo=false`).
    // El bloqueo de login en sí ya se prueba exhaustivamente en T035 (auth.spec.ts).
    const rfc = rfcUnico()
    const correoAdmin = `admin-t061-${Date.now()}@flotillas.local`

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const altaRespuesta = await request.post('/api/empresas', {
      headers: { cookie: cookieHeader },
      data: {
        empresa: {
          nombre: 'Empresa Desactivación E2E',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Desactivación', correo: correoAdmin }
      }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { empresa_id: empresaId } = await altaRespuesta.json()

    const respuesta = await request.patch(`/api/empresas/${empresaId}/estado`, {
      headers: { cookie: cookieHeader },
      data: { activo: false }
    })
    expect(respuesta.status()).toBe(200)
    expect(await respuesta.json()).toEqual({ id: empresaId, activo: false })

    const admin = adminSupabaseClient()
    const { data: empresaActualizada } = await admin
      .from('empresas')
      .select('activo')
      .eq('id', empresaId)
      .single()
    expect(empresaActualizada!.activo).toBe(false)

    // FR-008.
    const html = await obtenerHtmlCorreo(correoAdmin)
    expect(html).toContain('desactivada')
  })
})

test.describe('US8 — Superusuario gestiona administradores de una empresa', () => {
  test.use({ storageState: 'tests/e2e/.auth/superusuario.json' })

  test('T065: invitar administrador adicional a una empresa existente', async ({
    page,
    request
  }) => {
    const rfc = rfcUnico()
    const correoAdmin1 = `admin1-t065-${Date.now()}@flotillas.local`
    const correoAdmin2 = `admin2-t065-${Date.now()}@flotillas.local`

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const altaRespuesta = await request.post('/api/empresas', {
      headers: { cookie: cookieHeader },
      data: {
        empresa: {
          nombre: 'Empresa Admins E2E',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Admin Uno', correo: correoAdmin1 }
      }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { empresa_id: empresaId } = await altaRespuesta.json()

    await page.goto(`/superusuario/empresas/${empresaId}/administradores`)
    await esperarHidratacion(page)

    await expect(page.getByText('Admin Uno')).toBeVisible()

    await page.getByText('Invitar administrador').click()
    await page.getByLabel('Nombre del administrador').fill('Admin Dos')
    await page.getByLabel('Correo del administrador').fill(correoAdmin2)
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText('Admin Dos')).toBeVisible({ timeout: 10_000 })
  })
})
