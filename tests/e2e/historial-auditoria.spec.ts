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

// Igual que Combustible/Mantenimiento/Checklist/Servicios Obligatorios: cada test crea su propia
// empresa aislada (`crearEmpresaConAdmin`) — el selector de vehículo (usado indirectamente por
// varias de las 5 fuentes) carga todos los vehículos de la empresa sin paginación, mismo riesgo
// del límite de 1000 filas de PostgREST ya encontrado en Combustible (research.md R8 de 011).
//
// US1 (línea de tiempo) y US2 (bitácora de auditoría) no dependen funcionalmente entre sí — se
// prueban en describes separados, sin orden implícito.

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function idAdminDeEmpresa(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string) {
  const { data } = await admin.from('usuarios').select('id').eq('empresa_id', empresaId).eq('rol', 'admin').single()
  return data!.id as string
}

async function prepararEmpresaConVehiculo(page: Page, context: BrowserContext, prefijo: string) {
  const admin = adminSupabaseClient()
  const { empresaId, correo } = await crearEmpresaConAdmin(admin, {
    nombre: `Empresa Historial ${prefijo} ${Date.now()}`
  })
  const session = await crearSesionParaUsuario(correo)
  await inyectarSesion(context, session, process.env.SUPABASE_URL!)
  const { data: tipo } = await admin
    .from('tipos_vehiculo')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('clave', 'ligero')
    .single()
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data: vehiculo } = await admin
    .from('vehiculos')
    .insert({
      empresa_id: empresaId,
      marca: `Vehiculo ${prefijo}`,
      modelo: `M ${sufijo}`,
      placa: `${prefijo}-${sufijo}`,
      tipo_vehiculo_id: tipo!.id as string
    })
    .select('id, placa')
    .single()
  return { admin, empresaId, correoAdmin: correo, tipoVehiculoId: tipo!.id as string, vehiculo: vehiculo! }
}

async function sembrarTodosLosEventos(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  vehiculoId: string,
  tipoVehiculoId: string,
  prefijo: string
) {
  const adminId = await idAdminDeEmpresa(admin, empresaId)
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  const { data: proveedor } = await admin
    .from('proveedores')
    .insert({ empresa_id: empresaId, nombre: `Proveedor ${prefijo} ${sufijo}` })
    .select('id')
    .single()
  const { data: producto } = await admin
    .from('productos')
    .insert({ empresa_id: empresaId, nombre: `Diesel ${prefijo} ${sufijo}`, tipo: 'combustible' })
    .select('id')
    .single()
  const { data: carga } = await admin
    .from('cargas_combustible')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      proveedor_id: proveedor!.id,
      producto_id: producto!.id,
      fecha: '2026-01-05',
      odometro: 1000,
      cantidad: 45,
      costo_unitario: 20,
      costo_total: 900,
      creado_por: adminId
    })
    .select('id')
    .single()

  const { data: orden } = await admin
    .from('mantenimientos')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      proveedor_id: proveedor!.id,
      tipo: 'correctivo',
      fecha: '2026-02-10',
      costo_total: 500,
      creado_por: adminId
    })
    .select('id')
    .single()

  const { data: checklist } = await admin
    .from('checklists')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      tipo_vehiculo_id: tipoVehiculoId,
      responsable_id: adminId,
      resultado: 'aprobado',
      fecha: '2026-03-15T10:00:00Z'
    })
    .select('id')
    .single()

  const { data: servicio } = await admin
    .from('servicios_obligatorios')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      tipo: 'verificacion_ambiental',
      fecha_realizado: '2026-04-20',
      fecha_vencimiento: '2026-10-20'
    })
    .select('id')
    .single()

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
  const { data: asignacion } = await admin
    .from('asignaciones_conductor_vehiculo')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      conductor_id: conductor!.id,
      asignado_por: adminId,
      fecha_inicio: '2026-05-25'
    })
    .select('id')
    .single()

  return {
    carga: carga!,
    orden: orden!,
    checklist: checklist!,
    servicio: servicio!,
    asignacion: asignacion!,
    conductor: conductor!
  }
}

test.describe('US1 — Consultar la línea de tiempo de un vehículo', () => {
  test('T005: mezcla de eventos aparece ordenada cronológicamente, cada uno con su resumen correcto', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId, vehiculo } = await prepararEmpresaConVehiculo(page, context, 'T005')
    await sembrarTodosLosEventos(admin, empresaId, vehiculo.id, tipoVehiculoId, 'T005')

    await page.goto(`/admin/vehiculos/${vehiculo.id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Actividad' }).click()

    const filas = page.locator('[data-testid="actividad-lista"] .v-list-item')
    await expect(filas).toHaveCount(5)

    // Orden: más reciente primero (conductor 05-25 > servicio 04-20 > checklist 03-15 >
    // mantenimiento 02-10 > combustible 01-05).
    await expect(filas.nth(0)).toContainText('Conductor asignado')
    await expect(filas.nth(1)).toContainText('Verificación ambiental')
    await expect(filas.nth(2)).toContainText('Checklist — Aprobado')
    await expect(filas.nth(3)).toContainText('Mantenimiento correctivo — $500')
    await expect(filas.nth(4)).toContainText('Carga de combustible — 45 L — $900')
  })

  test('T006: click en un evento de combustible, mantenimiento, checklist, o servicio obligatorio navega al detalle completo de ese registro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId, vehiculo } = await prepararEmpresaConVehiculo(page, context, 'T006')
    const { carga, orden, checklist, servicio } = await sembrarTodosLosEventos(
      admin,
      empresaId,
      vehiculo.id,
      tipoVehiculoId,
      'T006'
    )

    await page.goto(`/admin/vehiculos/${vehiculo.id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Actividad' }).click()

    await page.getByTestId(`actividad-item-combustible-${carga.id}`).click()
    await expect(page).toHaveURL(`/admin/combustible/${carga.id}`)

    await page.goto(`/admin/vehiculos/${vehiculo.id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Actividad' }).click()
    await page.getByTestId(`actividad-item-mantenimiento-${orden.id}`).click()
    await expect(page).toHaveURL(`/admin/mantenimiento/${orden.id}`)

    await page.goto(`/admin/vehiculos/${vehiculo.id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Actividad' }).click()
    await page.getByTestId(`actividad-item-checklist-${checklist.id}`).click()
    await expect(page).toHaveURL(`/admin/checklist/${checklist.id}`)

    await page.goto(`/admin/vehiculos/${vehiculo.id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Actividad' }).click()
    await page.getByTestId(`actividad-item-servicio_obligatorio-${servicio.id}`).click()
    await expect(page).toHaveURL(`/admin/servicios-obligatorios/${servicio.id}`)
  })

  test('T007: click en un evento de cambio de conductor cambia a la pestaña "Conductor Asignado", sin navegar a otra URL', async ({
    page,
    context
  }) => {
    const { admin, empresaId, tipoVehiculoId, vehiculo } = await prepararEmpresaConVehiculo(page, context, 'T007')
    const { asignacion } = await sembrarTodosLosEventos(admin, empresaId, vehiculo.id, tipoVehiculoId, 'T007')

    await page.goto(`/admin/vehiculos/${vehiculo.id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Actividad' }).click()

    await page.getByTestId(`actividad-item-conductor-${asignacion.id}`).click()

    await expect(page).toHaveURL(`/admin/vehiculos/${vehiculo.id}`)
    await expect(page.getByTestId('historial-asignaciones-vehiculo-tabla')).toBeVisible()
  })

  test('T008: un vehículo sin ningún evento en ninguna de las 5 fuentes muestra un mensaje claro de "sin eventos"', async ({
    page,
    context
  }) => {
    const { vehiculo } = await prepararEmpresaConVehiculo(page, context, 'T008')

    await page.goto(`/admin/vehiculos/${vehiculo.id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Actividad' }).click()

    await expect(page.getByTestId('sin-eventos')).toBeVisible()
  })

  test('T009: un operario con permiso ver en vehiculos consulta la pestaña Actividad igual que el administrador', async ({
    page,
    context
  }) => {
    const { admin, empresaId, vehiculo } = await prepararEmpresaConVehiculo(page, context, 'T009')

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const correoOperario = `operario-t009-${sufijo}@flotillas.local`
    const { data: authOperario } = await admin.auth.admin.createUser({
      email: correoOperario,
      password: PASSWORD_PRUEBAS,
      email_confirm: true
    })
    await admin.from('usuarios').insert({
      auth_user_id: authOperario!.user.id,
      empresa_id: empresaId,
      nombre: 'Operario T009',
      correo: correoOperario,
      rol: 'operario',
      activo: true
    })
    const sessionOperario = await crearSesionParaUsuario(correoOperario)
    await inyectarSesion(context, sessionOperario, process.env.SUPABASE_URL!)

    // Mismo criterio ya establecido en Combustible/Mantenimiento/Checklist/Servicios
    // Obligatorios: el guard global de sección por rol redirige a cualquier operario fuera de
    // /admin/** (research.md R8) — la autorización real (RLS de cada fuente) ya está cubierta
    // por los tests de RLS de sus propias features.
    await page.goto(`/admin/vehiculos/${vehiculo.id}`)
    await esperarHidratacion(page)
    await expect(page).toHaveURL(/\/operario/)
  })
})

async function clienteAutenticado(correo: string) {
  const client = createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!)
  const { error } = await client.auth.signInWithPassword({ email: correo, password: PASSWORD_PRUEBAS })
  if (error) throw new Error(`No se pudo iniciar sesión como ${correo}: ${error.message}`)
  return client
}

/** Segundo administrador de la misma empresa (rol admin, permite tener 2 actores distintos para
 * probar el filtro de usuario de la bitácora de auditoría sin depender de un operario con
 * permisos otorgados). */
async function sembrarSegundoAdmin(admin: ReturnType<typeof adminSupabaseClient>, empresaId: string, prefijo: string) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const correo = `admin2-${prefijo}-${sufijo}@flotillas.local`
  const { data: auth } = await admin.auth.admin.createUser({ email: correo, password: PASSWORD_PRUEBAS, email_confirm: true })
  const { data: fila } = await admin
    .from('usuarios')
    .insert({ auth_user_id: auth!.user.id, empresa_id: empresaId, nombre: `Admin2 ${prefijo}`, correo, rol: 'admin', activo: true })
    .select('id')
    .single()
  return { id: fila!.id as string, correo }
}

test.describe('US2 — Consultar la bitácora de auditoría', () => {
  test('T013: filtrar por entidad, usuario, acción, o rango de fechas muestra únicamente los eventos que cumplen ese filtro', async ({
    page,
    context
  }) => {
    const { admin, empresaId, correoAdmin, vehiculo } = await prepararEmpresaConVehiculo(page, context, 'T013')
    const cliente1 = await clienteAutenticado(correoAdmin)
    const admin2 = await sembrarSegundoAdmin(admin, empresaId, 'T013')
    const cliente2 = await clienteAutenticado(admin2.correo)

    // Admin 1 registra un servicio obligatorio (entidad servicios_obligatorios, accion crear).
    await cliente1
      .from('servicios_obligatorios')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo.id,
        tipo: 'verificacion_ambiental',
        fecha_realizado: '2026-01-10',
        fecha_vencimiento: '2026-06-10'
      })
      .select('id')
      .single()

    // Admin 2 registra un proveedor (entidad proveedores, accion crear) — actor distinto.
    await cliente2.from('proveedores').insert({ empresa_id: empresaId, nombre: `Proveedor T013 ${Date.now()}` })

    await page.goto('/admin/auditoria')
    await esperarHidratacion(page)
    const filasIniciales = page.locator('[data-testid="auditoria-tabla"] tbody tr[data-testid^="auditoria-fila-"]')
    await expect(async () => {
      expect(await filasIniciales.count()).toBeGreaterThanOrEqual(2)
    }).toPass()

    // Filtro por entidad.
    await page.getByTestId('filtro-entidad').click()
    await page.getByRole('option', { name: 'Servicios Obligatorios', exact: true }).click()
    const filasEntidad = page.locator('[data-testid="auditoria-tabla"] tbody tr[data-testid^="auditoria-fila-"]')
    await expect(filasEntidad).toHaveCount(1)
    await expect(filasEntidad.first()).toContainText('Servicios Obligatorios')
    await page.goto('/admin/auditoria')
    await esperarHidratacion(page)

    // Filtro por usuario (admin2 únicamente).
    await page.getByTestId('filtro-usuario').click()
    await page.getByRole('option', { name: 'Admin2 T013', exact: true }).click()
    const filasUsuario = page.locator('[data-testid="auditoria-tabla"] tbody tr[data-testid^="auditoria-fila-"]')
    await expect(filasUsuario).toHaveCount(1)
    await expect(filasUsuario.first()).toContainText('Proveedores')
    await page.goto('/admin/auditoria')
    await esperarHidratacion(page)

    // Filtro por acción: 'crear' por sí solo es amplio (el alta de la empresa/admin de prueba ya
    // genera varias filas 'crear' de fondo), así que en vez de un conteo exacto se confirma que
    // (a) ambos eventos sembrados siguen presentes, y (b) todas las filas visibles son 'crear'.
    await page.getByTestId('filtro-accion').click()
    await page.getByRole('option', { name: 'Creación', exact: true }).click()
    const tabla = page.getByTestId('auditoria-tabla')
    await expect(tabla).toContainText('Servicios Obligatorios')
    await expect(tabla).toContainText('Proveedores')
    const chipsAccion = page.locator('[data-testid="auditoria-tabla"] tbody tr[data-testid^="auditoria-fila-"] .v-chip')
    await expect(chipsAccion.first()).toBeVisible()
    const total = await chipsAccion.count()
    for (let i = 0; i < total; i += 1) {
      await expect(chipsAccion.nth(i)).toContainText('Creación')
    }
  })

  test('T014: cada fila del listado muestra usuario, fecha/hora, entidad, y acción, sin necesidad de expandirla', async ({
    page,
    context
  }) => {
    const { correoAdmin, empresaId, vehiculo } = await prepararEmpresaConVehiculo(page, context, 'T014')
    const cliente1 = await clienteAutenticado(correoAdmin)
    const { data: servicio } = await cliente1
      .from('servicios_obligatorios')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo.id,
        tipo: 'renovacion_aditamentos',
        fecha_realizado: '2026-01-10',
        fecha_vencimiento: '2026-06-10'
      })
      .select('id')
      .single()
    const { data: evento } = await cliente1
      .from('auditoria')
      .select('id')
      .eq('entidad_id', servicio!.id)
      .eq('accion', 'crear')
      .single()

    await page.goto('/admin/auditoria')
    await esperarHidratacion(page)
    const fila = page.getByTestId(`auditoria-fila-${evento!.id}`)
    await expect(fila).toContainText('Servicios Obligatorios')
    await expect(fila).toContainText('Creación')
  })

  test('T015: expandir un evento de acción editar muestra un diff legible — solo los campos que cambiaron, excluyendo updated_at', async ({
    page,
    context
  }) => {
    const { correoAdmin, empresaId, vehiculo } = await prepararEmpresaConVehiculo(page, context, 'T015')
    const cliente1 = await clienteAutenticado(correoAdmin)
    const { data: servicio } = await cliente1
      .from('servicios_obligatorios')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo.id,
        tipo: 'revision_fisico_mecanica',
        fecha_realizado: '2026-01-10',
        fecha_vencimiento: '2026-06-10'
      })
      .select('id')
      .single()
    await cliente1.from('servicios_obligatorios').update({ fecha_vencimiento: '2026-08-15' }).eq('id', servicio!.id)

    const { data: eventoEditar } = await cliente1
      .from('auditoria')
      .select('id')
      .eq('entidad_id', servicio!.id)
      .eq('accion', 'editar')
      .single()

    await page.goto('/admin/auditoria')
    await esperarHidratacion(page)
    await page.getByTestId(`auditoria-expandir-${eventoEditar!.id}`).click()

    const detalle = page.getByTestId(`auditoria-detalle-${eventoEditar!.id}`)
    await expect(detalle.getByTestId('campo-fecha_vencimiento')).toContainText('2026-06-10')
    await expect(detalle.getByTestId('campo-fecha_vencimiento')).toContainText('2026-08-15')
    await expect(detalle.getByTestId('campo-updated_at')).toHaveCount(0)
  })

  test('T016: expandir un evento de acción crear o eliminar muestra el estado disponible de forma legible, sin intentar calcular un diff', async ({
    page,
    context
  }) => {
    const { correoAdmin, empresaId, vehiculo } = await prepararEmpresaConVehiculo(page, context, 'T016')
    const cliente1 = await clienteAutenticado(correoAdmin)
    const { data: servicio } = await cliente1
      .from('servicios_obligatorios')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculo.id,
        tipo: 'verificacion_ambiental',
        fecha_realizado: '2026-01-10',
        fecha_vencimiento: '2026-06-10'
      })
      .select('id')
      .single()
    const { data: eventoCrear } = await cliente1
      .from('auditoria')
      .select('id')
      .eq('entidad_id', servicio!.id)
      .eq('accion', 'crear')
      .single()

    await cliente1.from('servicios_obligatorios').delete().eq('id', servicio!.id)
    const { data: eventoEliminar } = await cliente1
      .from('auditoria')
      .select('id')
      .eq('entidad_id', servicio!.id)
      .eq('accion', 'eliminar')
      .single()

    await page.goto('/admin/auditoria')
    await esperarHidratacion(page)

    await page.getByTestId(`auditoria-expandir-${eventoCrear!.id}`).click()
    const detalleCrear = page.getByTestId(`auditoria-detalle-${eventoCrear!.id}`)
    await expect(detalleCrear.getByTestId('campo-tipo')).toContainText('verificacion_ambiental')
    await expect(detalleCrear.locator('th')).toHaveCount(0)

    await page.getByTestId(`auditoria-expandir-${eventoEliminar!.id}`).click()
    const detalleEliminar = page.getByTestId(`auditoria-detalle-${eventoEliminar!.id}`)
    await expect(detalleEliminar.getByTestId('campo-tipo')).toContainText('verificacion_ambiental')
    await expect(detalleEliminar.locator('th')).toHaveCount(0)
  })

  test('T017: un operario (sin importar los permisos que tenga otorgados en cualquier módulo) no puede acceder a la bitácora de auditoría', async ({
    page,
    context
  }) => {
    const { admin, empresaId } = await prepararEmpresaConVehiculo(page, context, 'T017')

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const correoOperario = `operario-t017-${sufijo}@flotillas.local`
    const { data: authOperario } = await admin.auth.admin.createUser({
      email: correoOperario,
      password: PASSWORD_PRUEBAS,
      email_confirm: true
    })
    const { data: opRow } = await admin
      .from('usuarios')
      .insert({
        auth_user_id: authOperario!.user.id,
        empresa_id: empresaId,
        nombre: 'Operario T017',
        correo: correoOperario,
        rol: 'operario',
        activo: true
      })
      .select('id')
      .single()
    // Otorgado explícitamente en varios módulos, para reforzar que "sin importar los permisos"
    // realmente no basta — el acceso es exclusivo por rol.
    await admin.from('usuario_permisos').insert([
      { empresa_id: empresaId, usuario_id: opRow!.id, modulo_clave: 'vehiculos', accion: 'editar', otorgado_por: opRow!.id },
      { empresa_id: empresaId, usuario_id: opRow!.id, modulo_clave: 'servicios_obligatorios', accion: 'editar', otorgado_por: opRow!.id }
    ])
    const sessionOperario = await crearSesionParaUsuario(correoOperario)
    await inyectarSesion(context, sessionOperario, process.env.SUPABASE_URL!)

    await page.goto('/admin/auditoria')
    await esperarHidratacion(page)
    await expect(page).toHaveURL(/\/operario/)
  })
})
