import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import {
  esperarHidratacion,
  crearEmpresaConAdmin,
  crearSesionParaUsuario,
  inyectarSesion,
  PASSWORD_PRUEBAS
} from './helpers'

// El caso negativo de RLS (operario sin permiso 'editar' no puede escribir la plantilla) vive en
// tests/e2e/rls.spec.ts, no aquí — mismo criterio que el resto de este proyecto. Los bypass de
// BD (inmutabilidad de checklists/checklist_items) viven en la sección "Polish" de este mismo
// archivo (T032/T033).
//
// Igual que Combustible (007)/Mantenimiento (008): cada test crea su propia empresa aislada
// (`crearEmpresaConAdmin`) en vez de usar la sesión compartida `admin-e2e` — el selector de
// vehículo de `FormularioChecklist.vue` carga todos los vehículos de la empresa sin paginación,
// mismo riesgo del límite de 1000 filas de PostgREST ya encontrado en Combustible.

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function idAdminDeEmpresa(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string) {
  const { data } = await admin.from('usuarios').select('id').eq('empresa_id', empresaId).eq('rol', 'admin').single()
  return data!.id as string
}

async function sembrarVehiculo(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  tipoVehiculoId: string,
  prefijo: string,
  opciones?: { baja?: boolean }
) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const marca = `Vehiculo ${prefijo}`
  const modelo = `M ${sufijo}`
  const placa = `${prefijo}-${sufijo}`
  const { data: vehiculo } = await admin
    .from('vehiculos')
    .insert({
      empresa_id: empresaId,
      marca,
      modelo,
      placa,
      tipo_vehiculo_id: tipoVehiculoId,
      baja: opciones?.baja ?? false
    })
    .select('id')
    .single()
  return { id: vehiculo!.id as string, marca, modelo, placa }
}

async function sembrarItemPlantilla(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  tipoVehiculoId: string,
  prefijo: string,
  opciones?: { orden?: number; esCritico?: boolean }
) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const nombreItem = `${prefijo} ${sufijo}`
  const { data: item } = await admin
    .from('checklist_item_plantillas')
    .insert({
      empresa_id: empresaId,
      tipo_vehiculo_id: tipoVehiculoId,
      nombre_item: nombreItem,
      orden: opciones?.orden ?? 0,
      es_critico: opciones?.esCritico ?? false
    })
    .select('id')
    .single()
  return { id: item!.id as string, nombreItem }
}

/** Crea una empresa aislada + su administrador, inyecta su sesión en el `context` del test, y
 * expone el `tipoVehiculoId` "ligero" auto-sembrado (trigger de Catálogos Base, Feature 002) —
 * ver nota al inicio del archivo sobre por qué no se usa la sesión compartida `admin-e2e`. */
async function prepararEmpresaChecklist(page: Page, context: BrowserContext, prefijo: string) {
  const admin = adminSupabaseClient()
  const { empresaId, correo } = await crearEmpresaConAdmin(admin, {
    nombre: `Empresa Checklist ${prefijo} ${Date.now()}`
  })
  const session = await crearSesionParaUsuario(correo)
  await inyectarSesion(context, session, process.env.SUPABASE_URL!)
  const { data: tipo } = await admin
    .from('tipos_vehiculo')
    .select('id, nombre')
    .eq('empresa_id', empresaId)
    .eq('clave', 'ligero')
    .single()
  return { admin, empresaId, correoAdmin: correo, tipoVehiculoId: tipo!.id as string, tipoVehiculoNombre: tipo!.nombre as string }
}

async function irAPlantilla(page: Page, tipoVehiculoNombre: string) {
  await page.goto('/admin/checklist/plantilla')
  await esperarHidratacion(page)
  await page.getByRole('combobox', { name: 'Tipo de vehículo' }).fill(tipoVehiculoNombre)
  await page.getByRole('option', { name: tipoVehiculoNombre, exact: true }).click()
}

test.describe('US1 — Administrador gestiona la plantilla de checklist por tipo de vehículo', () => {
  test('T007: alta de varios ítems con nombre/orden/"es crítico" queda visible en el listado, ordenado como se capturó', async ({
    page,
    context
  }) => {
    const { tipoVehiculoNombre } = await prepararEmpresaChecklist(page, context, 'T007')

    await irAPlantilla(page, tipoVehiculoNombre)

    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre del ítem', { exact: true }).fill('Botiquín')
    await page.getByLabel('Orden', { exact: true }).fill('2')
    await page.getByTestId('submit-btn').click()
    await expect(page.getByTestId('plantilla-tabla')).toContainText('Botiquín', { timeout: 10_000 })

    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre del ítem', { exact: true }).fill('Extintor')
    await page.getByLabel('Orden', { exact: true }).fill('1')
    await page.getByLabel('Es crítico', { exact: true }).check()
    await page.getByTestId('submit-btn').click()
    await expect(page.getByTestId('plantilla-tabla')).toContainText('Extintor', { timeout: 10_000 })

    const filas = page.locator('[data-testid="plantilla-tabla"] tbody tr')
    await expect(filas).toHaveCount(2)
    await expect(filas.nth(0)).toContainText('Extintor')
    await expect(filas.nth(1)).toContainText('Botiquín')
  })

  test('T008: editar un ítem existente (nombre, orden, "es crítico") guarda los cambios', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId, tipoVehiculoNombre } = await prepararEmpresaChecklist(
      page,
      context,
      'T008'
    )
    const { nombreItem } = await sembrarItemPlantilla(admin, empresaId, tipoVehiculoId, 'T008')

    await irAPlantilla(page, tipoVehiculoNombre)
    await expect(page.getByTestId('plantilla-tabla')).toContainText(nombreItem)
    await page.getByTestId('editar-btn').click()
    await page.getByLabel('Nombre del ítem', { exact: true }).fill('Triángulos T008')
    await page.getByLabel('Orden', { exact: true }).fill('5')
    await page.getByTestId('submit-btn').click()

    await expect(page.getByTestId('plantilla-tabla')).toContainText('Triángulos T008', { timeout: 10_000 })
    await expect(page.getByTestId('plantilla-tabla')).not.toContainText(nombreItem)
  })

  test('T009: editar un ítem de plantilla no reinterpreta un checklist ya capturado (FR-008)', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId, tipoVehiculoNombre } = await prepararEmpresaChecklist(
      page,
      context,
      'T009'
    )
    const { id: itemId, nombreItem } = await sembrarItemPlantilla(admin, empresaId, tipoVehiculoId, 'T009')
    const vehiculo = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T009')
    const adminId = await idAdminDeEmpresa(admin, empresaId)

    const { data: checklist } = await admin
      .from('checklists')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo.id,
        tipo_vehiculo_id: tipoVehiculoId,
        responsable_id: adminId,
        resultado: 'aprobado'
      })
      .select('id')
      .single()
    await admin.from('checklist_items').insert({
      empresa_id: empresaId,
      checklist_id: checklist!.id,
      nombre_item: nombreItem,
      cumple: true,
      es_critico: false,
      plantilla_item_id: itemId
    })

    // Editar el ítem en la plantilla.
    await irAPlantilla(page, tipoVehiculoNombre)
    await page.getByTestId('editar-btn').click()
    await page.getByLabel('Nombre del ítem', { exact: true }).fill('Nombre Editado T009')
    await page.getByTestId('submit-btn').click()
    await expect(page.getByTestId('plantilla-tabla')).toContainText('Nombre Editado T009', { timeout: 10_000 })

    // El checklist ya capturado conserva el nombre ORIGINAL, no el editado.
    await page.goto(`/admin/checklist/${checklist!.id}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('items-tabla')).toContainText(nombreItem)
    await expect(page.getByTestId('items-tabla')).not.toContainText('Nombre Editado T009')
  })

  test('T010: eliminar un ítem de la plantilla ya usado en un checklist capturado lo quita de la plantilla sin afectar la copia ya guardada', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId, tipoVehiculoNombre } = await prepararEmpresaChecklist(
      page,
      context,
      'T010'
    )
    const { id: itemId, nombreItem } = await sembrarItemPlantilla(admin, empresaId, tipoVehiculoId, 'T010')
    const vehiculo = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T010')
    const adminId = await idAdminDeEmpresa(admin, empresaId)

    const { data: checklist } = await admin
      .from('checklists')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo.id,
        tipo_vehiculo_id: tipoVehiculoId,
        responsable_id: adminId,
        resultado: 'aprobado'
      })
      .select('id')
      .single()
    await admin.from('checklist_items').insert({
      empresa_id: empresaId,
      checklist_id: checklist!.id,
      nombre_item: nombreItem,
      cumple: true,
      es_critico: false,
      plantilla_item_id: itemId
    })

    await irAPlantilla(page, tipoVehiculoNombre)
    await expect(page.getByTestId('plantilla-tabla')).toContainText(nombreItem)
    await page.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()
    await expect(page.getByTestId('plantilla-tabla')).not.toContainText(nombreItem, { timeout: 10_000 })

    await page.goto(`/admin/checklist/${checklist!.id}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('items-tabla')).toContainText(nombreItem)
  })

  test('T011: un operario sin el permiso editar no ve disponibles las acciones de alta/edición/eliminación de la plantilla', async ({
    page,
    context
  }) => {
    // El guard global de sección por rol (`app/middleware/auth.global.ts`) redirige a cualquier
    // operario fuera de `/admin/**` antes de que la página monte — mismo comportamiento ya
    // encontrado en Combustible/Mantenimiento (T031/T033), ningún módulo tiene rutas propias
    // bajo `/operario/**` todavía. Esto ya satisface "no ve disponibles las acciones" de forma
    // estructural. La autorización real (RLS) vive en T031 (Polish).
    const { admin, empresaId, tipoVehiculoId } = await prepararEmpresaChecklist(page, context, 'T011')
    await sembrarItemPlantilla(admin, empresaId, tipoVehiculoId, 'T011')

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const correoOperario = `operario-t011-${sufijo}@flotillas.local`
    const { data: authOperario } = await admin.auth.admin.createUser({
      email: correoOperario,
      password: PASSWORD_PRUEBAS,
      email_confirm: true
    })
    await admin.from('usuarios').insert({
      auth_user_id: authOperario!.user.id,
      empresa_id: empresaId,
      nombre: 'Operario T011',
      correo: correoOperario,
      rol: 'operario',
      activo: true
    })
    const sessionOperario = await crearSesionParaUsuario(correoOperario)
    await inyectarSesion(context, sessionOperario, process.env.SUPABASE_URL!)

    await page.goto('/admin/checklist/plantilla')
    await esperarHidratacion(page)
    await expect(page).toHaveURL(/\/operario/)
    await expect(page.getByTestId('nuevo-btn')).toHaveCount(0)
    await expect(page.getByTestId('editar-btn')).toHaveCount(0)
    await expect(page.getByTestId('eliminar-btn')).toHaveCount(0)
  })
})

async function sembrarConductor(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string, prefijo: string) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data: conductor } = await admin
    .from('conductores')
    .insert({
      empresa_id: empresaId,
      nombre: `Conductor ${prefijo}`,
      apellidos: `Apellido ${sufijo}`,
      numero_licencia: `LIC-${prefijo}-${sufijo}`,
      tipo_licencia: 'federal',
      fecha_vencimiento_licencia: '2030-01-01'
    })
    .select('id, nombre, apellidos')
    .single()
  return conductor!
}

async function asignarConductorActivo(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  vehiculoId: string,
  conductorId: string,
  adminId: string
) {
  await admin.from('asignaciones_conductor_vehiculo').insert({
    empresa_id: empresaId,
    vehiculo_id: vehiculoId,
    conductor_id: conductorId,
    asignado_por: adminId
  })
}

/** Igual que `prepararEmpresaChecklist`, pero además siembra un vehículo del tipo "ligero" y un
 * ítem de plantilla para ese tipo — atajo para los tests de US2, que asumen que US1 ya dejó una
 * plantilla configurada (mismo criterio que la dependencia funcional documentada en tasks.md). */
async function prepararEmpresaConPlantilla(page: Page, context: BrowserContext, prefijo: string) {
  const base = await prepararEmpresaChecklist(page, context, prefijo)
  const vehiculo = await sembrarVehiculo(base.admin, base.empresaId, base.tipoVehiculoId, prefijo)
  const item = await sembrarItemPlantilla(base.admin, base.empresaId, base.tipoVehiculoId, prefijo)
  return { ...base, vehiculo, item }
}

async function irANuevoChecklist(page: Page) {
  const esperaVehiculos = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/vehiculos') && r.request().method() === 'GET'
  )
  const esperaConductores = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/conductores') && r.request().method() === 'GET'
  )
  await page.goto('/admin/checklist/nuevo')
  await esperarHidratacion(page)
  await Promise.all([esperaVehiculos, esperaConductores])
}

async function seleccionarVehiculoEnCaptura(page: Page, vehiculoPlaca: string) {
  const esperaPlantilla = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/checklist_item_plantillas') && r.request().method() === 'GET'
  )
  await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculoPlaca)
  await page.getByRole('option', { name: vehiculoPlaca }).first().click()
  await esperaPlantilla
}

/** Vuetify's VAutocomplete only mirrors the model into the `<input>`'s own `value` while the
 * field is focused (see `watch(isFocused, ...)` in VAutocomplete.js) — once a selection is made
 * programmatically (as the conductor auto-fill does) without the field ever gaining focus, the
 * label instead renders in a separate `.v-autocomplete__selection-text` span, so `toHaveValue()`
 * against the input is the wrong assertion here. */
function textoSeleccionConductor(page: Page) {
  return page
    .getByRole('combobox', { name: 'Conductor' })
    .locator('xpath=ancestor::div[contains(@class,"v-input")][1]')
    .locator('.v-autocomplete__selection-text')
}

test.describe('US2 — Administrador o operario realiza un checklist', () => {
  test('T015: captura completa (plantilla cargada automáticamente, todos los ítems marcados, resultado general elegido) queda visible en su detalle con los datos correctos', async ({
    page,
    context
  }) => {
    const { vehiculo, item } = await prepararEmpresaConPlantilla(page, context, 'T015')

    await irANuevoChecklist(page)
    await seleccionarVehiculoEnCaptura(page, vehiculo.placa)
    await expect(page.getByTestId('item-0')).toContainText(item.nombreItem)
    await page.getByTestId('resultado-select').click()
    await page.getByRole('option', { name: 'Aprobado', exact: true }).click()
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/checklist\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('resultado-chip')).toContainText('Aprobado')
    await expect(page.getByTestId('items-tabla')).toContainText(item.nombreItem)
    await expect(page.getByTestId('items-tabla')).toContainText('Cumple')
  })

  test('T016: un vehículo con una asignación de conductor activa precarga ese conductor en el formulario, editable antes de guardar', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaConPlantilla(page, context, 'T016')
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const conductor = await sembrarConductor(admin, empresaId, 'T016')
    await asignarConductorActivo(admin, empresaId, vehiculo.id, conductor.id, adminId)

    await irANuevoChecklist(page)
    await seleccionarVehiculoEnCaptura(page, vehiculo.placa)

    await expect(textoSeleccionConductor(page)).toHaveText(`${conductor.nombre} ${conductor.apellidos}`)
  })

  test('T017: un vehículo sin ninguna asignación de conductor activa deja el campo de conductor vacío, seleccionable manualmente', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaConPlantilla(page, context, 'T017')
    const conductor = await sembrarConductor(admin, empresaId, 'T017')

    await irANuevoChecklist(page)
    await seleccionarVehiculoEnCaptura(page, vehiculo.placa)

    await expect(page.getByRole('combobox', { name: 'Conductor' })).toHaveValue('')
    await page.getByRole('combobox', { name: 'Conductor' }).fill(`${conductor.nombre} ${conductor.apellidos}`)
    await page.getByRole('option', { name: `${conductor.nombre} ${conductor.apellidos}` }).first().click()
    await expect(page.getByRole('combobox', { name: 'Conductor' })).toHaveValue(
      `${conductor.nombre} ${conductor.apellidos}`
    )
  })

  test('T018: marcar un ítem como "no cumple" sin capturar observaciones bloquea el envío antes de guardar', async ({
    page,
    context
  }) => {
    const { vehiculo, item } = await prepararEmpresaConPlantilla(page, context, 'T018')

    await irANuevoChecklist(page)
    await seleccionarVehiculoEnCaptura(page, vehiculo.placa)
    await page.getByTestId('item-0-cumple').getByRole('button', { name: 'No cumple' }).click()
    await page.getByTestId('resultado-select').click()
    await page.getByRole('option', { name: 'Con observaciones', exact: true }).click()
    await page.getByTestId('submit-btn').click()

    await expect(page.getByLabel(`Observaciones de ${item.nombreItem}`)).toBeVisible()
    expect(page.url()).toContain('/admin/checklist/nuevo')
  })

  test('T019: intentar guardar un checklist con todos los ítems marcados pero sin seleccionar el resultado general bloquea el envío (FR-009)', async ({
    page,
    context
  }) => {
    const { vehiculo } = await prepararEmpresaConPlantilla(page, context, 'T019')

    await irANuevoChecklist(page)
    await seleccionarVehiculoEnCaptura(page, vehiculo.placa)
    await page.getByTestId('submit-btn').click()

    // El resultado sigue vacío — el formulario no navega, sigue en /nuevo.
    await page.waitForTimeout(500)
    expect(page.url()).toContain('/admin/checklist/nuevo')
    await expect(page.getByTestId('resultado-select')).toBeVisible()
  })

  test('T020: el selector de vehículo excluye los dados de baja', async ({ page, context }) => {
    const { admin, empresaId, tipoVehiculoId } = await prepararEmpresaChecklist(page, context, 'T020')
    const vehiculoBaja = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T020', { baja: true })

    await irANuevoChecklist(page)
    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculoBaja.placa)
    await expect(page.getByRole('option', { name: vehiculoBaja.placa, exact: true })).toHaveCount(0)
  })

  test('T021: seleccionar un vehículo cuyo tipo no tiene ningún ítem de plantilla configurado bloquea la captura con un mensaje claro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await prepararEmpresaChecklist(page, context, 'T021')
    const vehiculo = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T021')

    await irANuevoChecklist(page)
    await seleccionarVehiculoEnCaptura(page, vehiculo.placa)

    await expect(page.getByTestId('sin-plantilla')).toBeVisible()
    await expect(page.getByTestId('submit-btn')).toBeDisabled()
  })

  test('T022: si el insert de ítems falla tras crear el checklist, el formulario ofrece reintentar contra el mismo checklist ya creado', async ({
    page,
    context
  }) => {
    const { admin, vehiculo } = await prepararEmpresaConPlantilla(page, context, 'T022')

    await irANuevoChecklist(page)
    await seleccionarVehiculoEnCaptura(page, vehiculo.placa)
    await page.getByTestId('resultado-select').click()
    await page.getByRole('option', { name: 'Aprobado', exact: true }).click()

    await page.route('**/rest/v1/checklist_items*', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 500, body: JSON.stringify({ message: 'Fallo simulado (T022)' }) })
      }
      return route.continue()
    })

    await page.getByTestId('submit-btn').click()
    await expect(page.getByTestId('reintentar-items-alert')).toBeVisible({ timeout: 10_000 })

    await page.unroute('**/rest/v1/checklist_items*')
    await page.getByTestId('reintentar-items-btn').click()
    await page.waitForURL((url) => /\/admin\/checklist\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-items')).toContainText('Ítems (1)')

    const { data: checklists } = await admin.from('checklists').select('id').eq('vehiculo_id', vehiculo.id)
    expect(checklists).toHaveLength(1)
  })
})

async function sembrarChecklist(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: {
    empresaId: string
    vehiculoId: string
    tipoVehiculoId: string
    responsableId: string
    conductorId?: string | null
    resultado: Database['public']['Enums']['resultado_checklist']
    fecha?: string
  }
) {
  const { data: checklist } = await admin
    .from('checklists')
    .insert({
      empresa_id: opciones.empresaId,
      vehiculo_id: opciones.vehiculoId,
      tipo_vehiculo_id: opciones.tipoVehiculoId,
      responsable_id: opciones.responsableId,
      conductor_id: opciones.conductorId ?? null,
      resultado: opciones.resultado,
      ...(opciones.fecha ? { fecha: opciones.fecha } : {})
    })
    .select('id')
    .single()
  return checklist!.id as string
}

test.describe('US3 — Administrador o operario consulta checklists realizados', () => {
  test('T027: filtrar por vehículo, rango de fechas, resultado o conductor muestra únicamente los checklists que cumplen ese filtro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await prepararEmpresaChecklist(page, context, 'T027')
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const vehiculoA = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T027A')
    const vehiculoB = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T027B')
    const conductor = await sembrarConductor(admin, empresaId, 'T027')

    await sembrarChecklist(admin, {
      empresaId,
      vehiculoId: vehiculoA.id,
      tipoVehiculoId,
      responsableId: adminId,
      conductorId: conductor.id,
      resultado: 'aprobado',
      fecha: '2026-01-10'
    })
    await sembrarChecklist(admin, {
      empresaId,
      vehiculoId: vehiculoB.id,
      tipoVehiculoId,
      responsableId: adminId,
      resultado: 'con_observaciones',
      fecha: '2026-06-15'
    })

    await page.goto('/admin/checklist')
    await esperarHidratacion(page)
    await expect(page.locator('[data-testid="checklist-tabla"] tbody tr')).toHaveCount(2)

    await page.getByTestId('filtro-vehiculo').click()
    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculoA.placa)
    await page.getByRole('option', { name: vehiculoA.placa }).first().click()
    await expect(page.locator('[data-testid="checklist-tabla"] tbody tr')).toHaveCount(1)
    await expect(page.getByTestId('checklist-tabla')).toContainText(vehiculoA.placa)
    await page.goto('/admin/checklist')
    await esperarHidratacion(page)

    await page.getByTestId('filtro-resultado').click()
    await page.getByRole('option', { name: 'Con observaciones', exact: true }).click()
    await expect(page.locator('[data-testid="checklist-tabla"] tbody tr')).toHaveCount(1)
    await expect(page.getByTestId('checklist-tabla')).toContainText(vehiculoB.placa)
    await page.goto('/admin/checklist')
    await esperarHidratacion(page)

    await page.getByTestId('filtro-conductor').click()
    await page.getByRole('combobox', { name: 'Conductor' }).fill(`${conductor.nombre} ${conductor.apellidos}`)
    await page.getByRole('option', { name: `${conductor.nombre} ${conductor.apellidos}` }).first().click()
    await expect(page.locator('[data-testid="checklist-tabla"] tbody tr')).toHaveCount(1)
    await expect(page.getByTestId('checklist-tabla')).toContainText(vehiculoA.placa)
    await page.goto('/admin/checklist')
    await esperarHidratacion(page)

    await page.getByLabel('Desde', { exact: true }).fill('2026-05-01')
    await expect(page.locator('[data-testid="checklist-tabla"] tbody tr')).toHaveCount(1)
    await expect(page.getByTestId('checklist-tabla')).toContainText(vehiculoB.placa)
  })

  test('T028: el detalle de un checklist muestra todos sus ítems con su estado y observaciones, el responsable y el conductor', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await prepararEmpresaChecklist(page, context, 'T028')
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const { data: adminRow } = await admin.from('usuarios').select('nombre').eq('id', adminId).single()
    const vehiculo = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T028')
    const conductor = await sembrarConductor(admin, empresaId, 'T028')
    const { id: itemId, nombreItem } = await sembrarItemPlantilla(admin, empresaId, tipoVehiculoId, 'T028')

    const checklistId = await sembrarChecklist(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      tipoVehiculoId,
      responsableId: adminId,
      conductorId: conductor.id,
      resultado: 'con_observaciones'
    })
    await admin.from('checklist_items').insert({
      empresa_id: empresaId,
      checklist_id: checklistId,
      nombre_item: nombreItem,
      cumple: false,
      observaciones: 'Falta reemplazar',
      es_critico: true,
      plantilla_item_id: itemId
    })

    await page.goto('/admin/checklist')
    await esperarHidratacion(page)
    await page.getByRole('link', { name: new RegExp(vehiculo.placa) }).click()
    await esperarHidratacion(page)

    await expect(page.getByTestId('resultado-chip')).toContainText('Con observaciones')
    await expect(page.getByTestId('tarjeta-datos')).toContainText(`${conductor.nombre} ${conductor.apellidos}`)
    await expect(page.getByTestId('tarjeta-datos')).toContainText(adminRow!.nombre)
    await expect(page.getByTestId('items-tabla')).toContainText(nombreItem)
    await expect(page.getByTestId('items-tabla')).toContainText('No cumple')
    await expect(page.getByTestId('items-tabla')).toContainText('Falta reemplazar')
    await expect(page.getByTestId('items-tabla')).toContainText('Crítico')
  })
})

test.describe('Polish — inmutabilidad de checklists/checklist_items (FR-010)', () => {
  test('T032: un checklist ya insertado rechaza update y delete incluso para el admin de su propia empresa (bypass de UI, using(false) incondicional)', async ({
    page,
    context
  }) => {
    const { admin, empresaId, correoAdmin, tipoVehiculoId } = await prepararEmpresaChecklist(page, context, 'T032')
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const vehiculo = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T032')

    const { data: checklist } = await admin
      .from('checklists')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo.id,
        tipo_vehiculo_id: tipoVehiculoId,
        responsable_id: adminId,
        resultado: 'aprobado'
      })
      .select('id')
      .single()

    // Cliente autenticado real (no service_role, que bypassea RLS y no demostraría nada).
    const autenticado = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
    const { error: errSignIn } = await autenticado.auth.signInWithPassword({
      email: correoAdmin,
      password: PASSWORD_PRUEBAS
    })
    if (errSignIn) throw errSignIn

    const { data: intentoUpdate } = await autenticado
      .from('checklists')
      .update({ resultado: 'con_observaciones' })
      .eq('id', checklist!.id)
      .select()
    expect(intentoUpdate).toEqual([])

    const { data: intentoDelete } = await autenticado
      .from('checklists')
      .delete()
      .eq('id', checklist!.id)
      .select()
    expect(intentoDelete).toEqual([])

    const { data: sigueExistiendo } = await admin.from('checklists').select('id').eq('id', checklist!.id).single()
    expect(sigueExistiendo).not.toBeNull()
  })

  test('T033: un checklist_item ya insertado rechaza update y delete incluso para el admin de su propia empresa (bypass de UI, using(false) incondicional)', async ({
    page,
    context
  }) => {
    const { admin, empresaId, correoAdmin, tipoVehiculoId } = await prepararEmpresaChecklist(page, context, 'T033')
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const vehiculo = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T033')
    const { nombreItem } = await sembrarItemPlantilla(admin, empresaId, tipoVehiculoId, 'T033')

    const { data: checklist } = await admin
      .from('checklists')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo.id,
        tipo_vehiculo_id: tipoVehiculoId,
        responsable_id: adminId,
        resultado: 'aprobado'
      })
      .select('id')
      .single()
    const { data: item } = await admin
      .from('checklist_items')
      .insert({
        empresa_id: empresaId,
        checklist_id: checklist!.id,
        nombre_item: nombreItem,
        cumple: true,
        es_critico: false
      })
      .select('id')
      .single()

    const autenticado = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
    const { error: errSignIn } = await autenticado.auth.signInWithPassword({
      email: correoAdmin,
      password: PASSWORD_PRUEBAS
    })
    if (errSignIn) throw errSignIn

    const { data: intentoUpdate } = await autenticado
      .from('checklist_items')
      .update({ cumple: false })
      .eq('id', item!.id)
      .select()
    expect(intentoUpdate).toEqual([])

    const { data: intentoDelete } = await autenticado
      .from('checklist_items')
      .delete()
      .eq('id', item!.id)
      .select()
    expect(intentoDelete).toEqual([])

    const { data: sigueExistiendo } = await admin
      .from('checklist_items')
      .select('id')
      .eq('id', item!.id)
      .single()
    expect(sigueExistiendo).not.toBeNull()
  })
})
