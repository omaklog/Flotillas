import { test, expect, type BrowserContext, type Page, type Download } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import type { Database } from '../../app/types/database.types'
import {
  esperarHidratacion,
  crearEmpresaConAdmin,
  crearSesionParaUsuario,
  inyectarSesion,
  PASSWORD_PRUEBAS
} from './helpers'

// US-13.1 (costos de mantenimiento) y US-13.2 (combustible). Los casos negativos de RLS/permiso
// de módulo de origen y el aislamiento multi-tenant viven en tests/e2e/rls.spec.ts (T043/T045 de
// tasks.md), no aquí — mismo criterio que el resto del proyecto.

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function sembrarVehiculo(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  prefijo: string,
  opciones?: {
    baja?: boolean
    numeroPoliza?: string
    fechaVencimientoPoliza?: string
    tipoVehiculoId?: string
  }
) {
  let tipoVehiculoId = opciones?.tipoVehiculoId
  if (!tipoVehiculoId) {
    const { data: tipo } = await admin
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('clave', 'ligero')
      .single()
    tipoVehiculoId = tipo!.id
  }
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
      baja: opciones?.baja ?? false,
      numero_poliza: opciones?.numeroPoliza,
      fecha_vencimiento_poliza: opciones?.fechaVencimientoPoliza
    })
    .select('id')
    .single()
  return { id: vehiculo!.id as string, marca, modelo, placa, label: `${marca} ${modelo} — ${placa}` }
}

async function sembrarConductor(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  prefijo: string,
  fechaVencimientoLicencia: string,
  opciones?: { activo?: boolean }
) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const nombre = `Conductor ${prefijo}`
  const apellidos = `Apellido ${sufijo}`
  const numeroLicencia = `LIC-${prefijo}-${sufijo}`
  const { data: conductor } = await admin
    .from('conductores')
    .insert({
      empresa_id: empresaId,
      nombre,
      apellidos,
      numero_licencia: numeroLicencia,
      tipo_licencia: 'federal',
      fecha_vencimiento_licencia: fechaVencimientoLicencia,
      activo: opciones?.activo ?? true
    })
    .select('id')
    .single()
  return { id: conductor!.id as string, nombre, apellidos, numeroLicencia }
}

async function sembrarPermisoCatalogo(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string, prefijo: string) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const nombre = `Permiso ${prefijo} ${sufijo}`
  // `clave` exige CHECK (clave ~ '^[a-z0-9_]+$') — sin guiones (research.md de Catálogos Base).
  const clave = `permiso_${prefijo.toLowerCase()}_${sufijo.replace(/-/g, '_')}`.slice(0, 50)
  const { data: permiso, error } = await admin
    .from('permisos')
    .insert({ empresa_id: empresaId, nombre, clave, tipo: 'federal' })
    .select('id')
    .single()
  if (error) throw error
  return { id: permiso!.id as string, nombre }
}

async function sembrarVehiculoPermiso(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  vehiculoId: string,
  permisoId: string,
  fechaVencimiento: string
) {
  await admin.from('vehiculo_permisos').insert({
    empresa_id: empresaId,
    vehiculo_id: vehiculoId,
    permiso_id: permisoId,
    fecha_vencimiento: fechaVencimiento
  })
}

/** `ligero`/`pesado`/`mat_peligrosos` se siembran automáticamente para cada empresa nueva
 * (trigger `trg_empresas_sembrar_tipos_vehiculo`). */
async function obtenerTipoVehiculo(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  clave: 'ligero' | 'pesado' | 'mat_peligrosos'
) {
  const { data } = await admin
    .from('tipos_vehiculo')
    .select('id, nombre')
    .eq('empresa_id', empresaId)
    .eq('clave', clave)
    .single()
  return { id: data!.id as string, nombre: data!.nombre as string }
}

async function sembrarChecklist(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: {
    empresaId: string
    vehiculoId: string
    tipoVehiculoId: string
    responsableId: string
    fecha: string
    resultado: Database['public']['Enums']['resultado_checklist']
  }
) {
  await admin.from('checklists').insert({
    empresa_id: opciones.empresaId,
    vehiculo_id: opciones.vehiculoId,
    tipo_vehiculo_id: opciones.tipoVehiculoId,
    responsable_id: opciones.responsableId,
    fecha: opciones.fecha,
    resultado: opciones.resultado
  })
}

async function sembrarServicioObligatorio(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: {
    empresaId: string
    vehiculoId: string
    fechaRealizado: string
    fechaVencimiento: string
    tipo?: Database['public']['Enums']['tipo_servicio_obligatorio']
  }
) {
  await admin.from('servicios_obligatorios').insert({
    empresa_id: opciones.empresaId,
    vehiculo_id: opciones.vehiculoId,
    fecha_realizado: opciones.fechaRealizado,
    fecha_vencimiento: opciones.fechaVencimiento,
    tipo: opciones.tipo ?? 'revision_fisico_mecanica'
  })
}

async function sembrarProveedor(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string, prefijo: string) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data: proveedor } = await admin
    .from('proveedores')
    .insert({ empresa_id: empresaId, nombre: `Proveedor ${prefijo} ${sufijo}`, activo: true })
    .select('id')
    .single()
  return proveedor!.id as string
}

async function idAdminDeEmpresa(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string) {
  const { data } = await admin.from('usuarios').select('id').eq('empresa_id', empresaId).eq('rol', 'admin').single()
  return data!.id as string
}

async function sembrarProductoCombustible(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string, prefijo: string) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data: producto } = await admin
    .from('productos')
    .insert({ empresa_id: empresaId, nombre: `Diésel ${prefijo} ${sufijo}`, tipo: 'combustible' })
    .select('id')
    .single()
  return producto!.id as string
}

async function sembrarCarga(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: {
    empresaId: string
    vehiculoId: string
    proveedorId: string
    productoId: string
    adminId: string
    fecha: string
    odometro: number
    cantidad: number
    costoTotal: number
    estado?: Database['public']['Enums']['estado_registro']
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
      odometro: opciones.odometro,
      cantidad: opciones.cantidad,
      costo_total: opciones.costoTotal,
      costo_unitario: opciones.costoTotal / opciones.cantidad,
      creado_por: opciones.adminId
    })
    .select('id')
    .single()
  if (opciones.estado === 'cancelado') {
    await admin
      .from('cargas_combustible')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Prueba reportes' })
      .eq('id', carga!.id)
  }
  return carga!.id as string
}

async function sembrarOrden(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: {
    empresaId: string
    vehiculoId: string
    proveedorId: string
    adminId: string
    tipo: Database['public']['Enums']['tipo_mantenimiento']
    fecha: string
    costoTotal: number
    estado?: Database['public']['Enums']['estado_registro']
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
      costo_total: opciones.costoTotal,
      creado_por: opciones.adminId
    })
    .select('id')
    .single()
  if (opciones.estado === 'cancelado') {
    await admin
      .from('mantenimientos')
      .update({ estado: 'cancelado', motivo_cancelacion: 'Prueba reportes' })
      .eq('id', orden!.id)
  }
  return orden!.id as string
}

/** Empresa aislada + admin, sesión inyectada — mismo criterio que mantenimiento.spec.ts. */
async function prepararEmpresaReportes(page: Page, context: BrowserContext, prefijo: string) {
  const admin = adminSupabaseClient()
  const { empresaId, correo } = await crearEmpresaConAdmin(admin, {
    nombre: `Empresa Reportes ${prefijo} ${Date.now()}`
  })
  const session = await crearSesionParaUsuario(correo)
  await inyectarSesion(context, session, process.env.SUPABASE_URL!)
  const proveedor = await sembrarProveedor(admin, empresaId, prefijo)
  const productoCombustible = await sembrarProductoCombustible(admin, empresaId, prefijo)
  const adminId = await idAdminDeEmpresa(admin, empresaId)
  return { admin, empresaId, correoAdmin: correo, proveedor, productoCombustible, adminId }
}

async function crearOperarioAislado(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  prefijo: string,
  permisos: { moduloClave: string; accion: string }[] = []
) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const correo = `operario-${prefijo}-${sufijo}@flotillas.local`
  const { data: authOperario, error: errAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: PASSWORD_PRUEBAS,
    email_confirm: true
  })
  if (errAuth) throw errAuth
  const { data: usuario } = await admin
    .from('usuarios')
    .insert({
      auth_user_id: authOperario!.user.id,
      empresa_id: empresaId,
      nombre: `Operario ${prefijo}`,
      correo,
      rol: 'operario',
      activo: true
    })
    .select('id')
    .single()
  for (const permiso of permisos) {
    await admin.from('usuario_permisos').insert({
      empresa_id: empresaId,
      usuario_id: usuario!.id,
      modulo_clave: permiso.moduloClave,
      accion: permiso.accion,
      otorgado_por: usuario!.id
    })
  }
  return { correo, usuarioId: usuario!.id as string }
}

/** Revoca un permiso que el trigger `otorgar_permisos_default_operario` ya otorgó por defecto
 * (ej. `combustible.ver`) — simula un administrador quitándoselo explícitamente. */
async function revocarPermiso(
  admin: ReturnType<typeof adminSupabaseClient>,
  usuarioId: string,
  moduloClave: string,
  accion: string
) {
  await admin
    .from('usuario_permisos')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('modulo_clave', moduloClave)
    .eq('accion', accion)
}

async function otorgarPermiso(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  usuarioId: string,
  moduloClave: string,
  accion: string
) {
  await admin.from('usuario_permisos').insert({
    empresa_id: empresaId,
    usuario_id: usuarioId,
    modulo_clave: moduloClave,
    accion,
    otorgado_por: usuarioId
  })
}

async function irAReportes(page: Page) {
  await page.goto('/admin/reportes')
  await esperarHidratacion(page)
}

async function irACombustible(page: Page) {
  await page.goto('/admin/reportes')
  await esperarHidratacion(page)
  await page.getByTestId('reportes-tab-combustible').click()
}

async function irAVencimientos(page: Page) {
  await page.goto('/admin/reportes')
  await esperarHidratacion(page)
  await page.getByTestId('reportes-tab-vencimientos').click()
}

async function irACumplimiento(page: Page) {
  await page.goto('/admin/reportes')
  await esperarHidratacion(page)
  await page.getByTestId('reportes-tab-cumplimiento').click()
}

function fechaEnDias(dias: number): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** `data-testid` en un `v-text-field` cae en el wrapper, no en el `<input>` real — mismo
 * criterio que el resto del proyecto (que por eso usa `getByLabel` para fechas), pero aquí se
 * necesita `data-testid` para evitar ambigüedad entre secciones de reportes que comparten
 * las mismas etiquetas "Desde"/"Hasta". */
async function llenarRangoFechas(page: Page, prefijo: string, desde: string, hasta: string) {
  await page.getByTestId(`${prefijo}-filtro-desde`).locator('input').fill(desde)
  await page.getByTestId(`${prefijo}-filtro-hasta`).locator('input').fill(hasta)
}

async function esperarDescarga(page: Page, accion: () => Promise<void>): Promise<Download> {
  const [download] = await Promise.all([page.waitForEvent('download'), accion()])
  return download
}

test.describe('US1 — Reporte de costos de mantenimiento', () => {
  test('T011: total general, por tipo y por vehículo con su propio subtotal, sin filtrar por vehículo', async ({
    page,
    context
  }) => {
    const { admin, empresaId, proveedor, adminId } = await prepararEmpresaReportes(page, context, 'T011')
    const v1 = await sembrarVehiculo(admin, empresaId, 'T011a')
    const v2 = await sembrarVehiculo(admin, empresaId, 'T011b')
    await sembrarOrden(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-05',
      costoTotal: 500
    })
    await sembrarOrden(admin, {
      empresaId,
      vehiculoId: v2.id,
      proveedorId: proveedor,
      adminId,
      tipo: 'preventivo',
      fecha: '2026-08-10',
      costoTotal: 300
    })

    await irAReportes(page)
    await llenarRangoFechas(page, 'mant', '2026-08-01', '2026-08-31')

    await expect(page.getByTestId('mant-total-general')).toContainText('800', { timeout: 10_000 })
    await expect(page.getByTestId('mant-total-correctivo')).toContainText('500')
    await expect(page.getByTestId('mant-total-preventivo')).toContainText('300')
    await expect(page.getByTestId('mant-tabla')).toContainText(v1.placa)
    await expect(page.getByTestId('mant-tabla')).toContainText(v2.placa)
  })

  test('T012: filtrar por un vehículo específico muestra únicamente sus totales', async ({ page, context }) => {
    const { admin, empresaId, proveedor, adminId } = await prepararEmpresaReportes(page, context, 'T012')
    const v1 = await sembrarVehiculo(admin, empresaId, 'T012a')
    const v2 = await sembrarVehiculo(admin, empresaId, 'T012b')
    await sembrarOrden(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-05',
      costoTotal: 500
    })
    await sembrarOrden(admin, {
      empresaId,
      vehiculoId: v2.id,
      proveedorId: proveedor,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-06',
      costoTotal: 700
    })

    await irAReportes(page)
    await llenarRangoFechas(page, 'mant', '2026-08-01', '2026-08-31')
    await expect(page.getByTestId('mant-total-general')).toContainText('1,200', { timeout: 10_000 })

    await page.getByTestId('mant-filtro-vehiculo').locator('input').fill(v1.placa)
    await page.getByRole('option', { name: v1.placa }).first().click()

    await expect(page.getByTestId('mant-total-general')).toContainText('500', { timeout: 10_000 })
    await expect(page.getByTestId('mant-tabla')).toContainText(v1.placa)
    await expect(page.getByTestId('mant-tabla')).not.toContainText(v2.placa)
  })

  test('T013: una orden cancelada no se incluye en ningún total', async ({ page, context }) => {
    const { admin, empresaId, proveedor, adminId } = await prepararEmpresaReportes(page, context, 'T013')
    const v1 = await sembrarVehiculo(admin, empresaId, 'T013')
    await sembrarOrden(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-05',
      costoTotal: 500
    })
    await sembrarOrden(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-06',
      costoTotal: 900,
      estado: 'cancelado'
    })

    await irAReportes(page)
    await llenarRangoFechas(page, 'mant', '2026-08-01', '2026-08-31')

    await expect(page.getByTestId('mant-total-general')).toContainText('500', { timeout: 10_000 })
    await expect(page.getByTestId('mant-total-general')).not.toContainText('1,400')
  })

  test('T014: un vehículo sin movimientos en el rango no aparece en el desglose', async ({ page, context }) => {
    const { admin, empresaId, proveedor, adminId } = await prepararEmpresaReportes(page, context, 'T014')
    const v1 = await sembrarVehiculo(admin, empresaId, 'T014a')
    const v2 = await sembrarVehiculo(admin, empresaId, 'T014b')
    await sembrarOrden(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-05',
      costoTotal: 500
    })
    // v2 nunca tiene una orden — no debe aparecer en el desglose.

    await irAReportes(page)
    await llenarRangoFechas(page, 'mant', '2026-08-01', '2026-08-31')

    await expect(page.getByTestId('mant-tabla')).toContainText(v1.placa, { timeout: 10_000 })
    await expect(page.getByTestId('mant-tabla')).not.toContainText(v2.placa)
  })

  test('T015: exportar a Excel y a PDF descarga el archivo con los datos mostrados y audita la exportación', async ({
    page,
    context
  }) => {
    const { admin, empresaId, proveedor, adminId } = await prepararEmpresaReportes(page, context, 'T015')
    const v1 = await sembrarVehiculo(admin, empresaId, 'T015')
    await sembrarOrden(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      adminId,
      tipo: 'correctivo',
      fecha: '2026-08-05',
      costoTotal: 640
    })

    await irAReportes(page)
    await llenarRangoFechas(page, 'mant', '2026-08-01', '2026-08-31')
    await expect(page.getByTestId('mant-total-general')).toContainText('640', { timeout: 10_000 })

    const respuestaAuditoriaExcel = page.waitForResponse((r) =>
      r.url().includes('/api/reportes/auditar-exportacion')
    )
    const descargaExcel = await esperarDescarga(page, async () => {
      await page.getByTestId('mant-exportar-excel').click()
    })
    await respuestaAuditoriaExcel
    expect(descargaExcel.suggestedFilename()).toBe('reporte-costos-mantenimiento.xlsx')

    const rutaExcel = await descargaExcel.path()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(rutaExcel!)
    const hoja = workbook.worksheets[0]
    const encabezados = hoja.getRow(1).values as unknown[]
    expect(encabezados).toContain('Vehículo')
    const filaDatos = hoja.getRow(2).values as unknown[]
    expect(filaDatos).toContain(v1.label)
    expect(filaDatos).toContain(640)

    const respuestaAuditoriaPdf = page.waitForResponse((r) => r.url().includes('/api/reportes/auditar-exportacion'))
    const descargaPdf = await esperarDescarga(page, async () => {
      await page.getByTestId('mant-exportar-pdf').click()
    })
    await respuestaAuditoriaPdf
    expect(descargaPdf.suggestedFilename()).toBe('reporte-costos-mantenimiento.pdf')

    const { data: auditoria } = await admin
      .from('auditoria')
      .select('accion, entidad, valores_despues')
      .eq('empresa_id', empresaId)
      .eq('accion', 'exportar')
      .order('created_at', { ascending: true })
    expect(auditoria).toHaveLength(2)
    expect(auditoria![0].entidad).toBe('reporte_mantenimiento')
    const filtrosAuditados = auditoria![0].valores_despues as { formato: string; filtros: Record<string, unknown> }
    expect(filtrosAuditados.formato).toBe('excel')
    expect(filtrosAuditados.filtros.desde).toBe('2026-08-01')
    expect(auditoria![1].valores_despues).toMatchObject({ formato: 'pdf' })
  })

  test('T016: un operario sin el permiso exportar no ve disponibles los botones de exportación', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T016')
    const { correo } = await crearOperarioAislado(admin, empresaId, 'T016')
    const sessionOperario = await crearSesionParaUsuario(correo)
    await inyectarSesion(context, sessionOperario, process.env.SUPABASE_URL!)

    await page.goto('/operario/reportes')
    await esperarHidratacion(page)

    await expect(page.getByTestId('mant-tabla')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('mant-exportar-excel')).toHaveCount(0)
    await expect(page.getByTestId('mant-exportar-pdf')).toHaveCount(0)
  })
})

test.describe('US2 — Reporte de consumo y rendimiento de combustible', () => {
  test('T020: el rendimiento entre cargas activas consecutivas excluye la cancelada del cálculo', async ({
    page,
    context
  }) => {
    const { admin, empresaId, proveedor, productoCombustible, adminId } = await prepararEmpresaReportes(
      page,
      context,
      'T020'
    )
    const v1 = await sembrarVehiculo(admin, empresaId, 'T020')
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      productoId: productoCombustible,
      adminId,
      fecha: '2026-08-01',
      odometro: 1000,
      cantidad: 40,
      costoTotal: 800
    })
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      productoId: productoCombustible,
      adminId,
      fecha: '2026-08-05',
      odometro: 1200,
      cantidad: 50,
      costoTotal: 1000,
      estado: 'cancelado'
    })
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      productoId: productoCombustible,
      adminId,
      fecha: '2026-08-10',
      odometro: 1300,
      cantidad: 45,
      costoTotal: 900
    })

    await irACombustible(page)
    await llenarRangoFechas(page, 'comb', '2026-08-01', '2026-08-31')

    // (1300 - 1000) / 45 = 6.666... — la cancelada (odómetro 1200) nunca participa.
    await expect(page.getByTestId('comb-rendimiento-2026-08-10-1300')).toContainText('6.67', {
      timeout: 10_000
    })
    await expect(page.getByTestId('comb-rendimiento-2026-08-01-1000')).toContainText('N/D')
  })

  test('T021: la primera carga de toda la historia de un vehículo muestra "N/D" y no distorsiona el promedio', async ({
    page,
    context
  }) => {
    const { admin, empresaId, proveedor, productoCombustible, adminId } = await prepararEmpresaReportes(
      page,
      context,
      'T021'
    )
    const v1 = await sembrarVehiculo(admin, empresaId, 'T021')
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      productoId: productoCombustible,
      adminId,
      fecha: '2026-08-01',
      odometro: 1000,
      cantidad: 40,
      costoTotal: 800
    })

    await irACombustible(page)
    await llenarRangoFechas(page, 'comb', '2026-08-01', '2026-08-31')

    await expect(page.getByTestId('comb-rendimiento-2026-08-01-1000')).toContainText('N/D', {
      timeout: 10_000
    })
    // Promedio: sin ninguna carga con rendimiento no nulo → N/D, no "0" ni "NaN".
    await expect(page.getByTestId('comb-tabla-vehiculos')).toContainText('N/D')
    await expect(page.getByTestId('comb-tabla-vehiculos')).not.toContainText('NaN')
  })

  test('T022: una carga real anterior fuera del rango filtrado SÍ se usa como referencia (Clarifications Q1)', async ({
    page,
    context
  }) => {
    const { admin, empresaId, proveedor, productoCombustible, adminId } = await prepararEmpresaReportes(
      page,
      context,
      'T022'
    )
    const v1 = await sembrarVehiculo(admin, empresaId, 'T022')
    // Fuera del rango que se va a filtrar (antes de "desde").
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      productoId: productoCombustible,
      adminId,
      fecha: '2026-07-01',
      odometro: 1000,
      cantidad: 40,
      costoTotal: 800
    })
    // Dentro del rango — primera fila VISIBLE, pero no la primera de toda la historia.
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      productoId: productoCombustible,
      adminId,
      fecha: '2026-08-05',
      odometro: 1200,
      cantidad: 50,
      costoTotal: 1000
    })

    await irACombustible(page)
    await llenarRangoFechas(page, 'comb', '2026-08-01', '2026-08-31')

    // (1200 - 1000) / 50 = 4 — NO "N/D", aunque sea la primera fila visible del rango.
    await expect(page.getByTestId('comb-rendimiento-2026-08-05-1200')).toContainText('4', {
      timeout: 10_000
    })
    await expect(page.getByTestId('comb-rendimiento-2026-08-05-1200')).not.toContainText('N/D')
    // La carga de julio no aparece (fuera del rango filtrado), aunque sí participó del cálculo.
    await expect(page.getByTestId('comb-tabla-cargas')).not.toContainText('2026-07-01')
  })

  test('T023: total general y por vehículo incluyen solo vehículos con movimientos en el rango', async ({
    page,
    context
  }) => {
    const { admin, empresaId, proveedor, productoCombustible, adminId } = await prepararEmpresaReportes(
      page,
      context,
      'T023'
    )
    const v1 = await sembrarVehiculo(admin, empresaId, 'T023a')
    const v2 = await sembrarVehiculo(admin, empresaId, 'T023b')
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      productoId: productoCombustible,
      adminId,
      fecha: '2026-08-01',
      odometro: 1000,
      cantidad: 40,
      costoTotal: 800
    })
    // v2 nunca tiene una carga — no debe aparecer.

    await irACombustible(page)
    await llenarRangoFechas(page, 'comb', '2026-08-01', '2026-08-31')

    await expect(page.getByTestId('comb-total-cantidad')).toContainText('40', { timeout: 10_000 })
    await expect(page.getByTestId('comb-total-costo')).toContainText('800')
    await expect(page.getByTestId('comb-tabla-vehiculos')).toContainText(v1.placa)
    await expect(page.getByTestId('comb-tabla-vehiculos')).not.toContainText(v2.placa)
  })

  test('T024: exportar a Excel/PDF incluye las filas "N/D" y audita la exportación', async ({ page, context }) => {
    const { admin, empresaId, proveedor, productoCombustible, adminId } = await prepararEmpresaReportes(
      page,
      context,
      'T024'
    )
    const v1 = await sembrarVehiculo(admin, empresaId, 'T024')
    await sembrarCarga(admin, {
      empresaId,
      vehiculoId: v1.id,
      proveedorId: proveedor,
      productoId: productoCombustible,
      adminId,
      fecha: '2026-08-01',
      odometro: 1000,
      cantidad: 40,
      costoTotal: 800
    })

    await irACombustible(page)
    await llenarRangoFechas(page, 'comb', '2026-08-01', '2026-08-31')
    await expect(page.getByTestId('comb-total-cantidad')).toContainText('40', { timeout: 10_000 })

    const respuestaAuditoria = page.waitForResponse((r) => r.url().includes('/api/reportes/auditar-exportacion'))
    const descarga = await esperarDescarga(page, async () => {
      await page.getByTestId('comb-exportar-excel').click()
    })
    await respuestaAuditoria
    expect(descarga.suggestedFilename()).toBe('reporte-combustible.xlsx')

    const rutaExcel = await descarga.path()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(rutaExcel!)
    const hojaCargas = workbook.getWorksheet('Cargas')!
    const filaDatos = hojaCargas.getRow(2).values as unknown[]
    expect(filaDatos).toContain('N/D')

    const { data: auditoria } = await admin
      .from('auditoria')
      .select('entidad, accion')
      .eq('empresa_id', empresaId)
      .eq('accion', 'exportar')
      .eq('entidad', 'reporte_combustible')
    expect(auditoria).toHaveLength(1)
  })
})

test.describe('US3 — Reporte de vencimientos', () => {
  test('T028: "desde" vacío y "hasta"=hoy lista todo lo ya vencido sin importar la antigüedad', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T028')
    const vencidoAntiguo = await sembrarConductor(admin, empresaId, 'T028Viejo', fechaEnDias(-1000))
    const futuro = await sembrarConductor(admin, empresaId, 'T028Futuro', fechaEnDias(500))

    await irAVencimientos(page)
    await page.getByTestId('venc-filtro-hasta').locator('input').fill(fechaEnDias(0))

    await expect(page.getByTestId('venc-tabla')).toContainText(vencidoAntiguo.numeroLicencia, {
      timeout: 10_000
    })
    await expect(page.getByTestId('venc-tabla')).not.toContainText(futuro.numeroLicencia)
  })

  test('T029: "hasta" vacío y "desde"=hoy lista todo lo que vence desde hoy en adelante sin límite', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T029')
    const v1 = await sembrarVehiculo(admin, empresaId, 'T029Lejos', {
      numeroPoliza: 'POL-T029-LEJOS',
      fechaVencimientoPoliza: fechaEnDias(500)
    })
    const v2 = await sembrarVehiculo(admin, empresaId, 'T029Pasado', {
      numeroPoliza: 'POL-T029-PASADO',
      fechaVencimientoPoliza: fechaEnDias(-10)
    })

    await irAVencimientos(page)
    await page.getByTestId('venc-filtro-desde').locator('input').fill(fechaEnDias(0))

    await expect(page.getByTestId('venc-tabla')).toContainText(v1.placa, { timeout: 10_000 })
    await expect(page.getByTestId('venc-tabla')).not.toContainText(v2.placa)
  })

  test('T030: un rango específico lista solo lo que cae dentro de él, con el estado correcto (umbral de 60 días)', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T030')
    const vencido = await sembrarConductor(admin, empresaId, 'T030Vencido', fechaEnDias(-10))
    const porVencer = await sembrarConductor(admin, empresaId, 'T030PorVencer', fechaEnDias(30))
    const vigente = await sembrarConductor(admin, empresaId, 'T030Vigente', fechaEnDias(500))
    const fueraDeRango = await sembrarConductor(admin, empresaId, 'T030Fuera', fechaEnDias(-1000))

    await irAVencimientos(page)
    await page.getByTestId('venc-filtro-desde').locator('input').fill(fechaEnDias(-30))
    await page.getByTestId('venc-filtro-hasta').locator('input').fill(fechaEnDias(600))

    const tabla = page.getByTestId('venc-tabla')
    await expect(tabla).toContainText(vencido.numeroLicencia, { timeout: 10_000 })
    await expect(tabla).toContainText(porVencer.numeroLicencia)
    await expect(tabla).toContainText(vigente.numeroLicencia)
    await expect(tabla).not.toContainText(fueraDeRango.numeroLicencia)

    const filaVencido = page.locator('tr', { hasText: vencido.numeroLicencia })
    await expect(filaVencido).toContainText('Vencido')
    const filaPorVencer = page.locator('tr', { hasText: porVencer.numeroLicencia })
    await expect(filaPorVencer).toContainText('Por vencer')
    const filaVigente = page.locator('tr', { hasText: vigente.numeroLicencia })
    await expect(filaVigente).toContainText('Vigente')
  })

  test('T031: un vehículo o conductor dado de baja sigue apareciendo si su vencimiento cae en el rango', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T031')
    const conductorBaja = await sembrarConductor(admin, empresaId, 'T031Cond', fechaEnDias(10), {
      activo: false
    })
    const vehiculoBaja = await sembrarVehiculo(admin, empresaId, 'T031Veh', {
      baja: true,
      numeroPoliza: 'POL-T031',
      fechaVencimientoPoliza: fechaEnDias(15)
    })

    await irAVencimientos(page)
    await page.getByTestId('venc-filtro-desde').locator('input').fill(fechaEnDias(-5))
    await page.getByTestId('venc-filtro-hasta').locator('input').fill(fechaEnDias(30))

    await expect(page.getByTestId('venc-tabla')).toContainText(conductorBaja.numeroLicencia, {
      timeout: 10_000
    })
    await expect(page.getByTestId('venc-tabla')).toContainText(vehiculoBaja.placa)
  })

  test('T032: exportar a Excel/PDF incluye las 3 categorías y audita la exportación', async ({ page, context }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T032')
    const conductor = await sembrarConductor(admin, empresaId, 'T032', fechaEnDias(10))
    const vehiculo = await sembrarVehiculo(admin, empresaId, 'T032', {
      numeroPoliza: 'POL-T032',
      fechaVencimientoPoliza: fechaEnDias(15)
    })
    const permiso = await sembrarPermisoCatalogo(admin, empresaId, 'T032')
    await sembrarVehiculoPermiso(admin, empresaId, vehiculo.id, permiso.id, fechaEnDias(20))

    await irAVencimientos(page)
    await page.getByTestId('venc-filtro-desde').locator('input').fill(fechaEnDias(-5))
    await page.getByTestId('venc-filtro-hasta').locator('input').fill(fechaEnDias(30))
    await expect(page.getByTestId('venc-tabla')).toContainText(conductor.numeroLicencia, { timeout: 10_000 })

    const respuestaAuditoria = page.waitForResponse((r) => r.url().includes('/api/reportes/auditar-exportacion'))
    const descarga = await esperarDescarga(page, async () => {
      await page.getByTestId('venc-exportar-excel').click()
    })
    await respuestaAuditoria
    expect(descarga.suggestedFilename()).toBe('reporte-vencimientos.xlsx')

    const rutaExcel = await descarga.path()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(rutaExcel!)
    const hoja = workbook.worksheets[0]
    const contenido = hoja
      .getSheetValues()
      .flatMap((fila) => (Array.isArray(fila) ? fila : []))
      .join('|')
    expect(contenido).toContain('Licencia')
    expect(contenido).toContain('Póliza')
    expect(contenido).toContain('Permiso')

    const respuestaAuditoriaPdf = page.waitForResponse((r) => r.url().includes('/api/reportes/auditar-exportacion'))
    const descargaPdf = await esperarDescarga(page, async () => {
      await page.getByTestId('venc-exportar-pdf').click()
    })
    await respuestaAuditoriaPdf
    expect(descargaPdf.suggestedFilename()).toBe('reporte-vencimientos.pdf')

    const { data: auditoria } = await admin
      .from('auditoria')
      .select('entidad, accion')
      .eq('empresa_id', empresaId)
      .eq('accion', 'exportar')
      .eq('entidad', 'reporte_vencimientos')
    expect(auditoria).toHaveLength(2)
  })
})

test.describe('US4 — Reporte de cumplimiento', () => {
  test('T036: por tipo de vehículo, el % de checklists aprobado vs. con observaciones coincide con el conteo esperado', async ({
    page,
    context
  }) => {
    const { admin, empresaId, adminId } = await prepararEmpresaReportes(page, context, 'T036')
    const tipoLigero = await obtenerTipoVehiculo(admin, empresaId, 'ligero')
    const v1 = await sembrarVehiculo(admin, empresaId, 'T036', { tipoVehiculoId: tipoLigero.id })
    // 2 aprobados, 1 con observaciones → 67% aprobado (redondeado).
    await sembrarChecklist(admin, {
      empresaId,
      vehiculoId: v1.id,
      tipoVehiculoId: tipoLigero.id,
      responsableId: adminId,
      fecha: '2026-08-05',
      resultado: 'aprobado'
    })
    await sembrarChecklist(admin, {
      empresaId,
      vehiculoId: v1.id,
      tipoVehiculoId: tipoLigero.id,
      responsableId: adminId,
      fecha: '2026-08-06',
      resultado: 'aprobado'
    })
    await sembrarChecklist(admin, {
      empresaId,
      vehiculoId: v1.id,
      tipoVehiculoId: tipoLigero.id,
      responsableId: adminId,
      fecha: '2026-08-07',
      resultado: 'con_observaciones'
    })

    await irACumplimiento(page)
    await page.getByTestId('cump-filtro-desde').locator('input').fill('2026-08-01')
    await page.getByTestId('cump-filtro-hasta').locator('input').fill('2026-08-31')

    const fila = page.getByTestId(`cump-fila-${tipoLigero.id}`)
    await expect(fila).toContainText('67%', { timeout: 10_000 })
  })

  test('T037: el % de servicios obligatorios vigentes refleja el momento actual, no depende del rango de fechas', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T037')
    const tipoLigero = await obtenerTipoVehiculo(admin, empresaId, 'ligero')
    const v1 = await sembrarVehiculo(admin, empresaId, 'T037', { tipoVehiculoId: tipoLigero.id })
    // 1 vigente, 1 vencido → 50%.
    await sembrarServicioObligatorio(admin, {
      empresaId,
      vehiculoId: v1.id,
      fechaRealizado: '2026-01-01',
      fechaVencimiento: fechaEnDias(200)
    })
    await sembrarServicioObligatorio(admin, {
      empresaId,
      vehiculoId: v1.id,
      fechaRealizado: '2020-01-01',
      fechaVencimiento: fechaEnDias(-200)
    })

    await irACumplimiento(page)
    // Rango de fechas muy angosto (solo afecta a checklists) — los servicios obligatorios
    // deben mostrar 50% de todas formas, sin importar que caiga fuera de este rango.
    await page.getByTestId('cump-filtro-desde').locator('input').fill('2026-08-01')
    await page.getByTestId('cump-filtro-hasta').locator('input').fill('2026-08-02')

    const fila = page.getByTestId(`cump-fila-${tipoLigero.id}`)
    await expect(fila).toContainText('50%', { timeout: 10_000 })
  })

  test('T038: un tipo de vehículo sin checklists ni servicios obligatorios muestra "Sin datos", nunca "0%"', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T038')
    const tipoMatPeligrosos = await obtenerTipoVehiculo(admin, empresaId, 'mat_peligrosos')

    await irACumplimiento(page)

    const fila = page.getByTestId(`cump-fila-${tipoMatPeligrosos.id}`)
    await expect(fila).toBeVisible({ timeout: 10_000 })
    await expect(fila).toContainText('Sin datos')
    await expect(fila).not.toContainText('0%')
  })

  test('T039: exportar a Excel/PDF incluye ambos porcentajes por tipo de vehículo y audita la exportación', async ({
    page,
    context
  }) => {
    const { admin, empresaId, adminId } = await prepararEmpresaReportes(page, context, 'T039')
    const tipoLigero = await obtenerTipoVehiculo(admin, empresaId, 'ligero')
    const v1 = await sembrarVehiculo(admin, empresaId, 'T039', { tipoVehiculoId: tipoLigero.id })
    await sembrarChecklist(admin, {
      empresaId,
      vehiculoId: v1.id,
      tipoVehiculoId: tipoLigero.id,
      responsableId: adminId,
      fecha: '2026-08-05',
      resultado: 'aprobado'
    })
    await sembrarServicioObligatorio(admin, {
      empresaId,
      vehiculoId: v1.id,
      fechaRealizado: '2026-01-01',
      fechaVencimiento: fechaEnDias(200)
    })

    await irACumplimiento(page)
    await page.getByTestId('cump-filtro-desde').locator('input').fill('2026-08-01')
    await page.getByTestId('cump-filtro-hasta').locator('input').fill('2026-08-31')
    await expect(page.getByTestId(`cump-fila-${tipoLigero.id}`)).toContainText('100%', { timeout: 10_000 })

    const respuestaAuditoria = page.waitForResponse((r) => r.url().includes('/api/reportes/auditar-exportacion'))
    const descarga = await esperarDescarga(page, async () => {
      await page.getByTestId('cump-exportar-excel').click()
    })
    await respuestaAuditoria
    expect(descarga.suggestedFilename()).toBe('reporte-cumplimiento.xlsx')

    const rutaExcel = await descarga.path()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(rutaExcel!)
    const hoja = workbook.worksheets[0]
    const contenido = hoja
      .getSheetValues()
      .flatMap((fila) => (Array.isArray(fila) ? fila : []))
      .join('|')
    expect(contenido).toContain(tipoLigero.nombre)
    expect(contenido).toContain('100%')

    const { data: auditoria } = await admin
      .from('auditoria')
      .select('entidad, accion')
      .eq('empresa_id', empresaId)
      .eq('accion', 'exportar')
      .eq('entidad', 'reporte_cumplimiento')
    expect(auditoria).toHaveLength(1)
  })
})

test.describe('Polish — verificación no funcional (constitución §2-§4)', () => {
  test('T043: un operario sin `ver` de un módulo de origen queda bloqueado de ese reporte específico, los demás siguen accesibles', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T043')
    const { correo, usuarioId } = await crearOperarioAislado(admin, empresaId, 'T043')
    await revocarPermiso(admin, usuarioId, 'combustible', 'ver')
    const session = await crearSesionParaUsuario(correo)
    await inyectarSesion(context, session, process.env.SUPABASE_URL!)

    await page.goto('/operario/reportes')
    await esperarHidratacion(page)

    // Positivo: mantenimiento.ver sigue otorgado por defecto — la sección se muestra normal.
    await expect(page.getByTestId('mant-tabla')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('mant-sin-permiso')).toHaveCount(0)

    // Negativo: combustible.ver fue revocado — la sección se bloquea, no solo queda vacía.
    await page.getByTestId('reportes-tab-combustible').click()
    await expect(page.getByTestId('comb-sin-permiso')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('comb-tabla-cargas')).toHaveCount(0)
  })

  test('T044: el endpoint de auditoría de exportación exige el permiso `reportes.exportar` server-side, no solo en la UI', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaReportes(page, context, 'T044')
    const { correo, usuarioId } = await crearOperarioAislado(admin, empresaId, 'T044')
    const session = await crearSesionParaUsuario(correo)
    await inyectarSesion(context, session, process.env.SUPABASE_URL!)
    await page.goto('/operario/reportes')
    await esperarHidratacion(page)

    // Negativo: sin `reportes.exportar` (no otorgado por defecto), llamado directo (sin pasar
    // por el botón, que ya está oculto) responde 403 y no inserta nada.
    const respuestaSinPermiso = await page.request.post('/api/reportes/auditar-exportacion', {
      data: { reporte: 'reporte_mantenimiento', formato: 'excel', filtros: {} }
    })
    expect(respuestaSinPermiso.status()).toBe(403)
    const { count: conteoSinPermiso } = await admin
      .from('auditoria')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', empresaId)
      .eq('accion', 'exportar')
    expect(conteoSinPermiso).toBe(0)

    // Positivo: con el permiso otorgado explícitamente, responde 201 y audita.
    await otorgarPermiso(admin, empresaId, usuarioId, 'reportes', 'exportar')
    const respuestaConPermiso = await page.request.post('/api/reportes/auditar-exportacion', {
      data: { reporte: 'reporte_mantenimiento', formato: 'pdf', filtros: { desde: '2026-08-01' } }
    })
    expect(respuestaConPermiso.status()).toBe(201)
    const { data: auditoria } = await admin
      .from('auditoria')
      .select('entidad, accion, valores_despues')
      .eq('empresa_id', empresaId)
      .eq('accion', 'exportar')
    expect(auditoria).toHaveLength(1)
    expect(auditoria![0].entidad).toBe('reporte_mantenimiento')
  })

  test('T046: un rango con "desde" posterior a "hasta" se rechaza con un mensaje claro (FR-004)', async ({
    page,
    context
  }) => {
    await prepararEmpresaReportes(page, context, 'T046')
    await irAReportes(page)
    await llenarRangoFechas(page, 'mant', '2026-08-31', '2026-08-01')

    await expect(page.getByTestId('mant-error')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('mant-error')).toContainText(/desde.*posterior.*hasta/i)
  })

  test('T047: exportar un reporte con cero filas genera un archivo válido, no un error (FR-015)', async ({
    page,
    context
  }) => {
    await prepararEmpresaReportes(page, context, 'T047')
    await irAReportes(page)
    // Rango sin ningún dato sembrado.
    await llenarRangoFechas(page, 'mant', '2000-01-01', '2000-01-02')
    await expect(page.getByTestId('mant-tabla')).toContainText('Sin movimientos', { timeout: 10_000 })

    const descarga = await esperarDescarga(page, async () => {
      await page.getByTestId('mant-exportar-excel').click()
    })
    expect(descarga.suggestedFilename()).toBe('reporte-costos-mantenimiento.xlsx')

    const ruta = await descarga.path()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(ruta!)
    const hoja = workbook.worksheets[0]
    expect(hoja.getRow(1).values as unknown[]).toContain('Vehículo')
    expect(hoja.rowCount).toBe(1)
  })
})
