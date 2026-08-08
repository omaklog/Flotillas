import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { esperarHidratacion } from './helpers'

const MAILPIT_URL = 'http://127.0.0.1:54424'

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

interface MailpitMensaje {
  ID: string
  To: { Address: string }[]
}

/** Igual que en empresas.spec.ts (T028) — sin helper compartido a propósito, ver la nota ahí
 * sobre por qué cada archivo duplica sus propios helpers de Mailpit. `excluirId` permite pedir
 * específicamente un correo NUEVO, distinto de uno ya visto (usado por T072 para probar que
 * "reenviar invitación" realmente genera un mensaje/enlace distinto, no el mismo de antes). */
async function buscarMensajeInvitacion(
  destinatario: string,
  excluirId?: string
): Promise<{ id: string; html: string }> {
  for (let intento = 0; intento < 20; intento++) {
    const listado: { messages: MailpitMensaje[] } = await fetch(
      `${MAILPIT_URL}/api/v1/messages`
    ).then((r) => r.json())
    const mensaje = listado.messages.find(
      (m) => m.To.some((destino) => destino.Address === destinatario) && m.ID !== excluirId
    )
    if (mensaje) {
      const detalle: { HTML: string } = await fetch(
        `${MAILPIT_URL}/api/v1/message/${mensaje.ID}`
      ).then((r) => r.json())
      return { id: mensaje.ID, html: detalle.HTML }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `No llegó ningún correo${excluirId ? ' nuevo' : ''} a ${destinatario} tras 10s (revisar Mailpit local)`
  )
}

function extraerEnlaceInvitacion(html: string): string {
  const coincidencia = html.match(/<a\s+href="([^"]+)"/)
  if (!coincidencia) throw new Error('No se encontró un enlace <a href> en el correo')
  return coincidencia[1]
}

test.describe('US5 — Administrador invita a un operario', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T049: invitar operario crea usuario con permisos por defecto correctos', async ({
    page,
    request
  }) => {
    const correo = `operario-t049-${Date.now()}@flotillas.local`

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const respuesta = await request.post('/api/usuarios', {
      headers: { cookie: cookieHeader },
      data: { nombre: 'Operario Playwright', correo }
    })
    expect(respuesta.status()).toBe(201)
    const { usuario_id: usuarioId } = await respuesta.json()

    const admin = adminSupabaseClient()
    const { data: permisos } = await admin
      .from('usuario_permisos')
      .select('modulo_clave, accion')
      .eq('usuario_id', usuarioId)

    const modulosVer = permisos!
      .filter((p) => p.accion === 'ver')
      .map((p) => p.modulo_clave)
      .sort()
    const modulosCrear = permisos!
      .filter((p) => p.accion === 'crear')
      .map((p) => p.modulo_clave)
      .sort()

    // Mismo listado que private.otorgar_permisos_default_operario() (schema_03_ver_y_defaults.sql).
    const modulosVerEsperados = [
      'vehiculos',
      'conductores',
      'proveedores',
      'aseguradoras',
      'permisos',
      'tipos_vehiculo',
      'productos',
      'combustible',
      'mantenimiento',
      'checklist',
      'servicios_obligatorios',
      'reportes',
      'alertas',
      'archivos'
    ].sort()
    const modulosCrearEsperados = ['combustible', 'mantenimiento', 'checklist', 'archivos'].sort()

    expect(modulosVer).toEqual(modulosVerEsperados)
    expect(modulosCrear).toEqual(modulosCrearEsperados)
    expect(modulosVer).not.toContain('usuarios')
    expect(modulosVer).not.toContain('configuracion')
  })

  test('T050: operario invitado se muestra como "Pendiente" en el listado', async ({ page }) => {
    await page.goto('/admin/usuarios')
    await esperarHidratacion(page)

    await page.getByText('Invitar operario').click()

    const correo = `operario-t050-${Date.now()}@flotillas.local`
    await page.getByLabel('Nombre del operario').fill('Operario Pendiente T050')
    await page.getByLabel('Correo del operario').fill(correo)
    await page.getByTestId('submit-btn').click()

    await expect(page.getByTestId('invitacion-exitosa')).toBeVisible({ timeout: 10_000 })

    // No se usa `getByText('Pendiente')` a secas: el nombre del operario ("Operario Pendiente
    // T050") también contiene la palabra y genera ambigüedad de modo estricto. Se apunta al
    // chip de estado específico (`estado-<id>`), no al texto libre de la fila.
    const fila = page.locator('tr', { hasText: correo })
    await expect(fila).toBeVisible()
    await expect(fila.locator('[data-testid^="estado-"]')).toHaveText('Pendiente')
  })
})

test.describe('US8 — Superusuario gestiona administradores de una empresa', () => {
  test.use({ storageState: 'tests/e2e/.auth/superusuario.json' })

  test('T066: revocar al último administrador activo de una empresa se rechaza (guard rail)', async ({
    page,
    request
  }) => {
    const azar = Math.random().toString(36).toUpperCase().slice(2, 6)
    const rfc = `T${Date.now().toString(36).toUpperCase().slice(-9)}${azar}`
    const correoAdmin = `admin-t066-${Date.now()}@flotillas.local`

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const altaRespuesta = await request.post('/api/empresas', {
      headers: { cookie: cookieHeader },
      data: {
        empresa: {
          nombre: 'Empresa Guard Rail E2E',
          rfc,
          pais: 'México',
          moneda: 'MXN',
          unidad_distancia: 'km',
          unidad_combustible: 'litros'
        },
        administrador: { nombre: 'Único Admin', correo: correoAdmin }
      }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { usuario_id: adminId } = await altaRespuesta.json()

    const respuesta = await request.patch(`/api/usuarios/${adminId}/estado`, {
      headers: { cookie: cookieHeader },
      data: { activo: false }
    })
    expect(respuesta.status()).toBe(409)
    const body = await respuesta.json()
    // Nitro anida el payload de createError({data}) bajo `data`, no en la raíz (ver empresas.spec.ts).
    expect(body.data.error).toBe('ultimo_administrador')
  })
})

test.describe('US9 — Administrador gestiona operarios existentes', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T070: búsqueda de operarios por nombre y visualización de estado', async ({
    page,
    request
  }) => {
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const nombreUnico = `Operario Busqueda ${Date.now()}`
    const correo = `operario-t070-${Date.now()}@flotillas.local`

    const altaRespuesta = await request.post('/api/usuarios', {
      headers: { cookie: cookieHeader },
      data: { nombre: nombreUnico, correo }
    })
    expect(altaRespuesta.status()).toBe(201)

    await page.goto('/admin/usuarios')
    await esperarHidratacion(page)

    // `clearable` agrega un botón "Clear ..." cuyo aria-label también matchea `getByLabel` por
    // substring (mismo gotcha que T060 en empresas.spec.ts).
    const busqueda = page.getByRole('textbox', { name: 'Buscar por nombre' })

    await busqueda.fill(nombreUnico)
    const fila = page.locator('tr', { hasText: correo })
    await expect(fila).toBeVisible()
    await expect(fila.locator('[data-testid^="estado-"]')).toHaveText('Pendiente')

    await busqueda.fill('nombre-que-no-existe-xyz-123')
    await expect(page.getByText('Sin operarios que mostrar.')).toBeVisible()
  })

  test('T071: desactivar operario bloquea su login y conserva su historial', async ({
    page,
    request,
    browser
  }) => {
    const correo = `operario-t071-${Date.now()}@flotillas.local`
    const contrasena = 'ClaveOperario#2026'

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const altaRespuesta = await request.post('/api/usuarios', {
      headers: { cookie: cookieHeader },
      data: { nombre: 'Operario Desactivar T071', correo }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { usuario_id: operarioId } = await altaRespuesta.json()

    // Establece contraseña directo vía service_role (no se prueba el flujo de invitación aquí
    // — eso ya lo cubre T028 — solo se necesita un operario que SÍ pueda iniciar sesión, para
    // comprobar que dejar de poder hacerlo es un efecto real de la desactivación).
    const admin = adminSupabaseClient()
    const { data: operarioRow } = await admin
      .from('usuarios')
      .select('auth_user_id')
      .eq('id', operarioId)
      .single()
    await admin.auth.admin.updateUserById(operarioRow!.auth_user_id, {
      password: contrasena,
      email_confirm: true
    })

    async function intentarLogin(): Promise<import('@playwright/test').Page> {
      const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const paginaLogin = await contexto.newPage()
      await paginaLogin.goto('/login')
      await esperarHidratacion(paginaLogin)
      await paginaLogin.getByLabel('Correo').fill(correo)
      await paginaLogin.getByLabel('Contraseña').fill(contrasena)
      await expect(paginaLogin.getByTestId('submit-btn')).toBeEnabled({ timeout: 10_000 })
      await paginaLogin.getByTestId('submit-btn').click()
      return paginaLogin
    }

    // Control: puede iniciar sesión ANTES de desactivar.
    const paginaAntes = await intentarLogin()
    await expect(paginaAntes).toHaveURL(/\/operario/, { timeout: 10_000 })
    await paginaAntes.context().close()

    const respuestaEstado = await request.patch(`/api/usuarios/${operarioId}/estado`, {
      headers: { cookie: cookieHeader },
      data: { activo: false }
    })
    expect(respuestaEstado.status()).toBe(200)

    // Login bloqueado DESPUÉS de desactivar.
    const paginaDespues = await intentarLogin()
    await expect(paginaDespues.getByTestId('login-error')).toContainText('desactivada', {
      ignoreCase: true
    })
    await paginaDespues.context().close()

    // Conserva su historial: no se borró, solo se desactivó.
    const { data: sigueExistiendo } = await admin
      .from('usuarios')
      .select('id')
      .eq('id', operarioId)
      .maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })

  test('T072: reenviar invitación a un operario pendiente genera un nuevo enlace', async ({
    page,
    request
  }) => {
    const correo = `operario-t072-${Date.now()}@flotillas.local`
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const altaRespuesta = await request.post('/api/usuarios', {
      headers: { cookie: cookieHeader },
      data: { nombre: 'Operario Reenviar T072', correo }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { usuario_id: operarioId } = await altaRespuesta.json()

    const primero = await buscarMensajeInvitacion(correo)

    const respuesta = await request.post(`/api/usuarios/${operarioId}/reenviar-invitacion`, {
      headers: { cookie: cookieHeader }
    })
    expect(respuesta.status()).toBe(200)
    expect(await respuesta.json()).toEqual({ id: operarioId, reenviado: true })

    const segundo = await buscarMensajeInvitacion(correo, primero.id)

    const enlacePrimero = extraerEnlaceInvitacion(primero.html)
    const enlaceSegundo = extraerEnlaceInvitacion(segundo.html)
    expect(enlaceSegundo).not.toBe(enlacePrimero)
  })

  test('T073: eliminar un operario con operaciones registradas se rechaza y ofrece desactivar (FR-024)', async ({
    page,
    request
  }) => {
    const correo = `operario-t073-${Date.now()}@flotillas.local`
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const altaRespuesta = await request.post('/api/usuarios', {
      headers: { cookie: cookieHeader },
      data: { nombre: 'Operario Con Registros T073', correo }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { usuario_id: operarioId } = await altaRespuesta.json()

    const admin = adminSupabaseClient()
    const { data: operarioRow } = await admin
      .from('usuarios')
      .select('empresa_id')
      .eq('id', operarioId)
      .single()
    const empresaId = operarioRow!.empresa_id!

    // No hay UI/API para checklists todavía (módulo fuera de esta feature) — se siembra a mano
    // vía service_role solo lo necesario para ejercer el guard de integridad referencial de
    // DELETE /api/usuarios/:id.
    const { data: tipoVehiculo } = await admin
      .from('tipos_vehiculo')
      .insert({ empresa_id: empresaId, clave: `t073_${Date.now()}`, nombre: 'Tipo T073' })
      .select('id')
      .single()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: 'Marca T073',
        modelo: 'Modelo T073',
        placa: `T073-${Date.now()}`,
        tipo_vehiculo_id: tipoVehiculo!.id
      })
      .select('id')
      .single()
    await admin.from('checklists').insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculo!.id,
      tipo_vehiculo_id: tipoVehiculo!.id,
      responsable_id: operarioId,
      resultado: 'aprobado'
    })

    const respuesta = await request.delete(`/api/usuarios/${operarioId}`, {
      headers: { cookie: cookieHeader }
    })
    expect(respuesta.status()).toBe(409)
    const body = await respuesta.json()
    expect(body.data.error).toBe('tiene_operaciones_registradas')
    expect(body.data.sugerencia).toBe('desactivar')

    const { data: sigueExistiendo } = await admin
      .from('usuarios')
      .select('id')
      .eq('id', operarioId)
      .maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })

  test('T074: eliminar un operario sin operaciones registradas sí procede', async ({
    page,
    request
  }) => {
    const correo = `operario-t074-${Date.now()}@flotillas.local`
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const altaRespuesta = await request.post('/api/usuarios', {
      headers: { cookie: cookieHeader },
      data: { nombre: 'Operario Sin Registros T074', correo }
    })
    expect(altaRespuesta.status()).toBe(201)
    const { usuario_id: operarioId } = await altaRespuesta.json()

    const respuesta = await request.delete(`/api/usuarios/${operarioId}`, {
      headers: { cookie: cookieHeader }
    })
    expect(respuesta.status()).toBe(200)
    expect(await respuesta.json()).toEqual({ id: operarioId, eliminado: true })

    const admin = adminSupabaseClient()
    const { data: yaNoExiste } = await admin
      .from('usuarios')
      .select('id')
      .eq('id', operarioId)
      .maybeSingle()
    expect(yaNoExiste).toBeNull()
  })
})
