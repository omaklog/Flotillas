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

async function buscarFila(page: Page, texto: string): Promise<Locator> {
  await page.getByLabel('Buscar por nombre', { exact: true }).fill(texto)
  const fila = page.locator('[data-testid="productos-tabla"] tbody tr', { hasText: texto })
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

async function sembrarProducto(
  prefijo: string,
  tipo: Database['public']['Enums']['tipo_producto'] = 'refaccion'
) {
  const { admin, empresaId, adminId } = await empresaAdmin()
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const nombre = `Producto ${prefijo} ${sufijo}`
  const { data: producto } = await admin
    .from('productos')
    .insert({ empresa_id: empresaId, nombre, tipo })
    .select('id')
    .single()
  return { admin, empresaId, adminId, productoId: producto!.id as string, nombre }
}

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

async function sembrarProveedor(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string, prefijo: string) {
  const { data: proveedor } = await admin
    .from('proveedores')
    .insert({ empresa_id: empresaId, nombre: `Proveedor ${prefijo} ${Date.now()}` })
    .select('id')
    .single()
  return proveedor!.id as string
}

test.describe('US2 — Administrador gestiona productos', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T021: alta de producto con nombre y tipo obligatorios lo deja visible en el listado', async ({ page }) => {
    const nombre = `Producto T021 ${Date.now()}`

    await page.goto('/admin/productos')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByTestId('tipo-select').click()
    await page.getByRole('option', { name: 'Combustible', exact: true }).click()
    await page.getByTestId('submit-btn').click()

    const fila = await buscarFila(page, nombre)
    await expect(fila).toContainText('Combustible')
  })

  test('T022: buscar por nombre y filtrar por tipo muestran únicamente los productos que coinciden', async ({
    page
  }) => {
    const prefijoComun = `ProductoT022comun${Date.now()}`
    const { admin, empresaId } = await empresaAdmin()
    await admin
      .from('productos')
      .insert({ empresa_id: empresaId, nombre: `${prefijoComun} Combustible`, tipo: 'combustible' })
    await admin
      .from('productos')
      .insert({ empresa_id: empresaId, nombre: `${prefijoComun} Refaccion`, tipo: 'refaccion' })

    await page.goto('/admin/productos')
    await esperarHidratacion(page)

    // Buscador por nombre: acota a los 2 productos sembrados (evita la paginación de
    // `TablaCatalogo.vue`, 10 por página por defecto, del catálogo compartido de "Empresa E2E",
    // que ya tiene decenas de productos de otras corridas — mismo criterio ya documentado en
    // `buscarFila` de otros specs de este proyecto).
    await page.getByLabel('Buscar por nombre', { exact: true }).fill(prefijoComun)
    await expect(page.locator('[data-testid="productos-tabla"] tbody tr', { hasText: prefijoComun })).toHaveCount(2, {
      timeout: 10_000
    })

    // Filtro por tipo, combinado con el buscador ya activo: acota a solo el de tipo combustible.
    await page.getByTestId('filtro-tipo').click()
    await page.getByRole('option', { name: 'Combustible', exact: true }).click()

    await expect(
      page.locator('[data-testid="productos-tabla"] tbody tr', { hasText: `${prefijoComun} Combustible` })
    ).toBeVisible({ timeout: 10_000 })
    await expect(
      page.locator('[data-testid="productos-tabla"] tbody tr', { hasText: `${prefijoComun} Refaccion` })
    ).toHaveCount(0)
  })

  test('T023: un producto sin registros asociados permite editar todos los campos, incluido el tipo', async ({
    page
  }) => {
    const { nombre } = await sembrarProducto('T023', 'refaccion')

    await page.goto('/admin/productos')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('editar-btn').click()

    await expect(page.getByTestId('tipo-select').locator('input')).toBeEnabled()
    await expect(page.getByTestId('tipo-bloqueado-info')).toHaveCount(0)
    await page.getByTestId('tipo-select').click()
    await page.getByRole('option', { name: 'Consumible', exact: true }).click()
    await page.getByTestId('submit-btn').click()

    const filaEditada = await buscarFila(page, nombre)
    await expect(filaEditada).toContainText('Consumible')
  })

  test('T024: un producto con un registro asociado sembrado muestra el campo tipo deshabilitado con una explicación al editar', async ({
    page
  }) => {
    const { admin, empresaId, adminId, productoId, nombre } = await sembrarProducto('T024', 'combustible')
    const vehiculoId = await sembrarVehiculo(admin, empresaId, 'T024')
    const proveedorId = await sembrarProveedor(admin, empresaId, 'T024')
    await admin.from('cargas_combustible').insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      proveedor_id: proveedorId,
      producto_id: productoId,
      fecha: new Date().toISOString().slice(0, 10),
      odometro: 500,
      cantidad: 20,
      costo_unitario: 25,
      costo_total: 500,
      creado_por: adminId
    })

    await page.goto('/admin/productos')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('editar-btn').click()

    await expect(page.getByTestId('tipo-select').locator('input')).toBeDisabled()
    await expect(page.getByTestId('tipo-bloqueado-info')).toBeVisible()
  })

  test('T025: eliminar un producto con una carga de combustible sembrada directo vía service_role se rechaza y no borra nada', async ({
    page
  }) => {
    const { admin, empresaId, adminId, productoId, nombre } = await sembrarProducto('T025', 'combustible')
    const vehiculoId = await sembrarVehiculo(admin, empresaId, 'T025')
    const proveedorId = await sembrarProveedor(admin, empresaId, 'T025')
    await admin.from('cargas_combustible').insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      proveedor_id: proveedorId,
      producto_id: productoId,
      fecha: new Date().toISOString().slice(0, 10),
      odometro: 500,
      cantidad: 20,
      costo_unitario: 25,
      costo_total: 500,
      creado_por: adminId
    })

    await page.goto('/admin/productos')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('listado-error')).toContainText(/cargas de combustible/i)
    const { data: sigueExistiendo } = await admin.from('productos').select('id').eq('id', productoId).maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })

  test('T026: eliminar un producto con un detalle de mantenimiento sembrado directo vía service_role se rechaza y no borra nada', async ({
    page
  }) => {
    const { admin, empresaId, adminId, productoId, nombre } = await sembrarProducto('T026', 'refaccion')
    const vehiculoId = await sembrarVehiculo(admin, empresaId, 'T026')
    const proveedorId = await sembrarProveedor(admin, empresaId, 'T026')
    const { data: mantenimiento } = await admin
      .from('mantenimientos')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculoId,
        proveedor_id: proveedorId,
        tipo: 'correctivo',
        fecha: new Date().toISOString().slice(0, 10),
        costo_total: 200,
        creado_por: adminId
      })
      .select('id')
      .single()
    await admin.from('mantenimiento_detalles').insert({
      empresa_id: empresaId,
      mantenimiento_id: mantenimiento!.id,
      producto_id: productoId
    })

    await page.goto('/admin/productos')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('listado-error')).toContainText(/detalles de mantenimiento/i)
    const { data: sigueExistiendo } = await admin.from('productos').select('id').eq('id', productoId).maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })
})
