import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import {
  crearEmpresaConAdmin,
  rfcUnico,
  PASSWORD_PRUEBAS,
  crearSesionParaUsuario,
  inyectarSesion,
  esperarHidratacion
} from './helpers'

// US-12.1 (Edge Function `generar-alertas`, job diario) — research.md R4: se invoca la Edge
// Function directo por HTTP, simulando la corrida de `pg_cron`, en vez de esperar la agenda real.
// Requiere que la función esté servida localmente (`supabase functions serve generar-alertas
// --env-file .env`, ver research.md nota post-implementación de T019) además del stack normal de
// `supabase start`.

const MAILPIT_URL = 'http://127.0.0.1:54424'
const EDGE_FUNCTION_URL = `${process.env.SUPABASE_URL}/functions/v1/generar-alertas`
const NOTIFICAR_URL = 'http://127.0.0.1:3030/api/alertas/notificar'

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

interface MailpitMensaje {
  ID: string
  To: { Address: string }[]
}

/** Mismo capturador SMTP local que el resto de la suite (empresas.spec.ts) — expuesto como
 * `[inbucket]` en supabase/config.toml por compatibilidad de nombre, es Mailpit en realidad. */
async function contarCorreos(destinatario: string, esperados: number): Promise<number> {
  for (let intento = 0; intento < 20; intento++) {
    const listado: { messages: MailpitMensaje[] } = await fetch(
      `${MAILPIT_URL}/api/v1/messages`
    ).then((r) => r.json())
    const cuenta = listado.messages.filter((m) =>
      m.To.some((destino) => destino.Address === destinatario)
    ).length
    if (cuenta >= esperados) return cuenta
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`No llegaron ${esperados} correo(s) a ${destinatario} tras 10s (revisar Mailpit)`)
}

function fechaEnDias(dias: number): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

async function invocarJob(): Promise<{
  alertasCreadas: number
  alertasResueltas: number
  correosEnviados: number
}> {
  const respuesta = await fetch(EDGE_FUNCTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
  })
  if (!respuesta.ok) {
    throw new Error(`Edge Function generar-alertas respondió ${respuesta.status}`)
  }
  return respuesta.json()
}

async function obtenerAlerta(
  admin: ReturnType<typeof adminSupabaseClient>,
  tipo: string,
  entidadId: string
) {
  const { data } = await admin
    .from('alertas')
    .select('*')
    .eq('tipo', tipo)
    .eq('entidad_id', entidadId)
    .maybeSingle()
  return data
}

/** Empresa + admin (crearEmpresaConAdmin, tests/e2e/helpers.ts) + su tipo de vehículo por
 * defecto ('ligero', sembrado automáticamente al crear la empresa — trg_empresas_sembrar_tipos_
 * vehiculo_default) + el id de usuario del admin (para checklists.responsable_id). */
async function sembrarEmpresaBase(admin: ReturnType<typeof adminSupabaseClient>) {
  const { empresaId, correo } = await crearEmpresaConAdmin(admin)
  const { data: tipoVehiculo, error: tipoError } = await admin
    .from('tipos_vehiculo')
    .select('id')
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
    adminUsuarioId: usuarioAdmin!.id
  }
}

async function crearConductorPorVencer(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  dias = 15
): Promise<string> {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data, error } = await admin
    .from('conductores')
    .insert({
      empresa_id: empresaId,
      nombre: 'Conductor',
      apellidos: `Prueba ${sufijo}`,
      numero_licencia: `LIC-${sufijo}`,
      tipo_licencia: 'federal',
      fecha_vencimiento_licencia: fechaEnDias(dias),
      activo: true
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
  opciones?: { fechaVencimientoPoliza?: string | null }
): Promise<string> {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data, error } = await admin
    .from('vehiculos')
    .insert({
      empresa_id: empresaId,
      marca: 'MarcaAlertasE2E',
      modelo: 'ModeloAlertasE2E',
      placa: `ALE-${sufijo}`,
      tipo_vehiculo_id: tipoVehiculoId,
      baja: false,
      fecha_vencimiento_poliza: opciones?.fechaVencimientoPoliza ?? null
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function crearPermisoVehiculoPorVencer(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  vehiculoId: string,
  dias = 15
): Promise<string> {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { data: permiso, error: permisoError } = await admin
    .from('permisos')
    .insert({
      empresa_id: empresaId,
      clave: `permiso_e2e_${sufijo.replace(/-/g, '_')}`,
      nombre: 'Permiso E2E',
      tipo: 'federal'
    })
    .select('id')
    .single()
  if (permisoError) throw permisoError

  const { data, error } = await admin
    .from('vehiculo_permisos')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      permiso_id: permiso.id,
      fecha_vencimiento: fechaEnDias(dias)
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function crearServicioObligatorioPorVencer(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  vehiculoId: string,
  dias = 15
): Promise<string> {
  const { data, error } = await admin
    .from('servicios_obligatorios')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      tipo: 'verificacion_ambiental',
      fecha_realizado: fechaEnDias(-30),
      fecha_vencimiento: fechaEnDias(dias)
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function crearChecklistConObservaciones(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  vehiculoId: string,
  tipoVehiculoId: string,
  responsableId: string
): Promise<string> {
  const { data, error } = await admin
    .from('checklists')
    .insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculoId,
      tipo_vehiculo_id: tipoVehiculoId,
      responsable_id: responsableId,
      fecha: new Date().toISOString(),
      resultado: 'con_observaciones'
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

async function crearOperario(
  admin: ReturnType<typeof adminSupabaseClient>,
  empresaId: string,
  opciones?: { conAprobarAlertas?: boolean }
): Promise<{ correo: string; usuarioId: string }> {
  const correo = `operario-alertas-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@flotillas.local`
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
      nombre: 'Operario Alertas E2E',
      correo,
      rol: 'operario',
      activo: true
    })
    .select('id')
    .single()
  if (usuarioError) throw usuarioError

  // El trigger `otorgar_permisos_default_operario` (migración `permisos_ver_y_defaults`) ya
  // otorga 'alertas.ver' por defecto al insertar — 'aprobar' se agrega aquí solo si se pide.
  if (opciones?.conAprobarAlertas) {
    const { error: permisoError } = await admin.from('usuario_permisos').insert({
      empresa_id: empresaId,
      usuario_id: usuario.id,
      modulo_clave: 'alertas',
      accion: 'aprobar',
      otorgado_por: usuario.id
    })
    if (permisoError) throw permisoError
  }

  return { correo, usuarioId: usuario.id }
}

// La Edge Function escanea TODOS los tenants en cada corrida (FR-001, sin scoping posible por
// test) — dos invocaciones concurrentes de `invocarJob()` (de dos tests cualesquiera de este
// archivo corriendo en paralelo, incluso de describes distintos) pueden intercalar su fase de
// creación con la de resolución de OTRA corrida sobre datos que ya cambiaron a medio camino:
// desde una alerta duplicada (creación vs. resolución de la misma condición, reproducido con
// `--repeat-each=2`) hasta que un test que "resuelve" una alerta a mano vea su condición
// original (el conductor/vehículo sigue vigente) recreada por la corrida de otro test. Mismo
// criterio que empresas.spec.ts (T044/T045): serializar los tests que comparten un recurso
// mutable global en vez de aislar cada uno (aquí no se puede aislar por archivo/fila, el recurso
// compartido es la corrida completa del job) — todo el archivo corre en un solo worker.
test.describe('Alertas — US-12.1 (job diario) y US-12.2 (panel in-app)', () => {
  test.describe.configure({ mode: 'serial' })

  test.describe('US-12.1 — Job diario de detección de vencimientos', () => {
    test('T012: crea alertas para licencia/póliza/permiso/servicio por vencer y notifica a los administradores', async () => {
      const admin = adminSupabaseClient()
      const { empresaId, correoAdmin, tipoVehiculoId } = await sembrarEmpresaBase(admin)

      const conductorId = await crearConductorPorVencer(admin, empresaId)
      const vehiculoId = await crearVehiculo(admin, empresaId, tipoVehiculoId, {
        fechaVencimientoPoliza: fechaEnDias(15)
      })
      const vehiculoPermisoId = await crearPermisoVehiculoPorVencer(admin, empresaId, vehiculoId)
      const servicioId = await crearServicioObligatorioPorVencer(admin, empresaId, vehiculoId)

      await invocarJob()

      const alertaLicencia = await obtenerAlerta(admin, 'licencia', conductorId)
      const alertaPoliza = await obtenerAlerta(admin, 'poliza', vehiculoId)
      const alertaPermiso = await obtenerAlerta(admin, 'permiso', vehiculoPermisoId)
      const alertaServicio = await obtenerAlerta(admin, 'servicio_obligatorio', servicioId)

      for (const alerta of [alertaLicencia, alertaPoliza, alertaPermiso, alertaServicio]) {
        expect(alerta, JSON.stringify(alerta)).not.toBeNull()
        expect(alerta!.estado).toBe('enviada')
      }

      await contarCorreos(correoAdmin, 4)
    })

    test('T013: crea alerta de checklist con observaciones (sin fecha de vencimiento) y notifica', async () => {
      const admin = adminSupabaseClient()
      const { empresaId, correoAdmin, tipoVehiculoId, adminUsuarioId } =
        await sembrarEmpresaBase(admin)
      const vehiculoId = await crearVehiculo(admin, empresaId, tipoVehiculoId)
      const checklistId = await crearChecklistConObservaciones(
        admin,
        empresaId,
        vehiculoId,
        tipoVehiculoId,
        adminUsuarioId
      )

      await invocarJob()

      const alerta = await obtenerAlerta(admin, 'checklist', checklistId)
      expect(alerta).not.toBeNull()
      expect(alerta!.estado).toBe('enviada')
      expect(alerta!.fecha_vencimiento).toBeNull()

      await contarCorreos(correoAdmin, 1)
    })

    test('T014: correr el job dos veces no duplica la alerta de una misma condición', async () => {
      const admin = adminSupabaseClient()
      const { empresaId } = await sembrarEmpresaBase(admin)
      const conductorId = await crearConductorPorVencer(admin, empresaId)

      await invocarJob()
      const primera = await obtenerAlerta(admin, 'licencia', conductorId)
      expect(primera).not.toBeNull()

      await invocarJob()
      const { count } = await admin
        .from('alertas')
        .select('*', { count: 'exact', head: true })
        .eq('tipo', 'licencia')
        .eq('entidad_id', conductorId)
      expect(count).toBe(1)
    })

    test('T015: dar de baja el vehículo resuelve automáticamente su alerta de póliza', async () => {
      const admin = adminSupabaseClient()
      const { empresaId, tipoVehiculoId } = await sembrarEmpresaBase(admin)
      const vehiculoId = await crearVehiculo(admin, empresaId, tipoVehiculoId, {
        fechaVencimientoPoliza: fechaEnDias(15)
      })

      await invocarJob()
      const alertaAbierta = await obtenerAlerta(admin, 'poliza', vehiculoId)
      expect(alertaAbierta!.estado).toBe('enviada')

      const { error: bajaError } = await admin
        .from('vehiculos')
        .update({ baja: true })
        .eq('id', vehiculoId)
      if (bajaError) throw bajaError

      await invocarJob()
      const alertaResuelta = await obtenerAlerta(admin, 'poliza', vehiculoId)
      expect(alertaResuelta!.estado).toBe('resuelta')
    })

    test('T016: una empresa sin administrador activo no rompe la corrida para las demás', async () => {
      const admin = adminSupabaseClient()

      const rfcSinAdmin = rfcUnico()
      const { data: empresaSinAdmin, error: empresaError } = await admin
        .from('empresas')
        .insert({ nombre: `Empresa Sin Admin E2E ${Date.now()}`, rfc: rfcSinAdmin })
        .select('id')
        .single()
      if (empresaError) throw empresaError

      const conductorSinAdmin = await crearConductorPorVencer(admin, empresaSinAdmin.id)

      const { empresaId: empresaConAdmin, correoAdmin } = await sembrarEmpresaBase(admin)
      const conductorSano = await crearConductorPorVencer(admin, empresaConAdmin)

      await invocarJob()

      const alertaSinAdmin = await obtenerAlerta(admin, 'licencia', conductorSinAdmin)
      expect(
        alertaSinAdmin,
        'la alerta debe crearse aunque no haya a quién notificar'
      ).not.toBeNull()

      const alertaSana = await obtenerAlerta(admin, 'licencia', conductorSano)
      expect(alertaSana!.estado).toBe('enviada')
      await contarCorreos(correoAdmin, 1)
    })

    test('T017: un fallo al notificar deja la alerta en pendiente sin bloquear el resto de la corrida', async () => {
      const admin = adminSupabaseClient()

      // Empresa "veneno": su único administrador tiene un correo sintácticamente inválido (sin
      // "@") — service_role bypassea la validación de formato del formulario normal, así que esto
      // solo es posible sembrándolo directo. sendMail() (Nodemailer) rechaza sincrónicamente ese
      // destinatario ("No recipients defined", verificado en research.md/T018) — un fallo real y
      // determinístico del paso de notificación, no un mock de infraestructura.
      const rfcVeneno = rfcUnico()
      const { data: empresaVeneno, error: empresaError } = await admin
        .from('empresas')
        .insert({ nombre: `Empresa Veneno E2E ${Date.now()}`, rfc: rfcVeneno })
        .select('id')
        .single()
      if (empresaError) throw empresaError

      const { data: authAdminVeneno, error: authError } = await admin.auth.admin.createUser({
        email: `admin-veneno-${Date.now()}@flotillas.local`,
        password: PASSWORD_PRUEBAS,
        email_confirm: true
      })
      if (authError) throw authError

      const { error: usuarioError } = await admin.from('usuarios').insert({
        auth_user_id: authAdminVeneno.user.id,
        empresa_id: empresaVeneno.id,
        nombre: 'Admin Veneno E2E',
        correo: 'admin-veneno-sin-arroba-invalido',
        rol: 'admin',
        activo: true
      })
      if (usuarioError) throw usuarioError

      const conductorVeneno = await crearConductorPorVencer(admin, empresaVeneno.id)

      const { empresaId: empresaSana, correoAdmin } = await sembrarEmpresaBase(admin)
      const conductorSano = await crearConductorPorVencer(admin, empresaSana)

      await invocarJob()

      const alertaVeneno = await obtenerAlerta(admin, 'licencia', conductorVeneno)
      expect(alertaVeneno, 'la alerta debe existir aunque el envío haya fallado').not.toBeNull()
      expect(alertaVeneno!.estado).toBe('pendiente')

      const alertaSana = await obtenerAlerta(admin, 'licencia', conductorSano)
      expect(alertaSana!.estado).toBe('enviada')
      await contarCorreos(correoAdmin, 1)
    })
  })

  test.describe('server/api/alertas/notificar.post.ts — protección por secreto compartido', () => {
    test('T017b: rechaza sin el secreto correcto, incluso con una alerta real', async () => {
      const admin = adminSupabaseClient()
      const { empresaId } = await sembrarEmpresaBase(admin)
      const conductorId = await crearConductorPorVencer(admin, empresaId)

      const { data: alerta, error } = await admin
        .from('alertas')
        .insert({
          empresa_id: empresaId,
          tipo: 'licencia',
          entidad_tipo: 'conductores',
          entidad_id: conductorId,
          fecha_vencimiento: fechaEnDias(15),
          estado: 'pendiente'
        })
        .select('id')
        .single()
      if (error) throw error

      const respuesta = await fetch(NOTIFICAR_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer secreto-incorrecto', 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertaId: alerta.id })
      })
      expect(respuesta.status).toBe(401)

      const { data: alertaSinCambios } = await admin
        .from('alertas')
        .select('estado')
        .eq('id', alerta.id)
        .single()
      expect(alertaSinCambios!.estado).toBe('pendiente')
    })
  })

  test.describe('US-12.2 — Panel de alertas in-app', () => {
    test('T020: el contador de la barra superior refleja las alertas abiertas, en admin y en operario', async ({
      browser
    }) => {
      const admin = adminSupabaseClient()
      const { empresaId, correoAdmin } = await sembrarEmpresaBase(admin)
      const conductorAbierta1 = await crearConductorPorVencer(admin, empresaId)
      const conductorAbierta2 = await crearConductorPorVencer(admin, empresaId)
      const conductorParaResolver = await crearConductorPorVencer(admin, empresaId)

      await invocarJob()

      const alertaAResolver = await obtenerAlerta(admin, 'licencia', conductorParaResolver)
      // Se desactiva también el conductor (no solo se marca la alerta 'resuelta'): otra prueba de
      // este archivo puede invocar el job de forma concurrente (escanea TODOS los tenants, T015) —
      // si la condición siguiera vigente, esa corrida ajena recrearía la alerta que se "resolvió"
      // aquí (el índice único solo bloquea mientras esté pendiente/enviada), volviendo el conteo
      // inestable. Con el conductor inactivo, la condición ya no aplica para nadie.
      await admin.from('conductores').update({ activo: false }).eq('id', conductorParaResolver)
      await admin.from('alertas').update({ estado: 'resuelta' }).eq('id', alertaAResolver!.id)

      // Confirma que las 2 que sí quedaron abiertas efectivamente lo están (evita un falso
      // positivo si, por ejemplo, ninguna se hubiera creado).
      expect((await obtenerAlerta(admin, 'licencia', conductorAbierta1))!.estado).toBe('enviada')
      expect((await obtenerAlerta(admin, 'licencia', conductorAbierta2))!.estado).toBe('enviada')

      const sesionAdmin = await crearSesionParaUsuario(correoAdmin)
      const contextoAdmin = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      await inyectarSesion(contextoAdmin, sesionAdmin, process.env.SUPABASE_URL!)
      const paginaAdmin = await contextoAdmin.newPage()
      await paginaAdmin.goto('/admin')
      await esperarHidratacion(paginaAdmin)
      await expect(paginaAdmin.getByTestId('notificaciones-alertas-badge')).toContainText('2', {
        timeout: 10_000
      })
      await contextoAdmin.close()

      const operario = await crearOperario(admin, empresaId)
      const sesionOperario = await crearSesionParaUsuario(operario.correo)
      const contextoOperario = await browser.newContext({
        storageState: { cookies: [], origins: [] }
      })
      await inyectarSesion(contextoOperario, sesionOperario, process.env.SUPABASE_URL!)
      const paginaOperario = await contextoOperario.newPage()
      await paginaOperario.goto('/operario')
      await esperarHidratacion(paginaOperario)
      await expect(paginaOperario.getByTestId('notificaciones-alertas-badge')).toContainText('2', {
        timeout: 10_000
      })
      await contextoOperario.close()
    })

    test('T021: filtrar por tipo o por estado muestra únicamente las alertas que cumplen ese filtro', async ({
      browser
    }) => {
      const admin = adminSupabaseClient()
      const { empresaId, correoAdmin, tipoVehiculoId, adminUsuarioId } =
        await sembrarEmpresaBase(admin)
      const conductorId = await crearConductorPorVencer(admin, empresaId)
      const vehiculoId = await crearVehiculo(admin, empresaId, tipoVehiculoId)
      const checklistId = await crearChecklistConObservaciones(
        admin,
        empresaId,
        vehiculoId,
        tipoVehiculoId,
        adminUsuarioId
      )

      await invocarJob()

      const alertaLicencia = await obtenerAlerta(admin, 'licencia', conductorId)
      const alertaChecklist = await obtenerAlerta(admin, 'checklist', checklistId)
      await admin.from('alertas').update({ estado: 'resuelta' }).eq('id', alertaChecklist!.id)

      const sesionAdmin = await crearSesionParaUsuario(correoAdmin)
      const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      await inyectarSesion(contexto, sesionAdmin, process.env.SUPABASE_URL!)
      const page = await contexto.newPage()
      await page.goto('/admin/alertas')
      await esperarHidratacion(page)

      await expect(page.getByTestId(`alertas-fila-${alertaLicencia!.id}`)).toBeVisible()
      await expect(page.getByTestId(`alertas-fila-${alertaChecklist!.id}`)).toBeVisible()

      await page.getByRole('combobox', { name: 'Tipo' }).click({ force: true })
      await page.getByRole('option', { name: 'Licencia' }).click()
      await expect(page.getByTestId(`alertas-fila-${alertaLicencia!.id}`)).toBeVisible()
      await expect(page.getByTestId(`alertas-fila-${alertaChecklist!.id}`)).not.toBeVisible()

      // `clearable` agrega un botón "Clear Tipo" (aria-label) — mismo patrón ya usado en
      // vehiculos.spec.ts/empresas.spec.ts para limpiar un v-select antes de aplicar otro filtro.
      await page.getByLabel('Clear Tipo').click()

      await page.getByRole('combobox', { name: 'Estado' }).click({ force: true })
      await page.getByRole('option', { name: 'Resuelta' }).click()
      await expect(page.getByTestId(`alertas-fila-${alertaChecklist!.id}`)).toBeVisible()
      await expect(page.getByTestId(`alertas-fila-${alertaLicencia!.id}`)).not.toBeVisible()

      await contexto.close()
    })

    test('T022: un operario con permiso "aprobar" puede marcar una alerta como resuelta y el contador baja', async ({
      browser
    }) => {
      const admin = adminSupabaseClient()
      const { empresaId } = await sembrarEmpresaBase(admin)
      const conductorId = await crearConductorPorVencer(admin, empresaId)

      await invocarJob()
      const alerta = await obtenerAlerta(admin, 'licencia', conductorId)
      expect(alerta!.estado).toBe('enviada')

      const operario = await crearOperario(admin, empresaId, { conAprobarAlertas: true })
      const sesion = await crearSesionParaUsuario(operario.correo)
      const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      await inyectarSesion(contexto, sesion, process.env.SUPABASE_URL!)
      const page = await contexto.newPage()
      await page.goto('/operario/alertas')
      await esperarHidratacion(page)

      await expect(page.getByTestId('notificaciones-alertas-badge')).toContainText('1', {
        timeout: 10_000
      })

      await page.getByTestId(`resolver-${alerta!.id}`).click()
      await expect(page.getByTestId(`resolver-${alerta!.id}`)).toHaveCount(0, { timeout: 10_000 })

      const { data: alertaActualizada } = await admin
        .from('alertas')
        .select('estado')
        .eq('id', alerta!.id)
        .single()
      expect(alertaActualizada!.estado).toBe('resuelta')

      await page.reload()
      await esperarHidratacion(page)
      await expect(page.getByTestId('notificaciones-alertas-badge')).not.toContainText('1', {
        timeout: 10_000
      })

      await contexto.close()
    })

    test('T023: un operario sin permiso "aprobar" (solo "ver", por defecto) no tiene disponible la acción de resolver', async ({
      browser
    }) => {
      const admin = adminSupabaseClient()
      const { empresaId } = await sembrarEmpresaBase(admin)
      const conductorId = await crearConductorPorVencer(admin, empresaId)

      await invocarJob()
      const alerta = await obtenerAlerta(admin, 'licencia', conductorId)

      const operario = await crearOperario(admin, empresaId)
      const sesion = await crearSesionParaUsuario(operario.correo)
      const contexto = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      await inyectarSesion(contexto, sesion, process.env.SUPABASE_URL!)
      const page = await contexto.newPage()
      await page.goto('/operario/alertas')
      await esperarHidratacion(page)

      await expect(page.getByTestId(`alertas-fila-${alerta!.id}`)).toBeVisible()
      await expect(page.getByTestId(`resolver-${alerta!.id}`)).toHaveCount(0)

      await contexto.close()
    })
  })
})
