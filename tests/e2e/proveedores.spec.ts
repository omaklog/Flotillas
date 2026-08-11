import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { esperarHidratacion } from './helpers'

// El caso negativo de RLS (operario con solo 'ver' no puede escribir) vive en
// tests/e2e/rls.spec.ts, no aquí — mismo criterio que el resto de este proyecto.

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

/**
 * Localiza una fila filtrando primero por el buscador (deja el filtro activo) — mismo criterio
 * que el resto del proyecto: el catálogo de `Empresa E2E` es compartido entre corridas y
 * `TablaCatalogo.vue` pagina (10 por página por defecto, seleccionable 5/10/20).
 */
async function buscarFila(page: Page, texto: string): Promise<Locator> {
  await page.getByLabel('Buscar por nombre o RFC', { exact: true }).fill(texto)
  const fila = page.locator('[data-testid="proveedores-tabla"] tbody tr', { hasText: texto })
  await expect(fila).toBeVisible({ timeout: 10_000 })
  return fila
}

async function empresaAdmin() {
  const admin = adminSupabaseClient()
  const { data: perfilAdmin } = await admin
    .from('usuarios')
    .select('id, empresa_id')
    .eq('correo', 'admin-e2e@flotillas.local')
    .single()
  return { admin, empresaId: perfilAdmin!.empresa_id!, adminId: perfilAdmin!.id }
}

async function sembrarProveedor(prefijo: string) {
  const { admin, empresaId, adminId } = await empresaAdmin()
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const nombre = `Proveedor ${prefijo} ${sufijo}`
  const { data: proveedor } = await admin
    .from('proveedores')
    .insert({ empresa_id: empresaId, nombre, rfc: `RFC${sufijo}` })
    .select('id')
    .single()
  return { admin, empresaId, adminId, proveedorId: proveedor!.id as string, nombre }
}

/** Vehículo de prueba (necesario para sembrar `mantenimientos`/`cargas_combustible`) — mismo
 * patrón "sembrar solo lo necesario" ya usado en tests de features anteriores. */
async function sembrarVehiculo(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string, prefijo: string) {
  const { data: tipo } = await admin
    .from('tipos_vehiculo')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('clave', 'ligero')
    .single()
  const sufijo = Date.now()
  const { data: vehiculo } = await admin
    .from('vehiculos')
    .insert({
      empresa_id: empresaId,
      marca: `Vehiculo ${prefijo} ${sufijo}`,
      modelo: 'X',
      placa: `${prefijo}-${sufijo}`,
      tipo_vehiculo_id: tipo!.id
    })
    .select('id')
    .single()
  return vehiculo!.id as string
}

async function sembrarProducto(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  prefijo: string,
  tipo: Database['public']['Enums']['tipo_producto'] = 'combustible'
) {
  const { data: producto } = await admin
    .from('productos')
    .insert({ empresa_id: empresaId, nombre: `Producto ${prefijo} ${Date.now()}`, tipo })
    .select('id')
    .single()
  return producto!.id as string
}

test.describe('US1 — Administrador gestiona proveedores', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T007: alta de proveedor con solo el nombre lo deja visible en el listado', async ({ page }) => {
    const nombre = `Proveedor T007 ${Date.now()}`

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByTestId('submit-btn').click()

    const fila = await buscarFila(page, nombre)
    await expect(fila).toBeVisible()
  })

  test('T008: buscar por nombre y por RFC encuentra el proveedor', async ({ page }) => {
    const { nombre } = await sembrarProveedor('T008')

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    const filaPorNombre = await buscarFila(page, nombre)
    await expect(filaPorNombre).toBeVisible()

    const rfc = `RFCT008${Date.now()}${Math.random().toString(36).slice(2, 6)}`
    const { admin, empresaId } = await empresaAdmin()
    await admin.from('proveedores').insert({ empresa_id: empresaId, nombre: `Otro T008 ${Date.now()}`, rfc })
    await page.getByLabel('Buscar por nombre o RFC', { exact: true }).fill(rfc)
    const filaPorRfc = page.locator('[data-testid="proveedores-tabla"] tbody tr', { hasText: rfc })
    await expect(filaPorRfc).toBeVisible({ timeout: 10_000 })
  })

  test('T009: editar un proveedor existente guarda los cambios', async ({ page }) => {
    const { nombre } = await sembrarProveedor('T009')
    const nuevoNombre = `${nombre} Editado`

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('editar-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill(nuevoNombre)
    await page.getByTestId('submit-btn').click()

    const filaEditada = await buscarFila(page, nuevoNombre)
    await expect(filaEditada).toBeVisible()
  })

  test('T010: el listado oculta proveedores inactivos por defecto; el control "Mostrar inactivos" los incluye', async ({
    page
  }) => {
    const { admin, proveedorId, nombre } = await sembrarProveedor('T010')
    await admin.from('proveedores').update({ activo: false, motivo_baja: 'sembrado inactivo' }).eq('id', proveedorId)

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    await page.getByLabel('Buscar por nombre o RFC', { exact: true }).fill(nombre)
    await expect(page.locator('[data-testid="proveedores-tabla"] tbody tr', { hasText: nombre })).toHaveCount(0)

    await page.getByLabel('Mostrar inactivos', { exact: true }).check()
    await expect(page.locator('[data-testid="proveedores-tabla"] tbody tr', { hasText: nombre })).toBeVisible({
      timeout: 10_000
    })
  })

  test('T011: intentar confirmar "Desactivar" sin capturar un motivo lo bloquea', async ({ page }) => {
    const { nombre } = await sembrarProveedor('T011')

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('desactivar-btn').click()

    // El botón de confirmar queda deshabilitado sin motivo — el bloqueo mismo es que nunca se
    // habilita para hacer clic, no un mensaje de error tras intentarlo.
    await expect(page.getByTestId('dialogo-desactivar-confirmar')).toBeDisabled()
    await expect(page.getByTestId('dialogo-desactivar-motivo')).toBeVisible()
  })

  test('T012: desactivar con un motivo válido oculta el proveedor del listado por defecto', async ({ page }) => {
    const { nombre } = await sembrarProveedor('T012')

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('desactivar-btn').click()
    await page.getByTestId('dialogo-desactivar-motivo').locator('textarea').fill('Ya no opera')
    await page.getByTestId('dialogo-desactivar-confirmar').click()

    await expect(page.getByTestId('dialogo-desactivar-confirmar')).toHaveCount(0)
    await page.getByLabel('Buscar por nombre o RFC', { exact: true }).fill(nombre)
    await expect(page.locator('[data-testid="proveedores-tabla"] tbody tr', { hasText: nombre })).toHaveCount(0)
  })

  test('T013: reactivar un proveedor inactivo lo regresa al listado por defecto', async ({ page }) => {
    const { admin, proveedorId, nombre } = await sembrarProveedor('T013')
    await admin.from('proveedores').update({ activo: false, motivo_baja: 'sembrado inactivo' }).eq('id', proveedorId)

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    await page.getByLabel('Mostrar inactivos', { exact: true }).check()
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('reactivar-btn').click()

    await expect(fila.getByTestId('reactivar-btn')).toHaveCount(0, { timeout: 10_000 })
    await page.getByLabel('Mostrar inactivos', { exact: true }).uncheck()
    await expect(page.locator('[data-testid="proveedores-tabla"] tbody tr', { hasText: nombre })).toBeVisible()
  })

  test('T014: desactivar y reactivar un proveedor generan filas en auditoría con accion desactivar/reactivar, no editar', async ({
    page
  }) => {
    const { admin, proveedorId, nombre } = await sembrarProveedor('T014')

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('desactivar-btn').click()
    await page.getByTestId('dialogo-desactivar-motivo').locator('textarea').fill('Prueba de auditoria')
    await page.getByTestId('dialogo-desactivar-confirmar').click()
    await expect(page.getByTestId('dialogo-desactivar-confirmar')).toHaveCount(0)

    await page.getByLabel('Mostrar inactivos', { exact: true }).check()
    const filaInactiva = await buscarFila(page, nombre)
    await filaInactiva.getByTestId('reactivar-btn').click()
    await expect(filaInactiva.getByTestId('reactivar-btn')).toHaveCount(0, { timeout: 10_000 })

    const { data: auditoria } = await admin
      .from('auditoria')
      .select('accion')
      .eq('entidad', 'proveedores')
      .eq('entidad_id', proveedorId)
      .order('created_at', { ascending: true })

    const acciones = auditoria!.map((fila) => fila.accion)
    expect(acciones).toContain('desactivar')
    expect(acciones).toContain('reactivar')
    expect(acciones).not.toContain('editar')
  })

  test('T015: eliminar un proveedor con un mantenimiento sembrado directo vía service_role se rechaza y no borra nada', async ({
    page
  }) => {
    const { admin, empresaId, adminId, proveedorId, nombre } = await sembrarProveedor('T015')
    const vehiculoId = await sembrarVehiculo(admin, empresaId, 'T015')
    await admin.from('mantenimientos').insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      proveedor_id: proveedorId,
      tipo: 'preventivo',
      fecha: new Date().toISOString().slice(0, 10),
      costo_total: 100,
      creado_por: adminId
    })

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('listado-error')).toContainText(/mantenimientos/i)
    const { data: sigueExistiendo } = await admin.from('proveedores').select('id').eq('id', proveedorId).maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })

  test('T016: eliminar un proveedor con una carga de combustible sembrada directo vía service_role se rechaza y no borra nada', async ({
    page
  }) => {
    const { admin, empresaId, adminId, proveedorId, nombre } = await sembrarProveedor('T016')
    const vehiculoId = await sembrarVehiculo(admin, empresaId, 'T016')
    const productoId = await sembrarProducto(admin, empresaId, 'T016')
    await admin.from('cargas_combustible').insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      proveedor_id: proveedorId,
      producto_id: productoId,
      fecha: new Date().toISOString().slice(0, 10),
      odometro: 1000,
      cantidad: 40,
      costo_unitario: 25,
      costo_total: 1000,
      creado_por: adminId
    })

    await page.goto('/admin/proveedores')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('listado-error')).toContainText(/cargas de combustible/i)
    const { data: sigueExistiendo } = await admin.from('proveedores').select('id').eq('id', proveedorId).maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })
})
