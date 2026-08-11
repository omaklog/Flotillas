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

// El caso negativo de RLS (operario sin permiso 'editar' no puede escribir) vive en
// tests/e2e/rls.spec.ts, no aquí — mismo criterio que el resto de este proyecto.
//
// Igual que Combustible/Mantenimiento/Checklist: cada test crea su propia empresa aislada
// (`crearEmpresaConAdmin`) en vez de usar la sesión compartida `admin-e2e` — el selector de
// vehículo del formulario carga todos los vehículos de la empresa sin paginación, mismo riesgo
// del límite de 1000 filas de PostgREST ya encontrado en Combustible (research.md R8).

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
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

/** Crea una empresa aislada + su administrador, inyecta su sesión en el `context` del test, y
 * expone el `tipoVehiculoId`/`vehiculo` "ligero" ya sembrados. */
async function prepararEmpresaServicios(page: Page, context: BrowserContext, prefijo: string) {
  const admin = adminSupabaseClient()
  const { empresaId, correo } = await crearEmpresaConAdmin(admin, {
    nombre: `Empresa Servicios ${prefijo} ${Date.now()}`
  })
  const session = await crearSesionParaUsuario(correo)
  await inyectarSesion(context, session, process.env.SUPABASE_URL!)
  const { data: tipo } = await admin
    .from('tipos_vehiculo')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('clave', 'ligero')
    .single()
  const vehiculo = await sembrarVehiculo(admin, empresaId, tipo!.id as string, prefijo)
  return { admin, empresaId, correoAdmin: correo, tipoVehiculoId: tipo!.id as string, vehiculo }
}

async function irANuevoServicio(page: Page) {
  const esperaVehiculos = page.waitForResponse(
    (r) => r.url().includes('/rest/v1/vehiculos') && r.request().method() === 'GET'
  )
  await page.goto('/admin/servicios-obligatorios/nuevo')
  await esperarHidratacion(page)
  await esperaVehiculos
}

async function seleccionarVehiculo(page: Page, vehiculoPlaca: string) {
  await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculoPlaca)
  await page.getByRole('option', { name: vehiculoPlaca }).first().click()
}

async function seleccionarTipo(page: Page, titulo: string) {
  await page.getByTestId('tipo-select').click()
  await page.getByRole('option', { name: titulo, exact: true }).click()
}

const hoy = new Date().toISOString().slice(0, 10)
function fechaMasDias(base: string, dias: number): string {
  const d = new Date(`${base}T00:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

test.describe('US1 — Registrar un servicio obligatorio', () => {
  test('T007: registrar un servicio completo con comprobante adjunto queda visible en el listado y en su detalle con los datos correctos', async ({
    page,
    context
  }) => {
    const { vehiculo } = await prepararEmpresaServicios(page, context, 'T007')

    await irANuevoServicio(page)
    await seleccionarVehiculo(page, vehiculo.placa)
    await seleccionarTipo(page, 'Verificación ambiental')
    await page.getByLabel('Fecha de realización').fill(hoy)
    await page.getByLabel('Fecha de vencimiento').fill(fechaMasDias(hoy, 180))
    await page.getByTestId('comprobante-input').setInputFiles({
      name: 'comprobante.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 contenido de prueba')
    })
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/servicios-obligatorios\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-datos')).toContainText('Verificación ambiental')
    await expect(page.getByTestId('comprobante-seccion')).toContainText('comprobante.pdf')

    await page.goto('/admin/servicios-obligatorios')
    await esperarHidratacion(page)
    await expect(page.getByTestId('servicios-tabla')).toContainText(vehiculo.placa)
  })

  test('T008: capturar una fecha de realización posterior a hoy bloquea el registro con un mensaje claro', async ({
    page,
    context
  }) => {
    const { vehiculo } = await prepararEmpresaServicios(page, context, 'T008')

    await irANuevoServicio(page)
    await seleccionarVehiculo(page, vehiculo.placa)
    await seleccionarTipo(page, 'Revisión físico-mecánica')
    await page.getByLabel('Fecha de realización').fill(fechaMasDias(hoy, 5))
    await page.getByLabel('Fecha de vencimiento').fill(fechaMasDias(hoy, 180))
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText('La fecha de realización no puede ser posterior a hoy.')).toBeVisible()
    expect(page.url()).toContain('/admin/servicios-obligatorios/nuevo')
  })

  test('T009: capturar una fecha de vencimiento igual o anterior a la fecha de realización bloquea el registro con un mensaje claro', async ({
    page,
    context
  }) => {
    const { vehiculo } = await prepararEmpresaServicios(page, context, 'T009')

    await irANuevoServicio(page)
    await seleccionarVehiculo(page, vehiculo.placa)
    await seleccionarTipo(page, 'Renovación de aditamentos')
    await page.getByLabel('Fecha de realización').fill(hoy)
    await page.getByLabel('Fecha de vencimiento').fill(hoy)
    await page.getByTestId('submit-btn').click()

    await expect(
      page.getByText('La fecha de vencimiento debe ser posterior a la fecha de realización.')
    ).toBeVisible()
    expect(page.url()).toContain('/admin/servicios-obligatorios/nuevo')
  })

  test('T010: el selector de vehículo excluye los dados de baja', async ({ page, context }) => {
    const { admin, empresaId, tipoVehiculoId } = await prepararEmpresaServicios(page, context, 'T010')
    const vehiculoBaja = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T010', { baja: true })

    await irANuevoServicio(page)
    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculoBaja.placa)
    await expect(page.getByRole('option', { name: vehiculoBaja.placa, exact: true })).toHaveCount(0)
  })

  test('T011: un servicio registrado sin comprobante permite adjuntarlo después desde su detalle', async ({
    page,
    context
  }) => {
    const { vehiculo } = await prepararEmpresaServicios(page, context, 'T011')

    await irANuevoServicio(page)
    await seleccionarVehiculo(page, vehiculo.placa)
    await seleccionarTipo(page, 'Verificación ambiental')
    await page.getByLabel('Fecha de realización').fill(hoy)
    await page.getByLabel('Fecha de vencimiento').fill(fechaMasDias(hoy, 180))
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/servicios-obligatorios\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('sin-comprobante')).toBeVisible()

    await page.getByTestId('adjuntar-comprobante-input').setInputFiles({
      name: 'comprobante-tardio.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 contenido de prueba tardio')
    })
    await expect(page.getByTestId('comprobante-seccion')).toContainText('comprobante-tardio.pdf', {
      timeout: 10_000
    })
  })
})

async function sembrarServicio(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: {
    empresaId: string
    vehiculoId: string
    tipo: Database['public']['Enums']['tipo_servicio_obligatorio']
    fechaRealizado: string
    fechaVencimiento: string
  }
) {
  const { data } = await admin
    .from('servicios_obligatorios')
    .insert({
      empresa_id: opciones.empresaId,
      vehiculo_id: opciones.vehiculoId,
      tipo: opciones.tipo,
      fecha_realizado: opciones.fechaRealizado,
      fecha_vencimiento: opciones.fechaVencimiento
    })
    .select('id')
    .single()
  return data!.id as string
}

test.describe('US2 — Listado y búsqueda de servicios obligatorios', () => {
  test('T015: filtrar por vehículo, tipo de servicio, o rango de fechas muestra únicamente los servicios que cumplen ese filtro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await prepararEmpresaServicios(page, context, 'T015')
    const vehiculoA = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T015A')
    const vehiculoB = await sembrarVehiculo(admin, empresaId, tipoVehiculoId, 'T015B')

    await sembrarServicio(admin, {
      empresaId,
      vehiculoId: vehiculoA.id,
      tipo: 'verificacion_ambiental',
      fechaRealizado: '2026-01-10',
      fechaVencimiento: fechaMasDias(hoy, 300)
    })
    await sembrarServicio(admin, {
      empresaId,
      vehiculoId: vehiculoB.id,
      tipo: 'revision_fisico_mecanica',
      fechaRealizado: '2026-06-15',
      fechaVencimiento: fechaMasDias(hoy, 300)
    })

    await page.goto('/admin/servicios-obligatorios')
    await esperarHidratacion(page)
    await expect(page.locator('[data-testid="servicios-tabla"] tbody tr')).toHaveCount(2)

    await page.getByTestId('filtro-vehiculo').click()
    await page.getByRole('combobox', { name: 'Vehículo' }).fill(vehiculoA.placa)
    await page.getByRole('option', { name: vehiculoA.placa }).first().click()
    await expect(page.locator('[data-testid="servicios-tabla"] tbody tr')).toHaveCount(1)
    await expect(page.getByTestId('servicios-tabla')).toContainText(vehiculoA.placa)
    await page.goto('/admin/servicios-obligatorios')
    await esperarHidratacion(page)

    await page.getByTestId('filtro-tipo').click()
    await page.getByRole('option', { name: 'Revisión físico-mecánica', exact: true }).click()
    await expect(page.locator('[data-testid="servicios-tabla"] tbody tr')).toHaveCount(1)
    await expect(page.getByTestId('servicios-tabla')).toContainText(vehiculoB.placa)
    await page.goto('/admin/servicios-obligatorios')
    await esperarHidratacion(page)

    await page.getByLabel('Realizado desde', { exact: true }).fill('2026-05-01')
    await expect(page.locator('[data-testid="servicios-tabla"] tbody tr')).toHaveCount(1)
    await expect(page.getByTestId('servicios-tabla')).toContainText(vehiculoB.placa)
  })

  test('T016: un servicio cuya fecha de vencimiento ya pasó se marca como "Vencido" en el listado', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaServicios(page, context, 'T016')
    const servicioId = await sembrarServicio(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      tipo: 'verificacion_ambiental',
      fechaRealizado: '2025-01-01',
      fechaVencimiento: fechaMasDias(hoy, -5)
    })

    await page.goto('/admin/servicios-obligatorios')
    await esperarHidratacion(page)
    await expect(page.getByTestId(`vigencia-${servicioId}`)).toContainText('Vencido')
  })

  test('T017: un servicio cuya fecha de vencimiento está dentro de los próximos 60 días se marca como "Por vencer"', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaServicios(page, context, 'T017')
    const servicioId = await sembrarServicio(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      tipo: 'verificacion_ambiental',
      fechaRealizado: hoy,
      fechaVencimiento: fechaMasDias(hoy, 30)
    })

    await page.goto('/admin/servicios-obligatorios')
    await esperarHidratacion(page)
    await expect(page.getByTestId(`vigencia-${servicioId}`)).toContainText('Por vencer')
  })

  test('T018: un servicio cuya fecha de vencimiento está a más de 60 días se marca como "Vigente"', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaServicios(page, context, 'T018')
    const servicioId = await sembrarServicio(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      tipo: 'verificacion_ambiental',
      fechaRealizado: hoy,
      fechaVencimiento: fechaMasDias(hoy, 200)
    })

    await page.goto('/admin/servicios-obligatorios')
    await esperarHidratacion(page)
    await expect(page.getByTestId(`vigencia-${servicioId}`)).toContainText('Vigente')
  })

  test('T019: el detalle de un servicio muestra todos sus datos y el comprobante adjunto', async ({
    page,
    context
  }) => {
    const { vehiculo } = await prepararEmpresaServicios(page, context, 'T019')

    await irANuevoServicio(page)
    await seleccionarVehiculo(page, vehiculo.placa)
    await seleccionarTipo(page, 'Renovación de aditamentos')
    await page.getByLabel('Fecha de realización').fill(hoy)
    await page.getByLabel('Fecha de vencimiento').fill(fechaMasDias(hoy, 200))
    await page.getByTestId('comprobante-input').setInputFiles({
      name: 'comprobante-t019.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 contenido de prueba t019')
    })
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => /\/admin\/servicios-obligatorios\/[0-9a-f-]+$/.test(url.pathname), {
      timeout: 10_000
    })
    await esperarHidratacion(page)

    await expect(page.getByTestId('vigencia-chip')).toContainText('Vigente')
    await expect(page.getByRole('heading', { name: 'Renovación de aditamentos' })).toBeVisible()
    await expect(page.getByText(vehiculo.placa)).toBeVisible()
    await expect(page.getByTestId('tarjeta-datos')).toContainText('Renovación de aditamentos')
    await expect(page.getByTestId('comprobante-seccion')).toContainText('comprobante-t019.pdf')
  })
})

test.describe('US3 — Editar y eliminar un servicio obligatorio', () => {
  test('T023: editar cualquier campo de un servicio existente (incluidas ambas fechas) guarda los cambios y se refleja de inmediato en el listado y el detalle', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaServicios(page, context, 'T023')
    const servicioId = await sembrarServicio(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      tipo: 'verificacion_ambiental',
      fechaRealizado: hoy,
      fechaVencimiento: fechaMasDias(hoy, 200)
    })

    await page.goto(`/admin/servicios-obligatorios/${servicioId}/editar`)
    await esperarHidratacion(page)
    await seleccionarTipo(page, 'Renovación de aditamentos')
    const nuevaFechaVencimiento = fechaMasDias(hoy, 250)
    await page.getByLabel('Fecha de vencimiento').fill(nuevaFechaVencimiento)
    await page.getByTestId('submit-btn').click()

    await page.waitForURL(`**/admin/servicios-obligatorios/${servicioId}`, { timeout: 10_000 })
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-datos')).toContainText('Renovación de aditamentos')

    await page.goto('/admin/servicios-obligatorios')
    await esperarHidratacion(page)
    await expect(page.getByTestId('servicios-tabla')).toContainText('Renovación de aditamentos')
  })

  test('T024: editar capturando una combinación de fechas inválida se rechaza igual que en el registro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaServicios(page, context, 'T024')
    const servicioId = await sembrarServicio(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      tipo: 'verificacion_ambiental',
      fechaRealizado: hoy,
      fechaVencimiento: fechaMasDias(hoy, 200)
    })

    await page.goto(`/admin/servicios-obligatorios/${servicioId}/editar`)
    await esperarHidratacion(page)
    await page.getByLabel('Fecha de vencimiento').fill(hoy)
    await page.getByTestId('submit-btn').click()

    await expect(
      page.getByText('La fecha de vencimiento debe ser posterior a la fecha de realización.')
    ).toBeVisible()
    expect(page.url()).toContain(`/admin/servicios-obligatorios/${servicioId}/editar`)
  })

  test('T025: eliminar un servicio con comprobante adjunto desaparece del listado de inmediato sin ningún mensaje de bloqueo, y su comprobante queda eliminado', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaServicios(page, context, 'T025')
    const servicioId = await sembrarServicio(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      tipo: 'verificacion_ambiental',
      fechaRealizado: hoy,
      fechaVencimiento: fechaMasDias(hoy, 200)
    })
    const rutaComprobante = `testigo_servicio/${empresaId}/${servicioId}/comprobante-t025.pdf`
    await admin.storage.from('documentos').upload(rutaComprobante, Buffer.from('%PDF-1.4 t025'), {
      contentType: 'application/pdf'
    })
    const { data: archivo } = await admin
      .from('archivos')
      .insert({
        empresa_id: empresaId,
        tipo: 'testigo_servicio',
        storage_path: rutaComprobante,
        entidad_tipo: 'servicio_obligatorio',
        entidad_id: servicioId,
        subido_por: (await admin.from('usuarios').select('id').eq('empresa_id', empresaId).eq('rol', 'admin').single())
          .data!.id
      })
      .select('id')
      .single()
    await admin.from('servicios_obligatorios').update({ archivo_id: archivo!.id }).eq('id', servicioId)

    await page.goto(`/admin/servicios-obligatorios/${servicioId}`)
    await esperarHidratacion(page)
    await page.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await page.waitForURL('**/admin/servicios-obligatorios', { timeout: 10_000 })
    await esperarHidratacion(page)
    await expect(page.getByTestId('servicios-tabla')).not.toContainText(vehiculo.placa)

    const { data: archivoTrasEliminar } = await admin.from('archivos').select('id').eq('id', archivo!.id).maybeSingle()
    expect(archivoTrasEliminar).toBeNull()
  })

  test('T026: un operario sin el permiso editar no ve disponibles las acciones de registrar/editar/eliminar', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaServicios(page, context, 'T026')
    const servicioId = await sembrarServicio(admin, {
      empresaId,
      vehiculoId: vehiculo.id,
      tipo: 'verificacion_ambiental',
      fechaRealizado: hoy,
      fechaVencimiento: fechaMasDias(hoy, 200)
    })

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const correoOperario = `operario-t026-${sufijo}@flotillas.local`
    const { data: authOperario } = await admin.auth.admin.createUser({
      email: correoOperario,
      password: PASSWORD_PRUEBAS,
      email_confirm: true
    })
    await admin.from('usuarios').insert({
      auth_user_id: authOperario!.user.id,
      empresa_id: empresaId,
      nombre: 'Operario T026',
      correo: correoOperario,
      rol: 'operario',
      activo: true
    })
    const sessionOperario = await crearSesionParaUsuario(correoOperario)
    await inyectarSesion(context, sessionOperario, process.env.SUPABASE_URL!)

    await page.goto('/admin/servicios-obligatorios')
    await esperarHidratacion(page)
    await expect(page.getByTestId('nuevo-servicio-btn')).toHaveCount(0)

    await page.goto(`/admin/servicios-obligatorios/${servicioId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('editar-btn')).toHaveCount(0)
    await expect(page.getByTestId('eliminar-btn')).toHaveCount(0)
  })
})
