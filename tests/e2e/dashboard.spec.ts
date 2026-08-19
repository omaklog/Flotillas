import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import {
  crearEmpresaConAdmin,
  PASSWORD_PRUEBAS,
  crearSesionParaUsuario,
  inyectarSesion,
  esperarHidratacion
} from './helpers'

// US-12.3 (Dashboard principal) — a diferencia de alertas.spec.ts (US-12.1), estos tests no
// dependen de la Edge Function ni escanean todos los tenants: cada test siembra su propia
// empresa vía service_role y solo lee lo que RLS le deja ver a su propio usuario — sin recurso
// mutable global que compartir, corren en paralelo sin `test.describe.configure({ mode: 'serial' })`.

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

function fechaEnDiasISO(dias: number): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

/** Día fijo (no relativo a "hoy") de un mes desplazado `offsetMeses` respecto al actual — evita
 * que el test sea frágil según el día del mes en que corra (research.md R8, "mes en curso"). */
function fechaDiaDelMes(offsetMeses: number, dia: number): string {
  const hoy = new Date()
  return new Date(hoy.getFullYear(), hoy.getMonth() + offsetMeses, dia).toISOString().slice(0, 10)
}

async function sembrarEmpresaBase(admin: ReturnType<typeof adminSupabaseClient>) {
  const { empresaId, correo } = await crearEmpresaConAdmin(admin)
  const { data: tipoVehiculo, error: tipoError } = await admin
    .from('tipos_vehiculo')
    .select('id, nombre')
    .eq('empresa_id', empresaId)
    .eq('clave', 'ligero')
    .single()
  if (tipoError) throw tipoError

  const { data: usuarioAdmin, error: usuarioError } = await admin
    .from('usuarios')
    .select('id')
    .eq('correo', correo)
    .single()
  if (usuarioError) throw usuarioError

  return {
    empresaId,
    correoAdmin: correo,
    tipoVehiculoId: tipoVehiculo!.id,
    tipoVehiculoNombre: tipoVehiculo!.nombre,
    adminUsuarioId: usuarioAdmin!.id
  }
}

async function crearConductor(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  opciones: { fechaVencimientoLicencia: string; activo?: boolean }
): Promise<string> {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data, error } = await admin
    .from('conductores')
    .insert({
      empresa_id: empresaId,
      nombre: 'Conductor',
      apellidos: `Dashboard E2E ${sufijo}`,
      numero_licencia: `LIC-${sufijo}`,
      tipo_licencia: 'federal',
      fecha_vencimiento_licencia: opciones.fechaVencimientoLicencia,
      activo: opciones.activo ?? true
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function crearVehiculo(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  tipoVehiculoId: string,
  opciones?: { baja?: boolean; fechaVencimientoPoliza?: string | null }
): Promise<string> {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data, error } = await admin
    .from('vehiculos')
    .insert({
      empresa_id: empresaId,
      marca: 'MarcaDashboardE2E',
      modelo: 'ModeloDashboardE2E',
      placa: `DSH-${sufijo}`,
      tipo_vehiculo_id: tipoVehiculoId,
      baja: opciones?.baja ?? false,
      fecha_vencimiento_poliza: opciones?.fechaVencimientoPoliza ?? null
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function crearMantenimiento(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  vehiculoId: string,
  adminUsuarioId: string,
  opciones: {
    tipo: 'correctivo' | 'preventivo'
    costoTotal: number
    fecha: string
    estado?: 'activo' | 'cancelado'
  }
): Promise<string> {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data: proveedor, error: proveedorError } = await admin
    .from('proveedores')
    .insert({ empresa_id: empresaId, nombre: `Proveedor Dashboard E2E ${sufijo}` })
    .select('id')
    .single()
  if (proveedorError) throw proveedorError

  const { data, error } = await admin
    .from('mantenimientos')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      proveedor_id: proveedor!.id,
      tipo: opciones.tipo,
      fecha: opciones.fecha,
      costo_total: opciones.costoTotal,
      estado: opciones.estado ?? 'activo',
      creado_por: adminUsuarioId
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function crearChecklist(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  vehiculoId: string,
  tipoVehiculoId: string,
  responsableId: string,
  opciones: { resultado: 'aprobado' | 'con_observaciones'; fecha: string }
): Promise<string> {
  const { data, error } = await admin
    .from('checklists')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      tipo_vehiculo_id: tipoVehiculoId,
      responsable_id: responsableId,
      fecha: opciones.fecha,
      resultado: opciones.resultado
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/** Alerta sembrada directo en la tabla (bypass de la Edge Function, research.md R6 — el
 * dashboard no depende del job diario para sus propios tests) con `created_at` controlado, para
 * poder probar la ventana de 30 días del KPI "checklists sin atender" (R8). */
async function crearAlertaChecklist(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  opciones: { estado: 'pendiente' | 'enviada' | 'resuelta'; creadaHaceDias: number }
): Promise<string> {
  const creadaEn = new Date()
  creadaEn.setDate(creadaEn.getDate() - opciones.creadaHaceDias)
  const { data, error } = await admin
    .from('alertas')
    .insert({
      empresa_id: empresaId,
      tipo: 'checklist',
      entidad_tipo: 'checklists',
      entidad_id: crypto.randomUUID(),
      fecha_vencimiento: null,
      estado: opciones.estado,
      created_at: creadaEn.toISOString()
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function crearOperario(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string
): Promise<{ correo: string; usuarioId: string }> {
  const correo = `operario-dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@flotillas.local`
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: correo,
    password: PASSWORD_PRUEBAS,
    email_confirm: true
  })
  if (authError) throw authError

  const { data: usuario, error: usuarioError } = await admin
    .from('usuarios')
    .insert({
      auth_user_id: authUser.user.id,
      empresa_id: empresaId,
      nombre: 'Operario Dashboard E2E',
      correo,
      rol: 'operario',
      activo: true
    })
    .select('id')
    .single()
  if (usuarioError) throw usuarioError

  return { correo, usuarioId: usuario.id }
}

test.describe('Dashboard — US-12.3', () => {
  test('T028: muestra los 4 KPIs con los valores correctos contra datos sembrados', async ({
    browser
  }) => {
    const admin = adminSupabaseClient()
    const { empresaId, correoAdmin, tipoVehiculoId } = await sembrarEmpresaBase(admin)

    // Vehículos activos: 2 activos, 1 de baja (excluido).
    await crearVehiculo(admin, empresaId, tipoVehiculoId)
    await crearVehiculo(admin, empresaId, tipoVehiculoId)
    await crearVehiculo(admin, empresaId, tipoVehiculoId, { baja: true })

    // Licencias por vencer (30 días): 2 activos dentro de la ventana, 1 activo fuera, 1 inactivo
    // dentro de la ventana (excluido por `activo=false`).
    await crearConductor(admin, empresaId, { fechaVencimientoLicencia: fechaEnDiasISO(10) })
    await crearConductor(admin, empresaId, { fechaVencimientoLicencia: fechaEnDiasISO(20) })
    await crearConductor(admin, empresaId, { fechaVencimientoLicencia: fechaEnDiasISO(90) })
    await crearConductor(admin, empresaId, {
      fechaVencimientoLicencia: fechaEnDiasISO(10),
      activo: false
    })

    // Pólizas por vencer (30 días): 1 vehículo activo dentro de la ventana (además de los 3
    // sembrados arriba, que no tienen póliza).
    await crearVehiculo(admin, empresaId, tipoVehiculoId, {
      fechaVencimientoPoliza: fechaEnDiasISO(5)
    })

    // Checklists sin atender: 2 alertas tipo checklist abiertas dentro de los últimos 30 días, 1
    // resuelta (excluida) y 1 abierta pero de hace 40 días (excluida por la ventana, R8).
    await crearAlertaChecklist(admin, empresaId, { estado: 'pendiente', creadaHaceDias: 1 })
    await crearAlertaChecklist(admin, empresaId, { estado: 'enviada', creadaHaceDias: 5 })
    await crearAlertaChecklist(admin, empresaId, { estado: 'resuelta', creadaHaceDias: 1 })
    await crearAlertaChecklist(admin, empresaId, { estado: 'enviada', creadaHaceDias: 40 })

    const sesion = await crearSesionParaUsuario(correoAdmin)
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await inyectarSesion(contexto, sesion, process.env.SUPABASE_URL!)
    const page = await contexto.newPage()
    await page.goto('/admin')
    await esperarHidratacion(page)

    await expect(page.getByTestId('kpi-vehiculos-activos-valor')).toHaveText('3', {
      timeout: 10_000
    })
    await expect(page.getByTestId('kpi-licencias-por-vencer-valor')).toHaveText('2')
    await expect(page.getByTestId('kpi-polizas-por-vencer-valor')).toHaveText('1')
    await expect(page.getByTestId('kpi-checklists-sin-atender-valor')).toHaveText('2')

    await contexto.close()
  })

  test('T029: la gráfica de mantenimiento por tipo suma costo_total de los últimos 30 días, solo activos', async ({
    browser
  }) => {
    const admin = adminSupabaseClient()
    const { empresaId, correoAdmin, tipoVehiculoId, adminUsuarioId } = await sembrarEmpresaBase(admin)
    const vehiculoId = await crearVehiculo(admin, empresaId, tipoVehiculoId)

    await crearMantenimiento(admin, empresaId, vehiculoId, adminUsuarioId, {
      tipo: 'correctivo',
      costoTotal: 100,
      fecha: fechaEnDiasISO(-5)
    })
    await crearMantenimiento(admin, empresaId, vehiculoId, adminUsuarioId, {
      tipo: 'correctivo',
      costoTotal: 200,
      fecha: fechaEnDiasISO(-10)
    })
    await crearMantenimiento(admin, empresaId, vehiculoId, adminUsuarioId, {
      tipo: 'preventivo',
      costoTotal: 150,
      fecha: fechaEnDiasISO(-2)
    })
    // Fuera de la ventana de 30 días — excluido.
    await crearMantenimiento(admin, empresaId, vehiculoId, adminUsuarioId, {
      tipo: 'correctivo',
      costoTotal: 9999,
      fecha: fechaEnDiasISO(-40)
    })
    // Cancelado — excluido (solo `estado='activo'`).
    await crearMantenimiento(admin, empresaId, vehiculoId, adminUsuarioId, {
      tipo: 'preventivo',
      costoTotal: 9999,
      fecha: fechaEnDiasISO(-1),
      estado: 'cancelado'
    })

    const sesion = await crearSesionParaUsuario(correoAdmin)
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await inyectarSesion(contexto, sesion, process.env.SUPABASE_URL!)
    const page = await contexto.newPage()
    await page.goto('/admin')
    await esperarHidratacion(page)

    const tabla = page.getByTestId('grafica-mantenimiento-tabla')
    await expect(tabla).toContainText('300', { timeout: 10_000 }) // 100 + 200 correctivo
    await expect(tabla).toContainText('150') // preventivo
    await expect(tabla).not.toContainText('9,999')
    await expect(tabla).not.toContainText('9999')

    await contexto.close()
  })

  test('T030: las gráficas de licencias y pólizas por vencer solo cuentan lo que vence en el mes calendario en curso', async ({
    browser
  }) => {
    const admin = adminSupabaseClient()
    const { empresaId, correoAdmin, tipoVehiculoId } = await sembrarEmpresaBase(admin)

    // 2 conductores activos vencen este mes (día 15 fijo), 1 activo vence dos meses después
    // (fuera del mes en curso) — total de activos: 3.
    await crearConductor(admin, empresaId, { fechaVencimientoLicencia: fechaDiaDelMes(0, 15) })
    await crearConductor(admin, empresaId, { fechaVencimientoLicencia: fechaDiaDelMes(0, 16) })
    await crearConductor(admin, empresaId, { fechaVencimientoLicencia: fechaDiaDelMes(2, 15) })

    // 1 vehículo activo vence este mes, 1 activo vence dos meses después (fuera), 1 de baja
    // aunque venza este mes (excluido) — total de activos: 2.
    await crearVehiculo(admin, empresaId, tipoVehiculoId, {
      fechaVencimientoPoliza: fechaDiaDelMes(0, 15)
    })
    await crearVehiculo(admin, empresaId, tipoVehiculoId, {
      fechaVencimientoPoliza: fechaDiaDelMes(2, 15)
    })
    await crearVehiculo(admin, empresaId, tipoVehiculoId, {
      baja: true,
      fechaVencimientoPoliza: fechaDiaDelMes(0, 15)
    })

    const sesion = await crearSesionParaUsuario(correoAdmin)
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await inyectarSesion(contexto, sesion, process.env.SUPABASE_URL!)
    const page = await contexto.newPage()
    await page.goto('/admin')
    await esperarHidratacion(page)

    const tablaLicencias = page.getByTestId('grafica-licencias-mes-tabla')
    await expect(tablaLicencias.getByRole('row').filter({ hasText: 'Por vencer este mes' })).toContainText(
      '2',
      { timeout: 10_000 }
    )
    await expect(tablaLicencias.getByRole('row').filter({ hasText: 'Resto de la flota' })).toContainText('1')

    const tablaPolizas = page.getByTestId('grafica-polizas-mes-tabla')
    await expect(tablaPolizas.getByRole('row').filter({ hasText: 'Por vencer este mes' })).toContainText('1')
    await expect(tablaPolizas.getByRole('row').filter({ hasText: 'Resto de la flota' })).toContainText('1')

    await contexto.close()
  })

  test('T031: el indicador de cumplimiento refleja % aprobado vs. con observaciones de los últimos 30 días', async ({
    browser
  }) => {
    const admin = adminSupabaseClient()
    const { empresaId, correoAdmin, tipoVehiculoId, tipoVehiculoNombre, adminUsuarioId } =
      await sembrarEmpresaBase(admin)
    const vehiculoId = await crearVehiculo(admin, empresaId, tipoVehiculoId)

    // 3 aprobados + 1 con observaciones dentro de los últimos 30 días → 75% / 25%.
    await crearChecklist(admin, empresaId, vehiculoId, tipoVehiculoId, adminUsuarioId, {
      resultado: 'aprobado',
      fecha: new Date().toISOString()
    })
    await crearChecklist(admin, empresaId, vehiculoId, tipoVehiculoId, adminUsuarioId, {
      resultado: 'aprobado',
      fecha: new Date().toISOString()
    })
    await crearChecklist(admin, empresaId, vehiculoId, tipoVehiculoId, adminUsuarioId, {
      resultado: 'aprobado',
      fecha: new Date().toISOString()
    })
    await crearChecklist(admin, empresaId, vehiculoId, tipoVehiculoId, adminUsuarioId, {
      resultado: 'con_observaciones',
      fecha: new Date().toISOString()
    })
    // Fuera de la ventana de 30 días — no debe afectar el porcentaje.
    const fechaVieja = new Date()
    fechaVieja.setDate(fechaVieja.getDate() - 40)
    await crearChecklist(admin, empresaId, vehiculoId, tipoVehiculoId, adminUsuarioId, {
      resultado: 'con_observaciones',
      fecha: fechaVieja.toISOString()
    })

    const sesion = await crearSesionParaUsuario(correoAdmin)
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await inyectarSesion(contexto, sesion, process.env.SUPABASE_URL!)
    const page = await contexto.newPage()
    await page.goto('/admin')
    await esperarHidratacion(page)

    const fila = page.getByTestId(`cumplimiento-fila-${tipoVehiculoNombre}`)
    await expect(fila).toContainText('75% aprobado', { timeout: 10_000 })
    await expect(fila).toContainText('25% con observaciones')
    await expect(fila).toContainText('(4 checklists)')

    await contexto.close()
  })

  test('T032: un operario sin permiso "ver" en checklist ve esa sección vacía, sin romper el resto del dashboard', async ({
    browser
  }) => {
    const admin = adminSupabaseClient()
    const { empresaId, tipoVehiculoId, tipoVehiculoNombre, adminUsuarioId } = await sembrarEmpresaBase(admin)
    const vehiculoId = await crearVehiculo(admin, empresaId, tipoVehiculoId)
    await crearChecklist(admin, empresaId, vehiculoId, tipoVehiculoId, adminUsuarioId, {
      resultado: 'aprobado',
      fecha: new Date().toISOString()
    })

    const operario = await crearOperario(admin, empresaId)
    // 'checklist.ver' se otorga por defecto (trigger otorgar_permisos_default_operario) — se
    // revoca explícitamente para este test (FR-012).
    await admin
      .from('usuario_permisos')
      .delete()
      .eq('usuario_id', operario.usuarioId)
      .eq('modulo_clave', 'checklist')
      .eq('accion', 'ver')

    const sesion = await crearSesionParaUsuario(operario.correo)
    const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await inyectarSesion(contexto, sesion, process.env.SUPABASE_URL!)
    const page = await contexto.newPage()
    await page.goto('/operario')
    await esperarHidratacion(page)

    // El resto del dashboard sigue funcionando (permiso 'vehiculos' intacto).
    await expect(page.getByTestId('kpi-vehiculos-activos-valor')).toHaveText('1', { timeout: 10_000 })
    await expect(page.getByTestId('dashboard-error')).toHaveCount(0)

    // La sección de cumplimiento, cuyo origen (`checklists`) ya no es visible para este
    // operario, queda vacía en vez de mostrar el checklist sembrado o romper la pantalla.
    await expect(page.getByTestId(`cumplimiento-fila-${tipoVehiculoNombre}`)).toHaveCount(0)
    await expect(page.getByTestId('cumplimiento-checklists')).toContainText(
      'Sin checklists en los últimos 30 días.'
    )

    await contexto.close()
  })
})
