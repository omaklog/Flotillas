import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { esperarHidratacion } from './helpers'

// El caso positivo/negativo de RLS vive en tests/e2e/rls.spec.ts, no aquí — mismo criterio que
// Vehículos y Conductores.

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

async function empresaAdmin() {
  const admin = adminSupabaseClient()
  const { data: perfilAdmin } = await admin
    .from('usuarios')
    .select('id, empresa_id, nombre')
    .eq('correo', 'admin-e2e@flotillas.local')
    .single()
  const { data: tipo } = await admin
    .from('tipos_vehiculo')
    .select('id')
    .eq('empresa_id', perfilAdmin!.empresa_id!)
    .eq('clave', 'ligero')
    .single()
  return {
    admin,
    empresaId: perfilAdmin!.empresa_id!,
    tipoVehiculoId: tipo!.id,
    adminId: perfilAdmin!.id,
    adminNombre: perfilAdmin!.nombre
  }
}

async function sembrarVehiculo(prefijo: string) {
  const { admin, empresaId, tipoVehiculoId } = await empresaAdmin()
  const sufijo = Date.now() + Math.floor(Math.random() * 1000)
  const marca = `Marca ${prefijo} ${sufijo}`
  const modelo = 'X'
  const placa = `${prefijo}-${sufijo}`
  const { data: vehiculo } = await admin
    .from('vehiculos')
    .insert({
      empresa_id: empresaId,
      marca,
      modelo,
      placa,
      tipo_vehiculo_id: tipoVehiculoId
    })
    .select('id')
    .single()
  return {
    admin,
    empresaId,
    vehiculoId: vehiculo!.id as string,
    marca,
    // El v-autocomplete de vehículos muestra "marca modelo (placa)"
    // (VehiculosAsignados.vue, `nombreCompleto`).
    nombreCompleto: `${marca} ${modelo} (${placa})`
  }
}

async function sembrarConductor(prefijo: string) {
  const { admin, empresaId, adminId } = await empresaAdmin()
  const sufijo = Date.now() + Math.floor(Math.random() * 1000)
  const nombre = `Nombre ${prefijo} ${sufijo}`
  const apellidos = `Apellido ${prefijo}`
  const { data: conductor } = await admin
    .from('conductores')
    .insert({
      empresa_id: empresaId,
      nombre,
      apellidos,
      numero_licencia: `${prefijo}-${sufijo}`,
      tipo_licencia: 'federal',
      fecha_vencimiento_licencia: '2030-01-01'
    })
    .select('id')
    .single()
  return {
    admin,
    empresaId,
    adminId,
    conductorId: conductor!.id as string,
    nombre,
    // El v-autocomplete de conductores muestra "nombre apellidos" (ConductorAsignado.vue,
    // `nombreCompleto`) — las opciones de getByRole('option', ...) deben coincidir con ese texto
    // completo, no solo con `nombre`.
    nombreCompleto: `${nombre} ${apellidos}`
  }
}

async function asignarViaServiceRole(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: { empresaId: string; vehiculoId: string; conductorId: string; asignadoPor: string }
) {
  const { data } = await admin
    .from('asignaciones_conductor_vehiculo')
    .insert({
      empresa_id: opciones.empresaId,
      vehiculo_id: opciones.vehiculoId,
      conductor_id: opciones.conductorId,
      asignado_por: opciones.asignadoPor
    })
    .select('id')
    .single()
  return data!.id as string
}

test.describe('US1 — Administrador asigna o reemplaza el conductor de un vehículo', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T007: asignar un conductor a un vehículo sin conductor previo lo deja vigente de inmediato', async ({
    page
  }) => {
    const { vehiculoId } = await sembrarVehiculo('T007')
    const { nombre, nombreCompleto } = await sembrarConductor('T007')

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Conductor Asignado' }).click()
    await expect(page.getByTestId('asignar-conductor-btn')).toHaveText('Asignar conductor')
    await page.getByTestId('asignar-conductor-btn').click()
    await page.getByRole('combobox', { name: 'Conductor' }).fill(nombre)
    await page.getByRole('option', { name: nombreCompleto, exact: true }).click()
    await page.getByTestId('confirmar-asignar-conductor-btn').click()

    await expect(page.getByTestId('conductor-vigente-nombre')).toContainText(nombre)
  })

  test('T008: asignar un conductor distinto reemplaza automáticamente al anterior, sin diálogo de confirmación', async ({
    page
  }) => {
    const { admin, empresaId, vehiculoId } = await sembrarVehiculo('T008')
    const { conductorId: c1Id, nombre: c1Nombre } = await sembrarConductor('T008A')
    const { nombre: c2Nombre, nombreCompleto: c2NombreCompleto } = await sembrarConductor('T008B')
    const { adminId } = await empresaAdmin()
    const asignacionId = await asignarViaServiceRole(admin, {
      empresaId,
      vehiculoId,
      conductorId: c1Id,
      asignadoPor: adminId
    })

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Conductor Asignado' }).click()
    await expect(page.getByTestId('conductor-vigente-nombre')).toContainText(c1Nombre)

    await page.getByTestId('asignar-conductor-btn').click()
    await page.getByRole('combobox', { name: 'Conductor' }).fill(c2Nombre)
    await page.getByRole('option', { name: c2NombreCompleto, exact: true }).click()
    await page.getByTestId('confirmar-asignar-conductor-btn').click()

    // Sin diálogo de confirmación: el nuevo queda vigente de inmediato.
    await expect(page.getByTestId('conductor-vigente-nombre')).toContainText(c2Nombre)

    const { data: anterior } = await admin
      .from('asignaciones_conductor_vehiculo')
      .select('fecha_fin')
      .eq('id', asignacionId)
      .single()
    expect(anterior!.fecha_fin).not.toBeNull()
  })

  test('T009: asignar un conductor que ya tiene otro vehículo activo muestra advertencia informativa sin bloquear', async ({
    page
  }) => {
    const { admin, empresaId, vehiculoId: vehiculoOcupado, marca: marcaOcupada } =
      await sembrarVehiculo('T009A')
    const { vehiculoId: vehiculoNuevo } = await sembrarVehiculo('T009B')
    const { conductorId, nombre, nombreCompleto, adminId } = await sembrarConductor('T009')
    await asignarViaServiceRole(admin, {
      empresaId,
      vehiculoId: vehiculoOcupado,
      conductorId,
      asignadoPor: adminId
    })

    await page.goto(`/admin/vehiculos/${vehiculoNuevo}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Conductor Asignado' }).click()
    await page.getByTestId('asignar-conductor-btn').click()
    await page.getByRole('combobox', { name: 'Conductor' }).fill(nombre)
    await page.getByRole('option', { name: nombreCompleto, exact: true }).click()
    await page.getByTestId('confirmar-asignar-conductor-btn').click()

    await expect(page.getByTestId('advertencia-conductor-ocupado')).toContainText(marcaOcupada)
    await page.getByTestId('advertencia-continuar-btn').click()

    await expect(page.getByTestId('conductor-vigente-nombre')).toContainText(nombre)
  })

  test('T010: el historial de asignaciones del vehículo se muestra ordenado del más reciente al más antiguo', async ({
    page
  }) => {
    const { admin, empresaId, vehiculoId } = await sembrarVehiculo('T010')
    const { conductorId: c1Id, nombre: c1Nombre } = await sembrarConductor('T010A')
    const { adminId } = await empresaAdmin()
    const a1 = await asignarViaServiceRole(admin, {
      empresaId,
      vehiculoId,
      conductorId: c1Id,
      asignadoPor: adminId
    })
    await admin
      .from('asignaciones_conductor_vehiculo')
      .update({ fecha_fin: new Date().toISOString().slice(0, 10) })
      .eq('id', a1)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const { conductorId: c2Id, nombre: c2Nombre } = await sembrarConductor('T010B')
    const a2 = await asignarViaServiceRole(admin, {
      empresaId,
      vehiculoId,
      conductorId: c2Id,
      asignadoPor: adminId
    })

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Conductor Asignado' }).click()

    const tabla = page.getByTestId('historial-asignaciones-vehiculo-tabla')
    const items = tabla.locator('[data-testid^="historial-asignacion-item-"]')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toHaveAttribute('data-testid', `historial-asignacion-item-${a2}`)
    await expect(items.nth(0)).toContainText(c2Nombre)
    await expect(items.nth(0)).toContainText('Activo')
    await expect(items.nth(1)).toHaveAttribute('data-testid', `historial-asignacion-item-${a1}`)
    await expect(items.nth(1)).toContainText(c1Nombre)
  })

  test('T011: el selector de conductores excluye a los desactivados y al ya vigente para ese vehículo', async ({
    page
  }) => {
    const { admin, empresaId, vehiculoId } = await sembrarVehiculo('T011')
    const {
      conductorId: activoId,
      nombreCompleto: nombreCompletoActivo,
      adminId
    } = await sembrarConductor('T011A')
    const { conductorId: inactivoId, nombreCompleto: nombreCompletoInactivo } =
      await sembrarConductor('T011B')
    await admin.from('conductores').update({ activo: false, motivo_baja: 'Sembrado por T011' }).eq('id', inactivoId)
    await asignarViaServiceRole(admin, {
      empresaId,
      vehiculoId,
      conductorId: activoId,
      asignadoPor: adminId
    })

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Conductor Asignado' }).click()
    await page.getByTestId('asignar-conductor-btn').click()
    await page.getByRole('combobox', { name: 'Conductor' }).click()

    await expect(page.getByRole('option', { name: nombreCompletoActivo, exact: true })).toHaveCount(0)
    await expect(page.getByRole('option', { name: nombreCompletoInactivo, exact: true })).toHaveCount(0)
  })
})

test.describe('US2 — Administrador asigna o reemplaza vehículos desde el detalle del conductor', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T014: asignar un vehículo a un conductor sin vehículos activos lo deja vigente de inmediato', async ({
    page
  }) => {
    const { conductorId } = await sembrarConductor('T014')
    const { marca, nombreCompleto } = await sembrarVehiculo('T014')

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Vehículos Asignados' }).click()
    await page.getByTestId('asignar-vehiculo-btn').click()
    await page.getByRole('combobox', { name: 'Vehículo' }).fill(marca)
    await page.getByRole('option', { name: nombreCompleto, exact: true }).click()
    await page.getByTestId('confirmar-asignar-vehiculo-btn').click()

    // Esperar a que el selector se cierre (solo pasa en la rama de éxito de
    // onConfirmarAsignacion, tras `await cargar()`) antes de revisar el contenido de la
    // tarjeta — de lo contrario `toContainText` puede coincidir prematuramente con el texto
    // del propio autocomplete, todavía visible, antes de que la asignación real termine.
    await expect(page.getByTestId('confirmar-asignar-vehiculo-btn')).toHaveCount(0)
    await expect(page.getByTestId('vehiculos-asignados-card')).toContainText(marca)
  })

  test('T015: asignar un segundo vehículo (sin conductor previo) deja ambos vigentes en paralelo, sin bloqueo', async ({
    page
  }) => {
    const { admin, empresaId, conductorId, adminId } = await sembrarConductor('T015')
    const { vehiculoId: v1Id, marca: v1Marca } = await sembrarVehiculo('T015A')
    const { marca: v2Marca, nombreCompleto: v2NombreCompleto } = await sembrarVehiculo('T015B')
    await asignarViaServiceRole(admin, { empresaId, vehiculoId: v1Id, conductorId, asignadoPor: adminId })

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Vehículos Asignados' }).click()
    await expect(page.getByTestId('vehiculos-asignados-card')).toContainText(v1Marca)

    await page.getByTestId('asignar-vehiculo-btn').click()
    await page.getByRole('combobox', { name: 'Vehículo' }).fill(v2Marca)
    await page.getByRole('option', { name: v2NombreCompleto, exact: true }).click()
    await page.getByTestId('confirmar-asignar-vehiculo-btn').click()

    // Sin diálogo de confirmación fuerte: ambos quedan activos en paralelo. Esperar a que el
    // selector se cierre antes de revisar (mismo criterio que T014).
    await expect(page.getByTestId('confirmar-asignar-vehiculo-btn')).toHaveCount(0)
    await expect(page.getByTestId('vehiculos-asignados-card')).toContainText(v1Marca)
    await expect(page.getByTestId('vehiculos-asignados-card')).toContainText(v2Marca)
  })

  test('T016: asignar un vehículo que ya tiene activo a otro conductor exige confirmación explícita; cancelar no cambia nada, confirmar sí reemplaza', async ({
    page
  }) => {
    const { admin, empresaId, conductorId: c1Id, nombre: c1Nombre, adminId } =
      await sembrarConductor('T016A')
    const { conductorId: c2Id } = await sembrarConductor('T016B')
    const { vehiculoId, marca, nombreCompleto } = await sembrarVehiculo('T016')
    const asignacionId = await asignarViaServiceRole(admin, {
      empresaId,
      vehiculoId,
      conductorId: c1Id,
      asignadoPor: adminId
    })

    await page.goto(`/admin/conductores/${c2Id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Vehículos Asignados' }).click()
    await page.getByTestId('asignar-vehiculo-btn').click()
    await page.getByRole('combobox', { name: 'Vehículo' }).fill(marca)
    await page.getByRole('option', { name: nombreCompleto, exact: true }).click()
    await page.getByTestId('confirmar-asignar-vehiculo-btn').click()

    await expect(page.getByTestId('confirmacion-fuerte-mensaje')).toContainText(marca)
    await expect(page.getByTestId('confirmacion-fuerte-mensaje')).toContainText(c1Nombre)

    // Cancelar: nada cambia.
    await page.getByTestId('confirmacion-fuerte-cancelar-btn').click()
    const { data: sinCambios } = await admin
      .from('asignaciones_conductor_vehiculo')
      .select('fecha_fin')
      .eq('id', asignacionId)
      .single()
    expect(sinCambios!.fecha_fin).toBeNull()

    // Reintentar y confirmar: reemplaza. Esperar a que el selector se cierre antes de revisar
    // (mismo criterio que T014/T015 — evita una carrera con `toContainText` contra el texto
    // todavía visible del propio autocomplete).
    await page.getByTestId('confirmar-asignar-vehiculo-btn').click()
    await page.getByTestId('confirmacion-fuerte-confirmar-btn').click()
    await expect(page.getByTestId('confirmar-asignar-vehiculo-btn')).toHaveCount(0)
    await expect(page.getByTestId('vehiculos-asignados-card')).toContainText(marca)

    const { data: reemplazado } = await admin
      .from('asignaciones_conductor_vehiculo')
      .select('fecha_fin')
      .eq('id', asignacionId)
      .single()
    expect(reemplazado!.fecha_fin).not.toBeNull()
  })

  test('T017: el historial completo del conductor a través de todos los vehículos se muestra ordenado del más reciente al más antiguo', async ({
    page
  }) => {
    const { admin, empresaId, conductorId, adminId } = await sembrarConductor('T017')
    const { vehiculoId: v1Id, marca: v1Marca } = await sembrarVehiculo('T017A')
    const a1 = await asignarViaServiceRole(admin, { empresaId, vehiculoId: v1Id, conductorId, asignadoPor: adminId })
    await admin
      .from('asignaciones_conductor_vehiculo')
      .update({ fecha_fin: new Date().toISOString().slice(0, 10) })
      .eq('id', a1)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const { vehiculoId: v2Id, marca: v2Marca } = await sembrarVehiculo('T017B')
    const a2 = await asignarViaServiceRole(admin, { empresaId, vehiculoId: v2Id, conductorId, asignadoPor: adminId })

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Vehículos Asignados' }).click()

    const tabla = page.getByTestId('historial-asignaciones-conductor-tabla')
    const items = tabla.locator('[data-testid^="historial-asignacion-conductor-item-"]')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toHaveAttribute('data-testid', `historial-asignacion-conductor-item-${a2}`)
    await expect(items.nth(0)).toContainText(v2Marca)
    await expect(items.nth(0)).toContainText('Activo')
    await expect(items.nth(1)).toHaveAttribute('data-testid', `historial-asignacion-conductor-item-${a1}`)
    await expect(items.nth(1)).toContainText(v1Marca)
  })

  test('T018: el selector de vehículos excluye a los dados de baja y al ya vigente para ese conductor', async ({
    page
  }) => {
    const { admin, empresaId, conductorId, adminId } = await sembrarConductor('T018')
    const { vehiculoId: activoId, nombreCompleto: nombreCompletoActivo } = await sembrarVehiculo('T018A')
    const { vehiculoId: bajaId, nombreCompleto: nombreCompletoBaja } = await sembrarVehiculo('T018B')
    await admin.from('vehiculos').update({ baja: true, motivo_baja: 'Sembrado por T018' }).eq('id', bajaId)
    await asignarViaServiceRole(admin, { empresaId, vehiculoId: activoId, conductorId, asignadoPor: adminId })

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Vehículos Asignados' }).click()
    await page.getByTestId('asignar-vehiculo-btn').click()
    await page.getByRole('combobox', { name: 'Vehículo' }).click()

    await expect(page.getByRole('option', { name: nombreCompletoActivo, exact: true })).toHaveCount(0)
    await expect(page.getByRole('option', { name: nombreCompletoBaja, exact: true })).toHaveCount(0)
  })
})

test.describe('US3 — Finalizar una asignación sin reemplazarla', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T021: finalizar desde el vehículo sin elegir reemplazo lo deja sin conductor vigente, con la asignación cerrada en el historial', async ({
    page
  }) => {
    const { admin, empresaId, vehiculoId } = await sembrarVehiculo('T021')
    const { conductorId, nombre } = await sembrarConductor('T021')
    const { adminId } = await empresaAdmin()
    const asignacionId = await asignarViaServiceRole(admin, {
      empresaId,
      vehiculoId,
      conductorId,
      asignadoPor: adminId
    })

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Conductor Asignado' }).click()
    await expect(page.getByTestId('conductor-vigente-nombre')).toContainText(nombre)

    await page.getByTestId('finalizar-asignacion-btn').click()

    await expect(page.getByTestId('conductor-vigente-nombre')).toHaveCount(0)
    await expect(page.getByText('Sin conductor asignado.')).toBeVisible()

    const { data: cerrada } = await admin
      .from('asignaciones_conductor_vehiculo')
      .select('fecha_fin')
      .eq('id', asignacionId)
      .single()
    expect(cerrada!.fecha_fin).not.toBeNull()
  })

  test('T022: finalizar desde el conductor quita ese vehículo de su lista de activos, conservando el registro en su historial', async ({
    page
  }) => {
    const { admin, empresaId, conductorId, adminId } = await sembrarConductor('T022')
    const { vehiculoId, marca } = await sembrarVehiculo('T022')
    const asignacionId = await asignarViaServiceRole(admin, {
      empresaId,
      vehiculoId,
      conductorId,
      asignadoPor: adminId
    })

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Vehículos Asignados' }).click()
    await expect(page.getByTestId(`vehiculo-activo-item-${asignacionId}`)).toBeVisible()

    await page.getByTestId(`finalizar-asignacion-btn-${asignacionId}`).click()

    await expect(page.getByTestId(`vehiculo-activo-item-${asignacionId}`)).toHaveCount(0)
    await expect(page.getByTestId('vehiculos-asignados-card')).toContainText('Sin vehículos asignados')

    const tabla = page.getByTestId('historial-asignaciones-conductor-tabla')
    await expect(tabla.getByTestId(`historial-asignacion-conductor-item-${asignacionId}`)).toContainText(marca)
  })

  test('T023: un vehículo sin conductor activo muestra el indicador "Sin conductor" en el listado principal', async ({
    page
  }) => {
    const { vehiculoId, marca } = await sembrarVehiculo('T023')

    await page.goto('/admin/vehiculos')
    await esperarHidratacion(page)
    await page.getByLabel('Buscar por marca, modelo o placa', { exact: true }).fill(marca)

    await expect(page.getByTestId(`sin-conductor-badge-${vehiculoId}`)).toBeVisible()
  })
})

test.describe('Polish — mensaje específico al eliminar un vehículo con asignaciones (FR-012)', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T028: eliminar un vehículo con una asignación activa se rechaza con el mensaje específico, no el genérico', async ({
    page
  }) => {
    const { admin, empresaId, vehiculoId, marca } = await sembrarVehiculo('T028')
    const { conductorId, adminId } = await sembrarConductor('T028')
    await asignarViaServiceRole(admin, { empresaId, vehiculoId, conductorId, asignadoPor: adminId })

    await page.goto('/admin/vehiculos')
    await esperarHidratacion(page)
    await page.getByLabel('Buscar por marca, modelo o placa', { exact: true }).fill(marca)
    const fila = page.locator('[data-testid="vehiculos-tabla"] tbody tr', { hasText: marca })
    await expect(fila).toBeVisible()
    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('listado-error')).toContainText(/asignaciones/i)

    const { data: sigueExistiendo } = await admin
      .from('vehiculos')
      .select('id')
      .eq('id', vehiculoId)
      .maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })
})
