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

// El caso negativo de RLS (operario sin permiso 'cancelar' no puede cancelar) vive en
// tests/e2e/rls.spec.ts, no aquí — mismo criterio que el resto de este proyecto. Los bypass de
// BD (inmutabilidad, odómetro) viven en la sección "Polish" de este mismo archivo (T037/T038).
//
// A diferencia del resto de las features de este proyecto, estos tests NO usan la sesión
// compartida `admin-e2e` (`.auth/admin.json`) — cada test crea su propia empresa aislada
// (`crearEmpresaConAdmin`). Razón: `FormularioCarga.vue` carga TODOS los vehículos/proveedores
// de la empresa sin paginación (`useVehiculos().listar()`/`useProveedores().listar()` sin
// término de búsqueda) para poblar los `v-autocomplete`; la "Empresa E2E" compartida acumuló
// 1400+ vehículos de sesiones anteriores, y PostgREST limita a 1000 filas por respuesta sin
// `range()` explícito — un vehículo sembrado nuevo podía no venir en absoluto en la respuesta
// (bug real encontrado durante esta feature: "No data available" persistente pese a esperar la
// respuesta de red, porque la fila sembrada simplemente no estaba en las primeras 1000
// devueltas). Una empresa aislada por test, con 1 solo vehículo/proveedor, evita el problema de
// raíz en vez de trabajar alrededor de él.

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

function pdfDePrueba(nombre = 'factura.pdf') {
  return { name: nombre, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 contenido de prueba') }
}

function fechaEnDias(dias: number): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

async function sembrarVehiculo(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  prefijo: string,
  opciones?: { baja?: boolean }
) {
  const { data: tipo } = await admin
    .from('tipos_vehiculo')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('clave', 'ligero')
    .single()
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
      tipo_vehiculo_id: tipo!.id,
      baja: opciones?.baja ?? false
    })
    .select('id')
    .single()
  return { id: vehiculo!.id as string, marca, modelo, placa }
}

async function sembrarProveedor(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  prefijo: string,
  opciones?: { activo?: boolean }
) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const nombre = `Proveedor ${prefijo} ${sufijo}`
  const { data: proveedor } = await admin
    .from('proveedores')
    .insert({ empresa_id: empresaId, nombre, activo: opciones?.activo ?? true })
    .select('id')
    .single()
  return { id: proveedor!.id as string, nombre }
}

async function sembrarProductoCombustible(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  prefijo: string
) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const nombre = `Diesel ${prefijo} ${sufijo}`
  const { data: producto } = await admin
    .from('productos')
    .insert({ empresa_id: empresaId, nombre, tipo: 'combustible' })
    .select('id')
    .single()
  return { id: producto!.id as string, nombre }
}

/** Crea una empresa aislada + su administrador, inyecta su sesión en el `context` del test, y
 * siembra un vehículo/proveedor/producto de combustible activos listos para capturar — ver nota
 * al inicio del archivo sobre por qué no se usa la sesión compartida `admin-e2e`. */
async function prepararEmpresaCombustible(page: Page, context: BrowserContext, prefijo: string) {
  const admin = adminSupabaseClient()
  const { empresaId, correo } = await crearEmpresaConAdmin(admin, {
    nombre: `Empresa Combustible ${prefijo} ${Date.now()}`
  })
  const session = await crearSesionParaUsuario(correo)
  await inyectarSesion(context, session, process.env.SUPABASE_URL!)
  const vehiculo = await sembrarVehiculo(admin, empresaId, prefijo)
  const proveedor = await sembrarProveedor(admin, empresaId, prefijo)
  const producto = await sembrarProductoCombustible(admin, empresaId, prefijo)
  return { admin, empresaId, vehiculo, proveedor, producto }
}

/**
 * Selecciona una opción de un `v-autocomplete` por su label visible — mismo patrón ya usado en
 * Vehículos (`Tipo de vehículo`). Match parcial (no exacto): el ítem del selector de Vehículo
 * muestra "marca modelo — placa" completo, así que filtrar/matchear solo por la placa (el dato
 * único que el test conoce) requiere una coincidencia de subcadena, no de texto completo.
 */
async function seleccionarAutocomplete(page: Page, label: string, filtro: string) {
  const combobox = page.getByRole('combobox', { name: label })
  await combobox.fill(filtro)
  await page.getByRole('option', { name: filtro }).first().click()
}

/** Navega al formulario de captura y espera a que las 3 llamadas `listar()` de
 * `FormularioCarga.vue` (vehículos/proveedores/productos) resuelvan antes de devolver el
 * control — `esperarHidratacion()` sola no basta, solo confirma que Vue hidrató. */
async function irAFormularioCarga(page: Page) {
  const esperaVehiculos = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/vehiculos') && r.request().method() === 'GET'
  )
  const esperaProveedores = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/proveedores') && r.request().method() === 'GET'
  )
  const esperaProductos = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/productos') && r.request().method() === 'GET'
  )
  await page.goto('/admin/combustible/nuevo')
  await esperarHidratacion(page)
  await Promise.all([esperaVehiculos, esperaProveedores, esperaProductos])
}

type DatosCarga = {
  vehiculoPlaca: string
  proveedorNombre: string
  productoNombre: string
  fecha: string
  odometro: number | string
  cantidad: number | string
  costoUnitario: number | string
}

async function llenarFormularioCarga(page: Page, datos: DatosCarga) {
  await seleccionarAutocomplete(page, 'Vehículo', datos.vehiculoPlaca)
  await seleccionarAutocomplete(page, 'Proveedor', datos.proveedorNombre)
  await seleccionarAutocomplete(page, 'Producto', datos.productoNombre)
  await page.getByLabel('Fecha', { exact: true }).fill(datos.fecha)
  await page.getByLabel('Odómetro', { exact: true }).fill(String(datos.odometro))
  await page.getByLabel('Cantidad', { exact: true }).fill(String(datos.cantidad))
  await page.getByLabel('Costo unitario', { exact: true }).fill(String(datos.costoUnitario))
}

/** Captura una carga completa vía UI y devuelve su id (extraído de la URL de detalle a la que
 * redirige `nuevo.vue` tras guardar). Asume que ya se navegó al formulario
 * (`irAFormularioCarga`). */
async function enviarFormularioCarga(page: Page, datos: DatosCarga): Promise<string> {
  await llenarFormularioCarga(page, datos)
  await page.getByTestId('submit-btn').click()
  await page.waitForURL((url) => /\/admin\/combustible\/[0-9a-f-]+$/.test(url.pathname), {
    timeout: 10_000
  })
  const match = page.url().match(/\/admin\/combustible\/([0-9a-f-]+)$/)
  return match![1]
}

test.describe('US1 — Administrador captura una carga de combustible', () => {
  test('T007: captura completa sin factura, costo total autocalculado', async ({ page, context }) => {
    const { vehiculo, proveedor, producto } = await prepararEmpresaCombustible(page, context, 'T007')

    await irAFormularioCarga(page)
    await llenarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-01',
      odometro: 10000,
      cantidad: 40,
      costoUnitario: 22.5
    })
    await expect(page.getByLabel('Costo total', { exact: true })).toHaveValue('900')
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/combustible\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-datos')).toContainText('40')
    await expect(page.getByTestId('tarjeta-datos')).toContainText('900')
    await expect(page.getByTestId('estado-chip')).toContainText('Activa')
  })

  test('T008: override manual del costo total persiste hasta el siguiente cambio de cantidad/costo unitario', async ({
    page,
    context
  }) => {
    const { vehiculo, proveedor, producto } = await prepararEmpresaCombustible(page, context, 'T008')

    await irAFormularioCarga(page)
    await llenarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-01',
      odometro: 5000,
      cantidad: 10,
      costoUnitario: 20
    })
    await expect(page.getByLabel('Costo total', { exact: true })).toHaveValue('200')

    // Sobreescribe manualmente.
    await page.getByLabel('Costo total', { exact: true }).fill('150')
    await expect(page.getByLabel('Costo total', { exact: true })).toHaveValue('150')

    // Cambiar cantidad vuelve a autocalcular, descartando el valor manual.
    await page.getByLabel('Cantidad', { exact: true }).fill('12')
    await expect(page.getByLabel('Costo total', { exact: true })).toHaveValue('240')

    await page.getByTestId('submit-btn').click()
    await page.waitForURL((url) => /\/admin\/combustible\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-datos')).toContainText('240')
  })

  test('T009: captura con factura adjunta la deja asociada y visible en el detalle', async ({ page, context }) => {
    const { vehiculo, proveedor, producto } = await prepararEmpresaCombustible(page, context, 'T009')

    await irAFormularioCarga(page)
    await llenarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-01',
      odometro: 3000,
      cantidad: 20,
      costoUnitario: 20
    })
    await page.getByTestId('factura-input').setInputFiles(pdfDePrueba())
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/combustible\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('historial-factura-tabla')).toBeVisible()
    const items = page.locator('[data-testid^="historial-factura-item-"]')
    await expect(items).toHaveCount(1, { timeout: 10_000 })
    await expect(items.first()).toContainText('Vigente')
  })

  test('T010: reemplazar la factura conserva la versión anterior en el historial', async ({ page, context }) => {
    const { vehiculo, proveedor, producto } = await prepararEmpresaCombustible(page, context, 'T010')

    await irAFormularioCarga(page)
    await llenarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-01',
      odometro: 1,
      cantidad: 1,
      costoUnitario: 1
    })
    await page.getByTestId('factura-input').setInputFiles(pdfDePrueba())
    await page.getByTestId('submit-btn').click()
    await page.waitForURL((url) => /\/admin\/combustible\/[0-9a-f-]+$/.test(url.pathname), { timeout: 10_000 })
    await esperarHidratacion(page)

    await expect(page.getByTestId('historial-factura-tabla')).toBeVisible()
    await page.getByTestId('subir-factura-btn').click()
    await page.getByTestId('subir-factura-input').setInputFiles(pdfDePrueba('reemplazo.pdf'))
    await page.getByTestId('confirmar-subida-factura-btn').click()

    const items = page.locator('[data-testid^="historial-factura-item-"]')
    await expect(items).toHaveCount(2, { timeout: 10_000 })
    await expect(items.nth(0)).toContainText('Vigente')
    await expect(items.nth(1)).toContainText('Anterior')
  })

  test('T011: odómetro menor al de la última carga activa se rechaza antes de guardar', async ({ page, context }) => {
    const { vehiculo, proveedor, producto } = await prepararEmpresaCombustible(page, context, 'T011')

    await irAFormularioCarga(page)
    await enviarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-01',
      odometro: 10000,
      cantidad: 10,
      costoUnitario: 10
    })

    await irAFormularioCarga(page)
    await llenarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-02',
      odometro: 9000,
      cantidad: 10,
      costoUnitario: 10
    })
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText(/no puede ser menor al de la última carga activa/i)).toBeVisible()
    expect(page.url()).toContain('/admin/combustible/nuevo')
  })

  test('T012: odómetro igual al de la última carga activa se acepta', async ({ page, context }) => {
    const { vehiculo, proveedor, producto } = await prepararEmpresaCombustible(page, context, 'T012')

    await irAFormularioCarga(page)
    await enviarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-01',
      odometro: 5000,
      cantidad: 10,
      costoUnitario: 10
    })

    await irAFormularioCarga(page)
    await llenarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-02',
      odometro: 5000,
      cantidad: 5,
      costoUnitario: 10
    })
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/combustible\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
  })

  test('T013: un vehículo sin cargas activas previas acepta cualquier odómetro', async ({ page, context }) => {
    const { vehiculo, proveedor, producto } = await prepararEmpresaCombustible(page, context, 'T013')

    await irAFormularioCarga(page)
    await llenarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-01',
      odometro: 1,
      cantidad: 1,
      costoUnitario: 1
    })
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/combustible\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
  })

  test('T014: el selector de vehículo excluye los dados de baja; el de proveedor excluye los inactivos', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaCombustible(page, context, 'T014')
    const vehiculoBaja = await sembrarVehiculo(admin, empresaId, 'T014Baja', { baja: true })
    const proveedorInactivo = await sembrarProveedor(admin, empresaId, 'T014Inactivo', { activo: false })

    await irAFormularioCarga(page)

    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculoBaja.placa)
    await expect(page.getByRole('option', { name: vehiculoBaja.placa, exact: true })).toHaveCount(0)

    await page.getByRole('combobox', { name: 'Proveedor' }).fill(proveedorInactivo.nombre)
    await expect(page.getByRole('option', { name: proveedorInactivo.nombre, exact: true })).toHaveCount(0)
  })

  test('T015: sin productos de tipo combustible, el formulario muestra un mensaje claro en vez de un selector vacío', async ({
    page,
    context
  }) => {
    const admin = adminSupabaseClient()
    const { correo } = await crearEmpresaConAdmin(admin, {
      nombre: `Empresa Sin Combustible T015 ${Date.now()}`
    })
    const session = await crearSesionParaUsuario(correo)
    await inyectarSesion(context, session, process.env.SUPABASE_URL!)

    await irAFormularioCarga(page)

    await expect(page.getByTestId('sin-productos-combustible')).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Producto' })).toHaveCount(0)
  })

  test('T016: el campo fecha no admite una fecha posterior a hoy', async ({ page, context }) => {
    const { vehiculo, proveedor, producto } = await prepararEmpresaCombustible(page, context, 'T016')

    await irAFormularioCarga(page)
    await llenarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: fechaEnDias(5),
      odometro: 1,
      cantidad: 1,
      costoUnitario: 1
    })
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText(/la fecha no puede ser posterior a hoy/i)).toBeVisible()
    expect(page.url()).toContain('/admin/combustible/nuevo')
  })

  test('T017: si la subida de la factura falla, la carga ya creada se conserva sin factura', async ({
    page,
    context
  }) => {
    const { vehiculo, proveedor, producto } = await prepararEmpresaCombustible(page, context, 'T017')

    await page.route('**/storage/v1/object/documentos/**', (route) =>
      route.fulfill({ status: 500, body: 'Fallo simulado de subida (T017)' })
    )

    await irAFormularioCarga(page)
    await llenarFormularioCarga(page, {
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      productoNombre: producto.nombre,
      fecha: '2026-08-01',
      odometro: 1,
      cantidad: 1,
      costoUnitario: 1
    })
    await page.getByTestId('factura-input').setInputFiles(pdfDePrueba())
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/combustible\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('historial-factura-tabla')).toContainText('Sin factura adjunta')
  })
})

async function sembrarCarga(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: {
    empresaId: string
    vehiculoId: string
    proveedorId: string
    productoId: string
    adminId: string
    fecha: string
    odometro?: number
    cantidad?: number
    costoUnitario?: number
  }
) {
  const { data: carga } = await admin
    .from('cargas_combustible')
    .insert({
      empresa_id: opciones.empresaId,
      vehiculo_id: opciones.vehiculoId,
      proveedor_id: opciones.proveedorId,
      producto_id: opciones.productoId,
      fecha: opciones.fecha,
      odometro: opciones.odometro ?? 1000,
      cantidad: opciones.cantidad ?? 10,
      costo_unitario: opciones.costoUnitario ?? 10,
      costo_total: (opciones.cantidad ?? 10) * (opciones.costoUnitario ?? 10),
      creado_por: opciones.adminId
    })
    .select('id')
    .single()
  return carga!.id as string
}

test.describe('US2 — Administrador consulta el listado de cargas de combustible', () => {
  test('T022: filtrar por vehículo, rango de fechas, proveedor o estado muestra únicamente las cargas que cumplen ese filtro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T022'
    )
    const vehiculo2 = await sembrarVehiculo(admin, empresaId, 'T022b')
    const proveedor2 = await sembrarProveedor(admin, empresaId, 'T022b')
    const { data: perfilAdmin } = await admin
      .from('usuarios')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('rol', 'admin')
      .single()
    const adminId = perfilAdmin!.id as string

    const cargaA = await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId,
      fecha: '2026-08-01'
    })
    const cargaB = await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo2.id,
      proveedorId: proveedor2.id,
      productoId: producto.id,
      adminId,
      fecha: '2026-08-10'
    })

    await page.goto('/admin/combustible')
    await esperarHidratacion(page)
    await expect(page.getByTestId('combustible-tabla')).toContainText(vehiculo.placa)
    await expect(page.getByTestId('combustible-tabla')).toContainText(vehiculo2.placa)

    // Filtro por vehículo.
    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculo.placa)
    await page.getByRole('option', { name: vehiculo.placa }).first().click()
    await expect(page.locator('[data-testid="combustible-tabla"] tbody tr')).toHaveCount(1, {
      timeout: 10_000
    })
    await expect(page.getByTestId('combustible-tabla')).toContainText(vehiculo.placa)
    await expect(page.getByTestId('combustible-tabla')).not.toContainText(vehiculo2.placa)
    await page.getByRole('combobox', { name: 'Vehículo' }).fill('')
    await page.keyboard.press('Escape')

    // Filtro por rango de fechas (solo cargaA, 2026-08-01).
    await page.getByLabel('Desde', { exact: true }).fill('2026-08-01')
    await page.getByLabel('Hasta', { exact: true }).fill('2026-08-05')
    await expect(page.locator('[data-testid="combustible-tabla"] tbody tr')).toHaveCount(1, {
      timeout: 10_000
    })
    await expect(page.getByTestId('combustible-tabla')).toContainText(vehiculo.placa)
    await page.getByLabel('Desde', { exact: true }).fill('')
    await page.getByLabel('Hasta', { exact: true }).fill('')

    // Filtro por proveedor.
    await page.getByRole('combobox', { name: 'Proveedor' }).fill(proveedor2.nombre)
    await page.getByRole('option', { name: proveedor2.nombre }).first().click()
    await expect(page.locator('[data-testid="combustible-tabla"] tbody tr')).toHaveCount(1, {
      timeout: 10_000
    })
    await expect(page.getByTestId('combustible-tabla')).toContainText(vehiculo2.placa)
    await page.getByRole('combobox', { name: 'Proveedor' }).fill('')
    await page.keyboard.press('Escape')

    // Filtro por estado: cancelar cargaB y filtrar por 'Activa'.
    await admin
      .from('cargas_combustible')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Prueba T022' })
      .eq('id', cargaB)
    await page.getByTestId('filtro-estado').click()
    await page.getByRole('option', { name: 'Activa' }).click()
    await expect(page.locator('[data-testid="combustible-tabla"] tbody tr')).toHaveCount(1, {
      timeout: 10_000
    })
    await expect(page.getByTestId('combustible-tabla')).toContainText(vehiculo.placa)
    expect(cargaA).toBeTruthy()
  })

  test('T023: cada fila del listado muestra vehículo, fecha, cantidad, costo total y estado', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T023'
    )
    const { data: perfilAdmin } = await admin
      .from('usuarios')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('rol', 'admin')
      .single()
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId: perfilAdmin!.id as string,
      fecha: '2026-08-01',
      cantidad: 33,
      costoUnitario: 5
    })

    await page.goto('/admin/combustible')
    await esperarHidratacion(page)
    const fila = page.locator('[data-testid="combustible-tabla"] tbody tr').first()
    await expect(fila).toContainText(vehiculo.placa)
    await expect(fila).toContainText('33')
    await expect(fila).toContainText('165')
    await expect(fila).toContainText('Activa')
  })

  test('T024: una carga cancelada se muestra junto con las activas, distinguida visualmente', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T024'
    )
    const { data: perfilAdmin } = await admin
      .from('usuarios')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('rol', 'admin')
      .single()
    const cargaId = await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId: perfilAdmin!.id as string,
      fecha: '2026-08-01'
    })
    await admin
      .from('cargas_combustible')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Prueba T024' })
      .eq('id', cargaId)

    await page.goto('/admin/combustible')
    await esperarHidratacion(page)
    await expect(page.getByTestId(`estado-${cargaId}`)).toContainText('Cancelada')
  })

  test('T025: un vehículo dado de baja con cargas ya capturadas no aparece como opción del filtro, pero sus cargas siguen visibles sin ese filtro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T025'
    )
    const { data: perfilAdmin } = await admin
      .from('usuarios')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('rol', 'admin')
      .single()
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId: perfilAdmin!.id as string,
      fecha: '2026-08-01'
    })
    await admin.from('vehiculos').update({ baja: true }).eq('id', vehiculo.id)

    await page.goto('/admin/combustible')
    await esperarHidratacion(page)
    await expect(page.getByTestId('combustible-tabla')).toContainText(vehiculo.placa)

    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculo.placa)
    await expect(page.getByRole('option', { name: vehiculo.placa, exact: true })).toHaveCount(0)
  })
})

/** Crea un operario aislado (usuario propio, sin más permisos que los defaults del trigger
 * `otorgar_permisos_default_operario` — ver+crear en combustible, sin cancelar) dentro de la
 * empresa dada. Mismo criterio que `rls.spec.ts`: aislado para no depender de estado
 * compartido. */
async function crearOperarioAislado(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string, prefijo: string) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const correo = `operario-${prefijo}-${sufijo}@flotillas.local`
  const { data: authOperario, error: errAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: PASSWORD_PRUEBAS,
    email_confirm: true
  })
  if (errAuth) throw errAuth
  await admin.from('usuarios').insert({
    auth_user_id: authOperario!.user.id,
    empresa_id: empresaId,
    nombre: `Operario ${prefijo}`,
    correo,
    rol: 'operario',
    activo: true
  })
  return { correo, authUserId: authOperario!.user.id }
}

async function idAdminDeEmpresa(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string) {
  const { data } = await admin.from('usuarios').select('id').eq('empresa_id', empresaId).eq('rol', 'admin').single()
  return data!.id as string
}

test.describe('US3 — Administrador cancela una carga de combustible', () => {
  test('T028: cancelar una carga activa con un motivo válido la deja cancelado de forma permanente', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T028'
    )
    const cargaId = await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId: await idAdminDeEmpresa(admin, empresaId),
      fecha: '2026-08-01'
    })

    await page.goto(`/admin/combustible/${cargaId}`)
    await esperarHidratacion(page)
    await page.getByTestId('cancelar-btn').click()
    await page.getByTestId('dialogo-cancelar-motivo').locator('textarea').fill('Captura duplicada')
    await page.getByTestId('dialogo-cancelar-confirmar').click()

    await expect(page.getByTestId('estado-chip')).toContainText('Cancelada', { timeout: 10_000 })
    const { data: cargaDb } = await admin.from('cargas_combustible').select('estado').eq('id', cargaId).single()
    expect(cargaDb!.estado).toBe('cancelado')
  })

  test('T029: intentar confirmar la cancelación sin capturar un motivo la bloquea', async ({ page, context }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T029'
    )
    const cargaId = await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId: await idAdminDeEmpresa(admin, empresaId),
      fecha: '2026-08-01'
    })

    await page.goto(`/admin/combustible/${cargaId}`)
    await esperarHidratacion(page)
    await page.getByTestId('cancelar-btn').click()

    await expect(page.getByTestId('dialogo-cancelar-confirmar')).toBeDisabled()
  })

  test('T030: una carga ya cancelada no ofrece reactivar, editar su motivo, ni reemplazar su factura', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T030'
    )
    const cargaId = await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId: await idAdminDeEmpresa(admin, empresaId),
      fecha: '2026-08-01'
    })
    await admin
      .from('cargas_combustible')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Prueba T030' })
      .eq('id', cargaId)

    await page.goto(`/admin/combustible/${cargaId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('cancelar-btn')).toHaveCount(0)
    await expect(page.getByTestId('subir-factura-btn')).toHaveCount(0)
    await expect(page.getByTestId('motivo-cancelacion')).toContainText('Prueba T030')
  })

  test('T031: un usuario sin el permiso cancelar no ve disponible la acción de cancelar sobre una carga activa', async ({
    page,
    context
  }) => {
    // El guard global de sección por rol (`app/middleware/auth.global.ts`) redirige a cualquier
    // operario fuera de `/admin/**` antes de que la página monte — mismo comportamiento en toda
    // la app, ningún módulo tiene todavía rutas propias bajo `/operario/**`. Esto ya satisface
    // "no ve disponible la acción" de forma estructural (nunca llega ni a ver el detalle). La
    // verificación de autorización real (RLS, vía cliente directo) vive en T036 — mismo criterio
    // que el resto de los tests de RLS de este proyecto (rls.spec.ts), que nunca navegan a
    // `/admin/**` como operario, siempre atacan el cliente Supabase directo.
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T031'
    )
    const cargaId = await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId: await idAdminDeEmpresa(admin, empresaId),
      fecha: '2026-08-01'
    })

    const { correo } = await crearOperarioAislado(admin, empresaId, 'T031')
    const sessionOperario = await crearSesionParaUsuario(correo)
    await inyectarSesion(context, sessionOperario, process.env.SUPABASE_URL!)

    await page.goto(`/admin/combustible/${cargaId}`)
    await esperarHidratacion(page)
    await expect(page).toHaveURL(/\/operario/)
    await expect(page.getByTestId('cancelar-btn')).toHaveCount(0)
  })

  test('T032: cancelar una carga genera una fila en auditoría con accion cancelar, no editar a secas', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T032'
    )
    const cargaId = await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId: await idAdminDeEmpresa(admin, empresaId),
      fecha: '2026-08-01'
    })

    await page.goto(`/admin/combustible/${cargaId}`)
    await esperarHidratacion(page)
    await page.getByTestId('cancelar-btn').click()
    await page.getByTestId('dialogo-cancelar-motivo').locator('textarea').fill('Prueba de auditoria T032')
    await page.getByTestId('dialogo-cancelar-confirmar').click()
    await expect(page.getByTestId('estado-chip')).toContainText('Cancelada', { timeout: 10_000 })

    const { data: auditoria } = await admin
      .from('auditoria')
      .select('accion')
      .eq('entidad', 'cargas_combustible')
      .eq('entidad_id', cargaId)
      .order('created_at', { ascending: true })

    const acciones = auditoria!.map((fila) => fila.accion)
    expect(acciones).toContain('crear')
    expect(acciones).toContain('cancelar')
    expect(acciones).not.toContain('editar')
  })
})

test.describe('Polish — bypass de UI contra las validaciones de base de datos', () => {
  test('T037: un intento directo (sin pasar por la UI) de editar un campo operativo de una carga activa se rechaza', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T037'
    )
    const cargaId = await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId: await idAdminDeEmpresa(admin, empresaId),
      fecha: '2026-08-01',
      cantidad: 10
    })

    const { error } = await admin.from('cargas_combustible').update({ cantidad: 999 }).eq('id', cargaId)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/inmutable/i)

    const { data: cargaDb } = await admin.from('cargas_combustible').select('cantidad').eq('id', cargaId).single()
    expect(cargaDb!.cantidad).toBe(10)
  })

  test('T038: un intento directo (sin pasar por la UI) de insertar con un odómetro menor al de la última carga activa se rechaza', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, producto } = await prepararEmpresaCombustible(
      page,
      context,
      'T038'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      productoId: producto.id,
      adminId,
      fecha: '2026-08-01',
      odometro: 5000
    })

    const { error } = await admin.from('cargas_combustible').insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculo.id,
      proveedor_id: proveedor.id,
      producto_id: producto.id,
      fecha: '2026-08-02',
      odometro: 4000,
      cantidad: 10,
      costo_unitario: 10,
      costo_total: 100,
      creado_por: adminId
    })
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/no puede ser menor/i)
  })
})
