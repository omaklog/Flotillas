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
// BD (inmutabilidad de la orden, inmutabilidad de las líneas) viven en la sección "Polish" de
// este mismo archivo (T039/T040).
//
// Igual que Combustible (007): cada test crea su propia empresa aislada (`crearEmpresaConAdmin`)
// en vez de usar la sesión compartida `admin-e2e`. Razón: `FormularioOrden.vue` carga TODOS los
// vehículos/proveedores/productos de la empresa sin paginación para poblar sus
// `v-autocomplete`; la "Empresa E2E" compartida acumuló miles de registros de sesiones
// anteriores y PostgREST limita a 1000 filas por respuesta sin `range()` explícito — un registro
// recién sembrado podía no venir en absoluto en la respuesta (bug real encontrado durante
// Combustible, ver `tests/e2e/combustible.spec.ts`).

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

async function sembrarProducto(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  prefijo: string,
  tipo: Database['public']['Enums']['tipo_producto']
) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const nombre = `${tipo} ${prefijo} ${sufijo}`
  const { data: producto } = await admin
    .from('productos')
    .insert({ empresa_id: empresaId, nombre, tipo })
    .select('id')
    .single()
  return { id: producto!.id as string, nombre }
}

/** Crea una empresa aislada + su administrador, inyecta su sesión en el `context` del test, y
 * siembra un vehículo/proveedor activos + 1 producto de cada tipo relevante (llanta, servicio,
 * refacción, consumible, combustible — este último para probar su exclusión, FR-004). */
async function prepararEmpresaMantenimiento(page: Page, context: BrowserContext, prefijo: string) {
  const admin = adminSupabaseClient()
  const { empresaId, correo } = await crearEmpresaConAdmin(admin, {
    nombre: `Empresa Mantenimiento ${prefijo} ${Date.now()}`
  })
  const session = await crearSesionParaUsuario(correo)
  await inyectarSesion(context, session, process.env.SUPABASE_URL!)
  const vehiculo = await sembrarVehiculo(admin, empresaId, prefijo)
  const proveedor = await sembrarProveedor(admin, empresaId, prefijo)
  const llanta = await sembrarProducto(admin, empresaId, prefijo, 'llanta')
  const servicio = await sembrarProducto(admin, empresaId, prefijo, 'servicio')
  const refaccion = await sembrarProducto(admin, empresaId, prefijo, 'refaccion')
  const consumible = await sembrarProducto(admin, empresaId, prefijo, 'consumible')
  const combustible = await sembrarProducto(admin, empresaId, prefijo, 'combustible')
  return { admin, empresaId, correoAdmin: correo, vehiculo, proveedor, llanta, servicio, refaccion, consumible, combustible }
}

async function idAdminDeEmpresa(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string) {
  const { data } = await admin.from('usuarios').select('id').eq('empresa_id', empresaId).eq('rol', 'admin').single()
  return data!.id as string
}

/** Selecciona una opción de un `v-autocomplete` por su label visible — mismo patrón ya usado en
 * Combustible. Match parcial: el ítem del selector de Vehículo muestra "marca modelo — placa"
 * completo. */
async function seleccionarAutocomplete(page: Page, label: string, filtro: string) {
  const combobox = page.getByRole('combobox', { name: label })
  await combobox.fill(filtro)
  await page.getByRole('option', { name: filtro }).first().click()
}

/** Navega al formulario de captura y espera a que las 3 llamadas `listar()` de
 * `FormularioOrden.vue` (vehículos/proveedores/productos) resuelvan antes de devolver el
 * control — mismo criterio que Combustible. */
async function irAFormularioOrden(page: Page) {
  const esperaVehiculos = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/vehiculos') && r.request().method() === 'GET'
  )
  const esperaProveedores = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/proveedores') && r.request().method() === 'GET'
  )
  const esperaProductos = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/productos') && r.request().method() === 'GET'
  )
  await page.goto('/admin/mantenimiento/nuevo')
  await esperarHidratacion(page)
  await Promise.all([esperaVehiculos, esperaProveedores, esperaProductos])
}

async function seleccionarTipoOrden(page: Page, texto: 'Correctivo' | 'Preventivo') {
  await page.getByTestId('tipo-select').click()
  await page.getByRole('option', { name: texto, exact: true }).click()
}

async function llenarDatosOrden(
  page: Page,
  datos: {
    tipo: 'Correctivo' | 'Preventivo'
    vehiculoPlaca: string
    proveedorNombre: string
    fecha: string
    costoTotal: number | string
  }
) {
  await seleccionarTipoOrden(page, datos.tipo)
  await seleccionarAutocomplete(page, 'Vehículo', datos.vehiculoPlaca)
  await seleccionarAutocomplete(page, 'Proveedor', datos.proveedorNombre)
  await page.getByLabel('Fecha', { exact: true }).fill(datos.fecha)
  await page.getByLabel('Costo total', { exact: true }).fill(String(datos.costoTotal))
}

async function agregarLineaProducto(page: Page, index: number, nombreProducto: string) {
  await page.getByTestId('agregar-linea-btn').click()
  await seleccionarAutocomplete(page, `Producto de la línea ${index + 1}`, nombreProducto)
}

test.describe('US1 — Administrador captura una orden de mantenimiento', () => {
  test('T007: captura con múltiples líneas de tipos distintos queda visible en su detalle con todos los datos correctos', async ({
    page,
    context
  }) => {
    const { vehiculo, proveedor, refaccion, servicio } = await prepararEmpresaMantenimiento(page, context, 'T007')

    await irAFormularioOrden(page)
    await llenarDatosOrden(page, {
      tipo: 'Correctivo',
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      fecha: '2026-08-01',
      costoTotal: 500
    })
    await agregarLineaProducto(page, 0, refaccion.nombre)
    await page.getByLabel('Cantidad de la línea 1', { exact: true }).fill('3')
    await agregarLineaProducto(page, 1, servicio.nombre)
    await page.getByLabel('Fecha de próximo servicio de la línea 2', { exact: true }).fill('2026-12-01')
    await page.getByLabel('Frecuencia (km) de la línea 2', { exact: true }).fill('5000')

    await page.getByTestId('submit-btn').click()
    await page.waitForURL((url) => /\/admin\/mantenimiento\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-datos')).toContainText('500')
    await expect(page.getByTestId('tarjeta-lineas')).toContainText('Líneas (2)')
    await expect(page.getByTestId('lineas-tabla')).toContainText(refaccion.nombre)
    await expect(page.getByTestId('lineas-tabla')).toContainText(servicio.nombre)
  })

  test('T008: una línea de tipo Llanta captura marca, medida, número de serie, condición y kilometraje', async ({
    page,
    context
  }) => {
    const { vehiculo, proveedor, llanta } = await prepararEmpresaMantenimiento(page, context, 'T008')

    await irAFormularioOrden(page)
    await llenarDatosOrden(page, {
      tipo: 'Preventivo',
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      fecha: '2026-08-01',
      costoTotal: 1200
    })
    await agregarLineaProducto(page, 0, llanta.nombre)
    await page.getByLabel('Marca de la línea 1', { exact: true }).fill('Michelin')
    await page.getByLabel('Medida de la línea 1', { exact: true }).fill('295/80R22.5')
    await page.getByLabel('Número de serie de la línea 1', { exact: true }).fill('SN-12345')
    await page.getByTestId('linea-0-condicion').click()
    await page.getByRole('option', { name: 'Nueva', exact: true }).click()
    await page.getByLabel('Kilometraje actual de la línea 1', { exact: true }).fill('45000')

    await page.getByTestId('submit-btn').click()
    await page.waitForURL((url) => /\/admin\/mantenimiento\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('lineas-tabla')).toContainText('Michelin')
    await expect(page.getByTestId('lineas-tabla')).toContainText('295/80R22.5')
    await expect(page.getByTestId('lineas-tabla')).toContainText('SN-12345')
    await expect(page.getByTestId('lineas-tabla')).toContainText('nueva')
  })

  test('T009: una línea de tipo Servicio captura fecha de próximo servicio y frecuencia', async ({
    page,
    context
  }) => {
    const { vehiculo, proveedor, servicio } = await prepararEmpresaMantenimiento(page, context, 'T009')

    await irAFormularioOrden(page)
    await llenarDatosOrden(page, {
      tipo: 'Preventivo',
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      fecha: '2026-08-01',
      costoTotal: 300
    })
    await agregarLineaProducto(page, 0, servicio.nombre)
    await page.getByLabel('Fecha de próximo servicio de la línea 1', { exact: true }).fill('2027-01-15')
    await page.getByLabel('Frecuencia (km) de la línea 1', { exact: true }).fill('10000')

    await page.getByTestId('submit-btn').click()
    await page.waitForURL((url) => /\/admin\/mantenimiento\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('lineas-tabla')).toContainText('2027-01-15')
    await expect(page.getByTestId('lineas-tabla')).toContainText('10000')
  })

  test('T010: una línea de tipo Producto o Refacción captura cantidad', async ({ page, context }) => {
    const { vehiculo, proveedor, consumible } = await prepararEmpresaMantenimiento(page, context, 'T010')

    await irAFormularioOrden(page)
    await llenarDatosOrden(page, {
      tipo: 'Correctivo',
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      fecha: '2026-08-01',
      costoTotal: 150
    })
    await agregarLineaProducto(page, 0, consumible.nombre)
    await page.getByLabel('Cantidad de la línea 1', { exact: true }).fill('7')

    await page.getByTestId('submit-btn').click()
    await page.waitForURL((url) => /\/admin\/mantenimiento\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('lineas-tabla')).toContainText('Cantidad: 7')
  })

  test('T011: capturar con una factura adjunta la deja asociada y visible en el detalle', async ({
    page,
    context
  }) => {
    const { vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(page, context, 'T011')

    await irAFormularioOrden(page)
    await llenarDatosOrden(page, {
      tipo: 'Correctivo',
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      fecha: '2026-08-01',
      costoTotal: 100
    })
    await agregarLineaProducto(page, 0, refaccion.nombre)
    await page.getByLabel('Cantidad de la línea 1', { exact: true }).fill('1')
    await page.getByTestId('factura-input').setInputFiles(pdfDePrueba())

    await page.getByTestId('submit-btn').click()
    await page.waitForURL((url) => /\/admin\/mantenimiento\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('historial-factura-tabla')).toBeVisible()
    const items = page.locator('[data-testid^="historial-factura-item-"]')
    await expect(items).toHaveCount(1, { timeout: 10_000 })
    await expect(items.first()).toContainText('Vigente')
  })

  test('T012: reemplazar la factura de una orden activa conserva la versión anterior en el historial', async ({
    page,
    context
  }) => {
    const { vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(page, context, 'T012')

    await irAFormularioOrden(page)
    await llenarDatosOrden(page, {
      tipo: 'Correctivo',
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      fecha: '2026-08-01',
      costoTotal: 100
    })
    await agregarLineaProducto(page, 0, refaccion.nombre)
    await page.getByLabel('Cantidad de la línea 1', { exact: true }).fill('1')
    await page.getByTestId('factura-input').setInputFiles(pdfDePrueba())
    await page.getByTestId('submit-btn').click()
    await page.waitForURL((url) => /\/admin\/mantenimiento\/[0-9a-f-]+$/.test(url.pathname), { timeout: 10_000 })
    await esperarHidratacion(page)

    await page.getByTestId('subir-factura-btn').click()
    await page.getByTestId('subir-factura-input').setInputFiles(pdfDePrueba('reemplazo.pdf'))
    await page.getByTestId('confirmar-subida-factura-btn').click()

    const items = page.locator('[data-testid^="historial-factura-item-"]')
    await expect(items).toHaveCount(2, { timeout: 10_000 })
    await expect(items.nth(0)).toContainText('Vigente')
    await expect(items.nth(1)).toContainText('Anterior')
  })

  test('T013: intentar guardar una orden sin ninguna línea se rechaza antes de guardar', async ({
    page,
    context
  }) => {
    const { vehiculo, proveedor } = await prepararEmpresaMantenimiento(page, context, 'T013')

    await irAFormularioOrden(page)
    await llenarDatosOrden(page, {
      tipo: 'Correctivo',
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      fecha: '2026-08-01',
      costoTotal: 100
    })
    await page.getByTestId('submit-btn').click()

    await expect(page.getByTestId('sin-lineas')).toBeVisible()
    expect(page.url()).toContain('/admin/mantenimiento/nuevo')
  })

  test('T014: el selector de vehículo excluye los dados de baja; el de proveedor excluye los inactivos', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaMantenimiento(page, context, 'T014')
    const vehiculoBaja = await sembrarVehiculo(admin, empresaId, 'T014Baja', { baja: true })
    const proveedorInactivo = await sembrarProveedor(admin, empresaId, 'T014Inactivo', { activo: false })

    await irAFormularioOrden(page)

    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculoBaja.placa)
    await expect(page.getByRole('option', { name: vehiculoBaja.placa, exact: true })).toHaveCount(0)

    await page.getByRole('combobox', { name: 'Proveedor' }).fill(proveedorInactivo.nombre)
    await expect(page.getByRole('option', { name: proveedorInactivo.nombre, exact: true })).toHaveCount(0)
  })

  test('T015: el selector de producto de una línea nunca ofrece productos de tipo combustible', async ({
    page,
    context
  }) => {
    const { combustible } = await prepararEmpresaMantenimiento(page, context, 'T015')

    await irAFormularioOrden(page)
    await page.getByTestId('agregar-linea-btn').click()
    await page.getByRole('combobox', { name: 'Producto de la línea 1' }).fill(combustible.nombre)
    await expect(page.getByRole('option', { name: combustible.nombre, exact: true })).toHaveCount(0)
  })

  test('T016: el campo fecha no admite una fecha posterior a hoy', async ({ page, context }) => {
    const { vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(page, context, 'T016')

    await irAFormularioOrden(page)
    await seleccionarTipoOrden(page, 'Correctivo')
    await seleccionarAutocomplete(page, 'Vehículo', vehiculo.placa)
    await seleccionarAutocomplete(page, 'Proveedor', proveedor.nombre)
    await page.getByLabel('Fecha', { exact: true }).fill(fechaEnDias(5))
    await page.getByLabel('Costo total', { exact: true }).fill('100')
    await agregarLineaProducto(page, 0, refaccion.nombre)
    await page.getByLabel('Cantidad de la línea 1', { exact: true }).fill('1')
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText(/la fecha no puede ser posterior a hoy/i)).toBeVisible()
    expect(page.url()).toContain('/admin/mantenimiento/nuevo')
  })

  test('T017: si la subida de la factura falla, la orden y sus líneas ya creadas se conservan sin factura', async ({
    page,
    context
  }) => {
    const { vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(page, context, 'T017')

    await page.route('**/storage/v1/object/documentos/**', (route) =>
      route.fulfill({ status: 500, body: 'Fallo simulado de subida (T017)' })
    )

    await irAFormularioOrden(page)
    await llenarDatosOrden(page, {
      tipo: 'Correctivo',
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      fecha: '2026-08-01',
      costoTotal: 100
    })
    await agregarLineaProducto(page, 0, refaccion.nombre)
    await page.getByLabel('Cantidad de la línea 1', { exact: true }).fill('1')
    await page.getByTestId('factura-input').setInputFiles(pdfDePrueba())
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/mantenimiento\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-lineas')).toContainText('Líneas (1)')
    await expect(page.getByTestId('historial-factura-tabla')).toContainText('Sin factura adjunta')
  })

  test('T018: si el insert de líneas falla tras crear la orden, el formulario ofrece reintentar contra la misma orden', async ({
    page,
    context
  }) => {
    const { admin, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(page, context, 'T018')

    await irAFormularioOrden(page)
    await llenarDatosOrden(page, {
      tipo: 'Correctivo',
      vehiculoPlaca: vehiculo.placa,
      proveedorNombre: proveedor.nombre,
      fecha: '2026-08-01',
      costoTotal: 100
    })
    await agregarLineaProducto(page, 0, refaccion.nombre)
    await page.getByLabel('Cantidad de la línea 1', { exact: true }).fill('1')

    await page.route('**/rest/v1/mantenimiento_detalles*', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 500, body: JSON.stringify({ message: 'Fallo simulado (T018)' }) })
      }
      return route.continue()
    })

    await page.getByTestId('submit-btn').click()
    await expect(page.getByTestId('reintentar-lineas-alert')).toBeVisible({ timeout: 10_000 })

    await page.unroute('**/rest/v1/mantenimiento_detalles*')
    await page.getByTestId('reintentar-lineas-btn').click()
    await page.waitForURL((url) => /\/admin\/mantenimiento\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-lineas')).toContainText('Líneas (1)')

    // Confirma que no se creó una orden duplicada.
    const { data: ordenes } = await admin
      .from('mantenimientos')
      .select('id')
      .eq('vehiculo_id', vehiculo.id)
    expect(ordenes).toHaveLength(1)
  })
})

async function sembrarOrden(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: {
    empresaId: string
    vehiculoId: string
    proveedorId: string
    adminId: string
    tipo: Database['public']['Enums']['tipo_mantenimiento']
    fecha: string
    costoTotal?: number
  }
) {
  const { data: orden } = await admin
    .from('mantenimientos')
    .insert({
      empresa_id: opciones.empresaId,
      vehiculo_id: opciones.vehiculoId,
      proveedor_id: opciones.proveedorId,
      tipo: opciones.tipo,
      fecha: opciones.fecha,
      costo_total: opciones.costoTotal ?? 500,
      creado_por: opciones.adminId
    })
    .select('id')
    .single()
  return orden!.id as string
}

async function sembrarLinea(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: { empresaId: string; mantenimientoId: string; productoId: string; cantidad?: number }
) {
  await admin.from('mantenimiento_detalles').insert({
    empresa_id: opciones.empresaId,
    mantenimiento_id: opciones.mantenimientoId,
    producto_id: opciones.productoId,
    cantidad: opciones.cantidad ?? 1
  })
}

test.describe('US2 — Administrador consulta el listado de órdenes de mantenimiento', () => {
  test('T023: filtrar por vehículo, tipo, rango de fechas, proveedor o estado muestra únicamente las órdenes que cumplen ese filtro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T023'
    )
    const vehiculo2 = await sembrarVehiculo(admin, empresaId, 'T023b')
    const proveedor2 = await sembrarProveedor(admin, empresaId, 'T023b')
    const adminId = await idAdminDeEmpresa(admin, empresaId)

    const ordenA = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenA, productoId: refaccion.id })
    const ordenB = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo2.id,
      proveedorId: proveedor2.id,
      adminId,
      tipo: 'preventivo',
      fecha: '2026-08-10'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenB, productoId: refaccion.id })

    await page.goto('/admin/mantenimiento')
    await esperarHidratacion(page)
    await expect(page.getByTestId('mantenimiento-tabla')).toContainText(vehiculo.placa)
    await expect(page.getByTestId('mantenimiento-tabla')).toContainText(vehiculo2.placa)

    // Filtro por vehículo. Cada filtro se prueba sobre una recarga limpia (page.goto) — un
    // v-select no se "destilda" reclicando la misma opción, así que recargar es más robusto que
    // depender del botón de limpiar de Vuetify para dejar cada paso independiente.
    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculo.placa)
    await page.getByRole('option', { name: vehiculo.placa }).first().click()
    await expect(page.locator('[data-testid="mantenimiento-tabla"] tbody tr')).toHaveCount(1, {
      timeout: 10_000
    })
    await expect(page.getByTestId('mantenimiento-tabla')).toContainText(vehiculo.placa)
    await expect(page.getByTestId('mantenimiento-tabla')).not.toContainText(vehiculo2.placa)

    // Filtro por tipo.
    await page.goto('/admin/mantenimiento')
    await esperarHidratacion(page)
    await page.getByTestId('filtro-tipo').click()
    await page.getByRole('option', { name: 'Preventivo', exact: true }).click()
    await expect(page.locator('[data-testid="mantenimiento-tabla"] tbody tr')).toHaveCount(1, {
      timeout: 10_000
    })
    await expect(page.getByTestId('mantenimiento-tabla')).toContainText(vehiculo2.placa)

    // Filtro por rango de fechas (solo ordenA, 2026-08-01).
    await page.goto('/admin/mantenimiento')
    await esperarHidratacion(page)
    await page.getByLabel('Desde', { exact: true }).fill('2026-08-01')
    await page.getByLabel('Hasta', { exact: true }).fill('2026-08-05')
    await expect(page.locator('[data-testid="mantenimiento-tabla"] tbody tr')).toHaveCount(1, {
      timeout: 10_000
    })
    await expect(page.getByTestId('mantenimiento-tabla')).toContainText(vehiculo.placa)

    // Filtro por proveedor.
    await page.goto('/admin/mantenimiento')
    await esperarHidratacion(page)
    await page.getByRole('combobox', { name: 'Proveedor' }).fill(proveedor2.nombre)
    await page.getByRole('option', { name: proveedor2.nombre }).first().click()
    await expect(page.locator('[data-testid="mantenimiento-tabla"] tbody tr')).toHaveCount(1, {
      timeout: 10_000
    })
    await expect(page.getByTestId('mantenimiento-tabla')).toContainText(vehiculo2.placa)

    // Filtro por estado: cancelar ordenB y filtrar por 'Activa'.
    await admin
      .from('mantenimientos')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Prueba T023' })
      .eq('id', ordenB)
    await page.goto('/admin/mantenimiento')
    await esperarHidratacion(page)
    await page.getByTestId('filtro-estado').click()
    await page.getByRole('option', { name: 'Activa' }).click()
    await expect(page.locator('[data-testid="mantenimiento-tabla"] tbody tr')).toHaveCount(1, {
      timeout: 10_000
    })
    await expect(page.getByTestId('mantenimiento-tabla')).toContainText(vehiculo.placa)
  })

  test('T024: cada fila del listado muestra vehículo, tipo, fecha, costo total, estado y número de líneas', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion, servicio } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T024'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'preventivo',
      fecha: '2026-08-01',
      costoTotal: 777
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: servicio.id })

    await page.goto('/admin/mantenimiento')
    await esperarHidratacion(page)
    const fila = page.locator('[data-testid="mantenimiento-tabla"] tbody tr').first()
    await expect(fila).toContainText(vehiculo.placa)
    await expect(fila).toContainText('Preventivo')
    await expect(fila).toContainText('777')
    await expect(fila).toContainText('Activa')
    await expect(page.getByTestId(`num-lineas-${ordenId}`)).toContainText('2')
  })

  test('T025: una orden cancelada se muestra junto con las activas, distinguida visualmente', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T025'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id })
    await admin
      .from('mantenimientos')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Prueba T025' })
      .eq('id', ordenId)

    await page.goto('/admin/mantenimiento')
    await esperarHidratacion(page)
    await expect(page.getByTestId(`estado-${ordenId}`)).toContainText('Cancelada')
  })

  test('T026: el detalle de una orden con varias líneas muestra todas, cada una con los campos específicos de su tipo', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion, llanta, servicio } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T026'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id, cantidad: 4 })
    await admin.from('mantenimiento_detalles').insert({
      empresa_id: empresaId,
      mantenimiento_id: ordenId,
      producto_id: llanta.id,
      llanta_marca: 'Bridgestone',
      llanta_medida: '11R22.5',
      llanta_numero_serie: 'SN-999',
      llanta_condicion: 'renovada',
      llanta_kilometraje: 20000
    })
    await admin.from('mantenimiento_detalles').insert({
      empresa_id: empresaId,
      mantenimiento_id: ordenId,
      producto_id: servicio.id,
      servicio_fecha_proximo: '2027-02-01',
      servicio_frecuencia_km: 15000
    })

    await page.goto(`/admin/mantenimiento/${ordenId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-lineas')).toContainText('Líneas (3)')
    await expect(page.getByTestId('lineas-tabla')).toContainText('Cantidad: 4')
    await expect(page.getByTestId('lineas-tabla')).toContainText('Bridgestone')
    await expect(page.getByTestId('lineas-tabla')).toContainText('renovada')
    await expect(page.getByTestId('lineas-tabla')).toContainText('2027-02-01')
    await expect(page.getByTestId('lineas-tabla')).toContainText('15000 km')
  })

  test('T027: un vehículo dado de baja con órdenes ya capturadas no aparece como opción del filtro, pero sus órdenes siguen visibles sin ese filtro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T027'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id })
    await admin.from('vehiculos').update({ baja: true }).eq('id', vehiculo.id)

    await page.goto('/admin/mantenimiento')
    await esperarHidratacion(page)
    await expect(page.getByTestId('mantenimiento-tabla')).toContainText(vehiculo.placa)

    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculo.placa)
    await expect(page.getByRole('option', { name: vehiculo.placa, exact: true })).toHaveCount(0)
  })
})

/** Crea un operario aislado (usuario propio, sin más permisos que los defaults del trigger
 * `otorgar_permisos_default_operario` — ver+crear en mantenimiento, sin cancelar) dentro de la
 * empresa dada. Mismo criterio que Combustible/rls.spec.ts. */
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

test.describe('US3 — Administrador cancela una orden de mantenimiento', () => {
  test('T030: cancelar una orden activa con un motivo válido la deja cancelado de forma permanente', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T030'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id })

    await page.goto(`/admin/mantenimiento/${ordenId}`)
    await esperarHidratacion(page)
    await page.getByTestId('cancelar-btn').click()
    await page.getByTestId('dialogo-cancelar-motivo').locator('textarea').fill('Captura duplicada')
    await page.getByTestId('dialogo-cancelar-confirmar').click()

    await expect(page.getByTestId('estado-chip')).toContainText('Cancelada', { timeout: 10_000 })
    const { data: ordenDb } = await admin.from('mantenimientos').select('estado').eq('id', ordenId).single()
    expect(ordenDb!.estado).toBe('cancelado')
  })

  test('T031: intentar confirmar la cancelación sin capturar un motivo la bloquea', async ({ page, context }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T031'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id })

    await page.goto(`/admin/mantenimiento/${ordenId}`)
    await esperarHidratacion(page)
    await page.getByTestId('cancelar-btn').click()

    await expect(page.getByTestId('dialogo-cancelar-confirmar')).toBeDisabled()
  })

  test('T032: una orden ya cancelada no ofrece reactivar, editar su motivo, reemplazar su factura, ni editar ninguna de sus líneas', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T032'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id })
    await admin
      .from('mantenimientos')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Prueba T032' })
      .eq('id', ordenId)

    await page.goto(`/admin/mantenimiento/${ordenId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('cancelar-btn')).toHaveCount(0)
    await expect(page.getByTestId('subir-factura-btn')).toHaveCount(0)
    await expect(page.getByTestId('motivo-cancelacion')).toContainText('Prueba T032')
    // Sin ninguna acción de edición sobre las líneas — la tabla es de solo lectura.
    await expect(page.getByTestId('lineas-tabla').getByRole('button')).toHaveCount(0)
  })

  test('T033: un usuario sin el permiso cancelar no ve disponible la acción de cancelar sobre una orden activa', async ({
    page,
    context
  }) => {
    // Mismo criterio que Combustible T031: el guard global de sección por rol redirige a
    // cualquier operario fuera de `/admin/**` — ningún módulo tiene rutas propias bajo
    // `/operario/**` todavía. La autorización real (RLS) vive en T038.
    const { admin, empresaId, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T033'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id })

    const { correo } = await crearOperarioAislado(admin, empresaId, 'T033')
    const sessionOperario = await crearSesionParaUsuario(correo)
    await inyectarSesion(context, sessionOperario, process.env.SUPABASE_URL!)

    await page.goto(`/admin/mantenimiento/${ordenId}`)
    await esperarHidratacion(page)
    await expect(page).toHaveURL(/\/operario/)
    await expect(page.getByTestId('cancelar-btn')).toHaveCount(0)
  })

  test('T034: cancelar una orden genera una fila en auditoría con accion cancelar, no editar a secas', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T034'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id })

    await page.goto(`/admin/mantenimiento/${ordenId}`)
    await esperarHidratacion(page)
    await page.getByTestId('cancelar-btn').click()
    await page.getByTestId('dialogo-cancelar-motivo').locator('textarea').fill('Prueba de auditoria T034')
    await page.getByTestId('dialogo-cancelar-confirmar').click()
    await expect(page.getByTestId('estado-chip')).toContainText('Cancelada', { timeout: 10_000 })

    const { data: auditoria } = await admin
      .from('auditoria')
      .select('accion')
      .eq('entidad', 'mantenimientos')
      .eq('entidad_id', ordenId)
      .order('created_at', { ascending: true })

    const acciones = auditoria!.map((fila) => fila.accion)
    expect(acciones).toContain('crear')
    expect(acciones).toContain('cancelar')
    expect(acciones).not.toContain('editar')
  })
})

test.describe('Polish — bypass de UI contra las validaciones de base de datos', () => {
  test('T039: un intento directo (sin pasar por la UI) de editar un campo operativo de una orden activa se rechaza', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T039'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01',
      costoTotal: 500
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id })

    const { error } = await admin.from('mantenimientos').update({ costo_total: 999 }).eq('id', ordenId)
    expect(error).not.toBeNull()
    expect(error!.message).toMatch(/inmutable/i)

    const { data: ordenDb } = await admin.from('mantenimientos').select('costo_total').eq('id', ordenId).single()
    expect(ordenDb!.costo_total).toBe(500)
  })

  test('T040: un intento directo (sin pasar por la UI) de editar o borrar una línea ya insertada se rechaza por RLS', async ({
    page,
    context
  }) => {
    const { admin, empresaId, correoAdmin, vehiculo, proveedor, refaccion } = await prepararEmpresaMantenimiento(
      page,
      context,
      'T040'
    )
    const adminId = await idAdminDeEmpresa(admin, empresaId)
    const ordenId = await sembrarOrden(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      proveedorId: proveedor.id,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-01'
    })
    await sembrarLinea(admin, { empresaId, mantenimientoId: ordenId, productoId: refaccion.id, cantidad: 5 })

    // Ataca con un cliente autenticado REAL como el admin de esta misma empresa (no
    // service_role, que bypassea RLS por completo y no demostraría nada) — `_no_update`/
    // `_no_delete` (using (false)) bloquean incluso a un admin con acceso completo por rol,
    // porque la política no distingue por rol/permiso, es incondicional.
    const client = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
    const { error: errLogin } = await client.auth.signInWithPassword({
      email: correoAdmin,
      password: PASSWORD_PRUEBAS
    })
    if (errLogin) throw errLogin

    const { data: intentoUpdate } = await client
      .from('mantenimiento_detalles')
      .update({ cantidad: 999 })
      .eq('mantenimiento_id', ordenId)
      .select()
    expect(intentoUpdate ?? []).toEqual([])

    const { data: intentoDelete } = await client
      .from('mantenimiento_detalles')
      .delete()
      .eq('mantenimiento_id', ordenId)
      .select()
    expect(intentoDelete ?? []).toEqual([])

    const { data: lineaDb } = await admin
      .from('mantenimiento_detalles')
      .select('cantidad')
      .eq('mantenimiento_id', ordenId)
      .single()
    expect(lineaDb!.cantidad).toBe(5)
  })
})
