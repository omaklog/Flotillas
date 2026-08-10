import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { esperarHidratacion } from './helpers'

// El caso negativo de RLS (operario con solo 'ver' no puede escribir) y el aislamiento de
// Storage por empresa viven en tests/e2e/rls.spec.ts, no aquí — mismo criterio que Vehículos.

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

/**
 * Localiza una fila filtrando primero por el buscador (deja el filtro activo) — mismo criterio
 * que Vehículos/Catálogos Base: el catálogo de `Empresa E2E` es compartido entre corridas y
 * `TablaCatalogo.vue` pagina de a 20.
 */
async function buscarFila(page: Page, texto: string): Promise<Locator> {
  await page.getByLabel('Buscar por nombre o apellidos', { exact: true }).fill(texto)
  const fila = page.locator('[data-testid="conductores-tabla"] tbody tr', { hasText: texto })
  await expect(fila).toBeVisible({ timeout: 10_000 })
  return fila
}

function pdfDePrueba(nombre = 'licencia.pdf') {
  return { name: nombre, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 contenido de prueba') }
}

function fotoDePrueba(nombre = 'foto.jpg') {
  return { name: nombre, mimeType: 'image/jpeg', buffer: Buffer.from('contenido de foto de prueba') }
}

function fechaEnDias(dias: number): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString().slice(0, 10)
}

async function empresaAdmin() {
  const admin = adminSupabaseClient()
  const { data: perfilAdmin } = await admin
    .from('usuarios')
    .select('id, empresa_id, nombre')
    .eq('correo', 'admin-e2e@flotillas.local')
    .single()
  return {
    admin,
    empresaId: perfilAdmin!.empresa_id!,
    adminId: perfilAdmin!.id,
    adminNombre: perfilAdmin!.nombre
  }
}

/** Sube un PDF de prueba directo a Storage con `service_role` (bypassea RLS) y registra su fila
 * en `archivos`, simulando una versión de licencia ya existente antes de que corra el test. */
async function sembrarVersionLicencia(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: { empresaId: string; conductorId: string; subidoPor: string; nombreArchivo: string }
) {
  const ruta = `licencia/${opciones.empresaId}/${opciones.conductorId}/${opciones.nombreArchivo}`
  const { error: errSubida } = await admin.storage
    .from('documentos')
    .upload(ruta, Buffer.from(`%PDF-1.4 versión ${opciones.nombreArchivo}`), {
      contentType: 'application/pdf'
    })
  if (errSubida) throw errSubida

  const { data: archivo } = await admin
    .from('archivos')
    .insert({
      empresa_id: opciones.empresaId,
      tipo: 'licencia',
      storage_path: ruta,
      entidad_tipo: 'conductor',
      entidad_id: opciones.conductorId,
      subido_por: opciones.subidoPor
    })
    .select('id')
    .single()
  return { id: archivo!.id, storagePath: ruta }
}

/** Igual que `sembrarVersionLicencia`, pero `tipo: 'foto_conductor'` — la foto NO tiene
 * historial, así que quien llama a esto además debe actualizar `conductores.foto_archivo_id` si
 * quiere que sea "la vigente" (mismo criterio que `sembrarVersionFoto` de vehiculos.spec.ts). */
async function sembrarVersionFoto(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: { empresaId: string; conductorId: string; subidoPor: string; nombreArchivo: string }
) {
  const ruta = `foto_conductor/${opciones.empresaId}/${opciones.conductorId}/${opciones.nombreArchivo}`
  const { error: errSubida } = await admin.storage
    .from('documentos')
    .upload(ruta, Buffer.from(`foto de prueba ${opciones.nombreArchivo}`), {
      contentType: 'image/jpeg'
    })
  if (errSubida) throw errSubida

  const { data: archivo } = await admin
    .from('archivos')
    .insert({
      empresa_id: opciones.empresaId,
      tipo: 'foto_conductor',
      storage_path: ruta,
      entidad_tipo: 'conductor',
      entidad_id: opciones.conductorId,
      subido_por: opciones.subidoPor
    })
    .select('id')
    .single()
  return { id: archivo!.id, storagePath: ruta }
}

test.describe('US1 — Administrador da de alta un conductor', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T012: alta sin licencia crea el conductor con los campos obligatorios', async ({ page }) => {
    const nombre = `Juan T012 ${Date.now()}`
    const numeroLicencia = `T012-${Date.now()}`

    await page.goto('/admin/conductores/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByLabel('Apellidos', { exact: true }).fill('Pérez')
    await page.getByLabel('Número de licencia', { exact: true }).fill(numeroLicencia)
    await page.getByRole('combobox', { name: 'Tipo de licencia' }).click()
    await page.getByRole('option', { name: 'Federal', exact: true }).click()
    await page.getByLabel('Fecha de vencimiento', { exact: true }).fill('2030-01-01')
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === '/admin/conductores', { timeout: 10_000 })
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await expect(fila).toContainText(numeroLicencia)
  })

  test('T013: alta con licencia adjunta crea el conductor con la licencia vigente', async ({
    page
  }) => {
    const nombre = `María T013 ${Date.now()}`
    const numeroLicencia = `T013-${Date.now()}`

    await page.goto('/admin/conductores/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByLabel('Apellidos', { exact: true }).fill('Gómez')
    await page.getByLabel('Número de licencia', { exact: true }).fill(numeroLicencia)
    await page.getByRole('combobox', { name: 'Tipo de licencia' }).click()
    await page.getByRole('option', { name: 'Local', exact: true }).click()
    await page.getByLabel('Fecha de vencimiento', { exact: true }).fill('2030-01-01')
    await page.getByTestId('licencia-input').setInputFiles(pdfDePrueba())
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === '/admin/conductores', { timeout: 10_000 })
    await esperarHidratacion(page)

    const admin = adminSupabaseClient()
    const { data: conductor } = await admin
      .from('conductores')
      .select('id, licencia_archivo_id')
      .eq('numero_licencia', numeroLicencia)
      .single()
    expect(conductor!.licencia_archivo_id).not.toBeNull()
  })

  test('T014: alta rechazada por número de licencia duplicado dentro de la misma empresa', async ({
    page
  }) => {
    const { admin, empresaId } = await empresaAdmin()
    const numeroExistente = `T014-${Date.now()}`
    await admin.from('conductores').insert({
      empresa_id: empresaId,
      nombre: 'Existente T014',
      apellidos: 'X',
      numero_licencia: numeroExistente,
      tipo_licencia: 'federal',
      fecha_vencimiento_licencia: '2030-01-01'
    })

    await page.goto('/admin/conductores/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Nombre', { exact: true }).fill('Duplicado T014')
    await page.getByLabel('Apellidos', { exact: true }).fill('Y')
    await page.getByLabel('Número de licencia', { exact: true }).fill(numeroExistente)
    await page.getByRole('combobox', { name: 'Tipo de licencia' }).click()
    await page.getByRole('option', { name: 'Federal', exact: true }).click()
    await page.getByLabel('Fecha de vencimiento', { exact: true }).fill('2030-01-01')
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText(/ya existe un conductor con ese número de licencia/i)).toBeVisible()
    await expect(page.getByTestId('submit-btn')).toBeVisible()
  })

  test('T015: un archivo con tipo o tamaño inválido se rechaza antes de subirse', async ({ page }) => {
    await page.goto('/admin/conductores/nuevo')
    await esperarHidratacion(page)
    await page.getByTestId('licencia-input').setInputFiles({
      name: 'nota.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('no es una licencia')
    })

    await expect(page.getByText(/el archivo debe ser pdf, jpg o png/i)).toBeVisible()
    await expect(page.getByLabel('Nombre', { exact: true })).toBeEditable()
  })

  test('T016: si la subida de la licencia falla, el conductor queda creado igual (FR-005)', async ({
    page
  }) => {
    const nombre = `Luis T016 ${Date.now()}`
    const numeroLicencia = `T016-${Date.now()}`

    await page.route('**/storage/v1/object/documentos/**', (route) =>
      route.fulfill({ status: 500, body: 'Fallo simulado de subida (T016)' })
    )

    await page.goto('/admin/conductores/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByLabel('Apellidos', { exact: true }).fill('Ramírez')
    await page.getByLabel('Número de licencia', { exact: true }).fill(numeroLicencia)
    await page.getByRole('combobox', { name: 'Tipo de licencia' }).click()
    await page.getByRole('option', { name: 'Federal', exact: true }).click()
    await page.getByLabel('Fecha de vencimiento', { exact: true }).fill('2030-01-01')
    await page.getByTestId('licencia-input').setInputFiles(pdfDePrueba())
    await page.getByTestId('submit-btn').click()

    await expect
      .poll(
        async () => {
          const admin = adminSupabaseClient()
          const { data } = await admin
            .from('conductores')
            .select('id')
            .eq('numero_licencia', numeroLicencia)
            .maybeSingle()
          return data?.id ?? null
        },
        { timeout: 10_000 }
      )
      .not.toBeNull()

    const admin = adminSupabaseClient()
    const { data: conductor } = await admin
      .from('conductores')
      .select('licencia_archivo_id')
      .eq('numero_licencia', numeroLicencia)
      .single()
    expect(conductor!.licencia_archivo_id).toBeNull()
  })
})

test.describe('US2 — Administrador busca y consulta el listado de conductores', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T019: el listado muestra conductores activos y el buscador filtra por nombre y apellidos', async ({
    page
  }) => {
    const { admin, empresaId } = await empresaAdmin()
    const nombre = `Pedro T019 ${Date.now()}`
    const numeroLicencia = `T019-${Date.now()}`
    await admin.from('conductores').insert({
      empresa_id: empresaId,
      nombre,
      apellidos: 'Torres',
      numero_licencia: numeroLicencia,
      tipo_licencia: 'federal',
      fecha_vencimiento_licencia: '2030-01-01'
    })

    await page.goto('/admin/conductores')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await expect(fila).toContainText(numeroLicencia)

    // El buscador también filtra por apellidos, no solo nombre.
    await page.getByLabel('Buscar por nombre o apellidos', { exact: true }).fill('Torres')
    await expect(fila).toBeVisible()
  })

  test('T020: un conductor inactivo no aparece por defecto; el toggle lo incluye', async ({ page }) => {
    const { admin, empresaId } = await empresaAdmin()
    const nombre = `Ana T020 ${Date.now()}`
    const numeroLicencia = `T020-${Date.now()}`
    await admin.from('conductores').insert({
      empresa_id: empresaId,
      nombre,
      apellidos: 'Ruiz',
      numero_licencia: numeroLicencia,
      tipo_licencia: 'local',
      fecha_vencimiento_licencia: '2030-01-01',
      activo: false,
      motivo_baja: 'Sembrado por T020'
    })

    await page.goto('/admin/conductores')
    await esperarHidratacion(page)
    await page.getByLabel('Buscar por nombre o apellidos', { exact: true }).fill(nombre)
    await expect(
      page.locator('[data-testid="conductores-tabla"] tbody tr', { hasText: nombre })
    ).toHaveCount(0)

    await page.getByLabel('Mostrar inactivos', { exact: true }).click()
    await expect(
      page.locator('[data-testid="conductores-tabla"] tbody tr', { hasText: nombre })
    ).toBeVisible()
  })

  test('T021: el badge de vigencia de licencia refleja vencida, por vencer y vigente (umbral 60 días); un conductor inactivo con licencia vencida sigue mostrando "vencida"', async ({
    page
  }) => {
    const { admin, empresaId } = await empresaAdmin()
    const sufijo = Date.now()
    const vencida = { nombre: `Uno T021 ${sufijo}`, numeroLicencia: `T021V-${sufijo}` }
    const porVencer = { nombre: `Dos T021 ${sufijo}`, numeroLicencia: `T021P-${sufijo}` }
    const vigente = { nombre: `Tres T021 ${sufijo}`, numeroLicencia: `T021G-${sufijo}` }
    const inactivaVencida = { nombre: `Cuatro T021 ${sufijo}`, numeroLicencia: `T021I-${sufijo}` }

    // Dos inserts separados, no uno solo con las 4 filas: si un `insert([...])` mezcla objetos
    // con distintas claves (aquí, `activo`/`motivo_baja` solo en la 4ª fila), PostgREST usa la
    // unión de columnas de todas las filas e inserta `NULL` explícito (no el default de la
    // columna) en las filas que no la especifican — rompe el `NOT NULL` de `activo` en las 3
    // primeras. Bug real encontrado al escribir este test, no una suposición.
    await admin.from('conductores').insert([
      {
        empresa_id: empresaId,
        nombre: vencida.nombre,
        apellidos: 'X',
        numero_licencia: vencida.numeroLicencia,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: fechaEnDias(-10)
      },
      {
        empresa_id: empresaId,
        nombre: porVencer.nombre,
        apellidos: 'X',
        numero_licencia: porVencer.numeroLicencia,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: fechaEnDias(30)
      },
      {
        empresa_id: empresaId,
        nombre: vigente.nombre,
        apellidos: 'X',
        numero_licencia: vigente.numeroLicencia,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: fechaEnDias(120)
      }
    ])
    await admin.from('conductores').insert({
      empresa_id: empresaId,
      nombre: inactivaVencida.nombre,
      apellidos: 'X',
      numero_licencia: inactivaVencida.numeroLicencia,
      tipo_licencia: 'federal',
      fecha_vencimiento_licencia: fechaEnDias(-5),
      activo: false,
      motivo_baja: 'Sembrado por T021'
    })

    await page.goto('/admin/conductores')
    await esperarHidratacion(page)

    const filaVencida = await buscarFila(page, vencida.nombre)
    await expect(filaVencida.getByText(/vencida/i)).toBeVisible()

    const filaPorVencer = await buscarFila(page, porVencer.nombre)
    await expect(filaPorVencer.getByText(/por vencer/i)).toBeVisible()

    const filaVigente = await buscarFila(page, vigente.nombre)
    await expect(filaVigente.getByText(/vigente/i)).toBeVisible()

    await page.getByLabel('Mostrar inactivos', { exact: true }).click()
    const filaInactivaVencida = await buscarFila(page, inactivaVencida.nombre)
    await expect(filaInactivaVencida.getByText(/vencida/i)).toBeVisible()
  })
})

test.describe('US3 — Administrador consulta el detalle de un conductor sin entrar a edición', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function sembrarConductor(prefijo: string) {
    const { admin, empresaId, adminId } = await empresaAdmin()
    const sufijo = Date.now()
    const nombre = `Nombre ${prefijo} ${sufijo}`
    const { data: conductor } = await admin
      .from('conductores')
      .insert({
        empresa_id: empresaId,
        nombre,
        apellidos: `Apellido ${prefijo}`,
        numero_licencia: `${prefijo}-${sufijo}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()
    return { admin, empresaId, adminId, conductorId: conductor!.id as string, nombre }
  }

  test('T023: abrir un conductor desde el listado muestra su detalle en modo solo lectura', async ({
    page
  }) => {
    const { conductorId, nombre } = await sembrarConductor('T023')

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)

    await expect(page.getByTestId('tarjeta-datos-conductor').getByText(nombre)).toBeVisible()
    await expect(page.getByTestId('editar-btn')).toBeVisible()
    // Modo solo lectura: ni el botón de envío del formulario ni sus campos editables existen.
    await expect(page.getByTestId('submit-btn')).toHaveCount(0)
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveCount(0)
  })
})

test.describe('US4 — Administrador edita un conductor y gestiona el historial de su licencia', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function sembrarConductor(prefijo: string) {
    const { admin, empresaId, adminId } = await empresaAdmin()
    const sufijo = Date.now()
    const nombre = `Nombre ${prefijo} ${sufijo}`
    const { data: conductor } = await admin
      .from('conductores')
      .insert({
        empresa_id: empresaId,
        nombre,
        apellidos: `Apellido ${prefijo}`,
        numero_licencia: `${prefijo}-${sufijo}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()
    return { admin, empresaId, adminId, conductorId: conductor!.id as string, nombre }
  }

  test('T025: editar campos de un conductor existente guarda los cambios', async ({ page }) => {
    const { conductorId } = await sembrarConductor('T025')
    const nuevoApellido = `Apellido Actualizado ${Date.now()}`

    await page.goto(`/admin/conductores/${conductorId}/editar`)
    await esperarHidratacion(page)
    await page.getByLabel('Apellidos', { exact: true }).fill(nuevoApellido)
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-datos-conductor').getByText(nuevoApellido)).toBeVisible()
  })

  test('T026: la acción "Editar" desde el detalle navega al formulario con los datos precargados', async ({
    page
  }) => {
    const { conductorId, nombre } = await sembrarConductor('T026')

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByTestId('editar-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/conductores/${conductorId}/editar`)
    await esperarHidratacion(page)
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(nombre)
    await expect(page.getByTestId('submit-btn')).toBeVisible()
  })

  test('T027: guardar cambios en el formulario regresa a la vista de detalle mostrando los datos actualizados', async ({
    page
  }) => {
    const { conductorId } = await sembrarConductor('T027')
    const nuevoApellido = `Apellido Actualizado ${Date.now()}`

    await page.goto(`/admin/conductores/${conductorId}/editar`)
    await esperarHidratacion(page)
    await page.getByLabel('Apellidos', { exact: true }).fill(nuevoApellido)
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-datos-conductor').getByText(nuevoApellido)).toBeVisible()
    await expect(page.getByTestId('submit-btn')).toHaveCount(0)
  })

  test('T028: reemplazar el archivo de licencia deja el nuevo como vigente sin borrar el anterior', async ({
    page
  }) => {
    const { admin, empresaId, adminId, conductorId } = await sembrarConductor('T028')
    const v1 = await sembrarVersionLicencia(admin, {
      empresaId,
      conductorId,
      subidoPor: adminId,
      nombreArchivo: 'seed-v1.pdf'
    })
    await admin.from('conductores').update({ licencia_archivo_id: v1.id }).eq('id', conductorId)

    await page.goto(`/admin/conductores/${conductorId}/editar`)
    await esperarHidratacion(page)
    await page.getByTestId('licencia-input').setInputFiles(pdfDePrueba('seed-v2.pdf'))
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('conductores')
            .select('licencia_archivo_id')
            .eq('id', conductorId)
            .single()
          return data?.licencia_archivo_id
        },
        { timeout: 10_000 }
      )
      .not.toBe(v1.id)

    const { data: archivoV1Aun } = await admin
      .from('archivos')
      .select('id')
      .eq('id', v1.id)
      .maybeSingle()
    expect(archivoV1Aun).not.toBeNull()
  })

  test('T029: el historial de versiones muestra ambas versiones ordenadas por fecha descendente, con quién subió, y solo la más reciente marcada "Vigente"', async ({
    page
  }) => {
    const { admin, empresaId, adminId, conductorId } = await sembrarConductor('T029')
    const v1 = await sembrarVersionLicencia(admin, {
      empresaId,
      conductorId,
      subidoPor: adminId,
      nombreArchivo: 'seed-v1.pdf'
    })
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const v2 = await sembrarVersionLicencia(admin, {
      empresaId,
      conductorId,
      subidoPor: adminId,
      nombreArchivo: 'seed-v2.pdf'
    })
    await admin.from('conductores').update({ licencia_archivo_id: v2.id }).eq('id', conductorId)

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Historial de Licencia' }).click()

    const tabla = page.getByTestId('historial-licencia-tabla')
    await expect(tabla).toBeVisible()
    const items = tabla.locator('[data-testid^="historial-licencia-item-"]')
    await expect(items).toHaveCount(2)

    await expect(items.nth(0)).toHaveAttribute('data-testid', `historial-licencia-item-${v2.id}`)
    await expect(items.nth(1)).toHaveAttribute('data-testid', `historial-licencia-item-${v1.id}`)

    await expect(page.getByTestId(`estado-${v2.id}`)).toHaveText('Vigente')
    await expect(page.getByTestId(`estado-${v1.id}`)).toHaveText('Anterior')

    const { adminNombre } = await empresaAdmin()
    await expect(items.nth(0)).toContainText(adminNombre)
  })

  test('T030: "Ver" dispara la request de la URL firmada sin el parámetro download= (a diferencia de "Descargar")', async ({
    page
  }) => {
    const { admin, empresaId, adminId, conductorId } = await sembrarConductor('T030')
    const v1 = await sembrarVersionLicencia(admin, {
      empresaId,
      conductorId,
      subidoPor: adminId,
      nombreArchivo: 'seed-ver.pdf'
    })
    await admin.from('conductores').update({ licencia_archivo_id: v1.id }).eq('id', conductorId)

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Historial de Licencia' }).click()
    await expect(page.getByTestId('historial-licencia-tabla')).toBeVisible()

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes(v1.storagePath)),
      page.getByTestId(`ver-btn-${v1.id}`).click()
    ])
    expect(request.url()).not.toContain('download=')
  })

  test('T031: "Subir Nueva Licencia" desde el historial agrega una versión y la marca como Vigente', async ({
    page
  }) => {
    const { admin, empresaId, adminId, conductorId } = await sembrarConductor('T031')
    const v1 = await sembrarVersionLicencia(admin, {
      empresaId,
      conductorId,
      subidoPor: adminId,
      nombreArchivo: 'seed-t031.pdf'
    })
    await admin.from('conductores').update({ licencia_archivo_id: v1.id }).eq('id', conductorId)

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Historial de Licencia' }).click()
    await expect(page.getByTestId('historial-licencia-tabla')).toBeVisible()

    await page.getByTestId('subir-licencia-btn').click()
    await page.getByTestId('subir-licencia-input').setInputFiles(pdfDePrueba('nueva-version.pdf'))
    await page.getByTestId('confirmar-subida-btn').click()

    const tabla = page.getByTestId('historial-licencia-tabla')
    const items = tabla.locator('[data-testid^="historial-licencia-item-"]')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText('Vigente')
    await expect(page.getByTestId(`estado-${v1.id}`)).toHaveText('Anterior')
  })
})

test.describe('US5 — Administrador desactiva y reactiva un conductor', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function sembrarConductor(prefijo: string) {
    const { admin, empresaId } = await empresaAdmin()
    const sufijo = Date.now()
    const nombre = `Nombre ${prefijo} ${sufijo}`
    const { data: conductor } = await admin
      .from('conductores')
      .insert({
        empresa_id: empresaId,
        nombre,
        apellidos: `Apellido ${prefijo}`,
        numero_licencia: `${prefijo}-${sufijo}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()
    return { admin, conductorId: conductor!.id as string, nombre }
  }

  test('T035: intentar confirmar "Desactivar" sin capturar un motivo lo bloquea', async ({ page }) => {
    const { admin, conductorId } = await sembrarConductor('T035')

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByTestId('desactivar-btn').click()
    await expect(page.getByTestId('dialogo-desactivar-motivo')).toBeVisible()
    await expect(page.getByTestId('dialogo-desactivar-confirmar')).toBeDisabled()
    await page.getByTestId('dialogo-desactivar-confirmar').click({ force: true })

    await expect(page.getByTestId('dialogo-desactivar-motivo')).toBeVisible()
    const { data: conductor } = await admin
      .from('conductores')
      .select('activo')
      .eq('id', conductorId)
      .single()
    expect(conductor!.activo).toBe(true)
  })

  test('T036: desactivar con un motivo válido oculta el conductor del listado por defecto', async ({
    page
  }) => {
    const { conductorId, nombre } = await sembrarConductor('T036')

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByTestId('desactivar-btn').click()
    await page
      .getByLabel('Motivo de la desactivación', { exact: true })
      .fill('Ya no forma parte de la flotilla activa.')
    await page.getByTestId('dialogo-desactivar-confirmar').click()

    await expect(page.getByTestId('estado-inactivo-chip')).toBeVisible()

    await page.goto('/admin/conductores')
    await esperarHidratacion(page)
    await page.getByLabel('Buscar por nombre o apellidos', { exact: true }).fill(nombre)
    await expect(
      page.locator('[data-testid="conductores-tabla"] tbody tr', { hasText: nombre })
    ).toHaveCount(0)
  })

  test('T037: reactivar un conductor desactivado lo regresa al listado por defecto', async ({
    page
  }) => {
    const { admin, conductorId, nombre } = await sembrarConductor('T037')
    await admin
      .from('conductores')
      .update({ activo: false, motivo_baja: 'Sembrado por T037' })
      .eq('id', conductorId)

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('desactivar-btn')).toHaveCount(0)
    await page.getByTestId('reactivar-btn').click()
    await expect(page.getByTestId('reactivar-btn')).toHaveCount(0)
    await expect(page.getByTestId('desactivar-btn')).toBeVisible()

    await page.goto('/admin/conductores')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await expect(fila).toBeVisible()
  })

  test('T038: desactivar y reactivar generan filas en auditoría con accion desactivar/reactivar, no editar', async ({
    page
  }) => {
    const { admin, conductorId } = await sembrarConductor('T038')

    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await page.getByTestId('desactivar-btn').click()
    await page.getByLabel('Motivo de la desactivación', { exact: true }).fill('Motivo de prueba T038.')
    await page.getByTestId('dialogo-desactivar-confirmar').click()
    await expect(page.getByTestId('estado-inactivo-chip')).toBeVisible()

    await page.getByTestId('reactivar-btn').click()
    await expect(page.getByTestId('desactivar-btn')).toBeVisible()

    const { data: auditoria } = await admin
      .from('auditoria')
      .select('accion')
      .eq('entidad', 'conductores')
      .eq('entidad_id', conductorId)
      .order('created_at', { ascending: true })

    const acciones = auditoria!.map((fila) => fila.accion)
    expect(acciones).toContain('desactivar')
    expect(acciones).toContain('reactivar')
    expect(acciones).not.toContain('editar')
  })
})

test.describe('US6 — Administrador elimina definitivamente un conductor sin dependientes', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function sembrarConductor(prefijo: string) {
    const { admin, empresaId, adminId } = await empresaAdmin()
    const sufijo = Date.now()
    const nombre = `Nombre ${prefijo} ${sufijo}`
    const { data: conductor } = await admin
      .from('conductores')
      .insert({
        empresa_id: empresaId,
        nombre,
        apellidos: `Apellido ${prefijo}`,
        numero_licencia: `${prefijo}-${sufijo}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()
    return { admin, empresaId, adminId, conductorId: conductor!.id as string, nombre }
  }

  async function eliminarDesdeListado(page: Page, nombre: string) {
    await page.goto('/admin/conductores')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, nombre)
    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()
  }

  test('T041: eliminar un conductor sin dependientes pero con una licencia adjunta borra también su historial de archivos (FR-016a)', async ({
    page
  }) => {
    const { admin, empresaId, adminId, conductorId, nombre } = await sembrarConductor('T041')
    const version = await sembrarVersionLicencia(admin, {
      empresaId,
      conductorId,
      subidoPor: adminId,
      nombreArchivo: 'seed-t041.pdf'
    })
    await admin.from('conductores').update({ licencia_archivo_id: version.id }).eq('id', conductorId)

    await eliminarDesdeListado(page, nombre)

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('conductores')
            .select('id')
            .eq('id', conductorId)
            .maybeSingle()
          return data
        },
        { timeout: 10_000 }
      )
      .toBeNull()

    const { data: archivoAun } = await admin
      .from('archivos')
      .select('id')
      .eq('id', version.id)
      .maybeSingle()
    expect(archivoAun).toBeNull()

    const carpeta = `licencia/${empresaId}/${conductorId}`
    const { data: objetosRestantes } = await admin.storage.from('documentos').list(carpeta)
    expect(objetosRestantes ?? []).toHaveLength(0)
  })

  test('T042: eliminar un conductor con una asignación sembrada directo vía service_role se rechaza y no borra nada', async ({
    page
  }) => {
    const { admin, empresaId, adminId, conductorId, nombre } = await sembrarConductor('T042')
    const sufijo = Date.now()
    const { data: tipo } = await admin
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('clave', 'ligero')
      .single()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Volvo T042 ${sufijo}`,
        modelo: 'FH16',
        placa: `T042-${sufijo}`,
        tipo_vehiculo_id: tipo!.id
      })
      .select('id')
      .single()
    await admin.from('asignaciones_conductor_vehiculo').insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculo!.id,
      conductor_id: conductorId,
      asignado_por: adminId
    })

    await eliminarDesdeListado(page, nombre)

    await expect(page.getByTestId('listado-error')).toContainText(/asignaciones/i)

    const { data: sigueExistiendo } = await admin
      .from('conductores')
      .select('id')
      .eq('id', conductorId)
      .maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })

  test('T043: eliminar un conductor sin ningún dato adjunto procede sin error', async ({ page }) => {
    const { admin, conductorId, nombre } = await sembrarConductor('T043')

    await eliminarDesdeListado(page, nombre)

    await expect(page.getByTestId('listado-error')).toHaveCount(0)
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('conductores')
            .select('id')
            .eq('id', conductorId)
            .maybeSingle()
          return data
        },
        { timeout: 10_000 }
      )
      .toBeNull()
  })
})

test.describe('Foto del Conductor (FR-001 a FR-007)', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function sembrarConductor(prefijo: string) {
    const { admin, empresaId, adminId } = await empresaAdmin()
    const sufijo = Date.now()
    const nombre = `Nombre ${prefijo} ${sufijo}`
    const { data: conductor } = await admin
      .from('conductores')
      .insert({
        empresa_id: empresaId,
        nombre,
        apellidos: `Apellido ${prefijo}`,
        numero_licencia: `${prefijo}-${sufijo}`,
        tipo_licencia: 'federal',
        fecha_vencimiento_licencia: '2030-01-01'
      })
      .select('id')
      .single()
    return { admin, empresaId, adminId, conductorId: conductor!.id as string, nombre }
  }

  test('T009: adjuntar una foto durante el alta la deja visible en el detalle del conductor', async ({
    page
  }) => {
    const nombre = `Foto T009 ${Date.now()}`
    const numeroLicencia = `T009-${Date.now()}`

    await page.goto('/admin/conductores/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByLabel('Apellidos', { exact: true }).fill('Foto')
    await page.getByLabel('Número de licencia', { exact: true }).fill(numeroLicencia)
    await page.getByRole('combobox', { name: 'Tipo de licencia' }).click()
    await page.getByRole('option', { name: 'Federal', exact: true }).click()
    await page.getByLabel('Fecha de vencimiento', { exact: true }).fill('2030-01-01')
    await page.getByTestId('foto-input').setInputFiles(fotoDePrueba())
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === '/admin/conductores', { timeout: 10_000 })

    const admin = adminSupabaseClient()
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('conductores')
            .select('foto_archivo_id')
            .eq('numero_licencia', numeroLicencia)
            .single()
          return data?.foto_archivo_id ?? null
        },
        { timeout: 10_000 }
      )
      .not.toBeNull()

    const { data: conductor } = await admin
      .from('conductores')
      .select('id, foto_archivo_id')
      .eq('numero_licencia', numeroLicencia)
      .single()
    expect(conductor!.foto_archivo_id).not.toBeNull()

    await page.goto(`/admin/conductores/${conductor!.id}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('foto-conductor')).toBeVisible()
  })

  test('T010: adjuntar una foto después, editando un conductor sin foto previa, la deja visible en el detalle', async ({
    page
  }) => {
    const { conductorId } = await sembrarConductor('T010')

    // Convergence T025 (FR-006): el estado vacío vive en el detalle de solo lectura, no en el
    // formulario de edición — la aserción original comprobaba el testid en la página equivocada
    // (`/editar` nunca lo renderiza), así que siempre pasaba sin verificar nada.
    await page.goto(`/admin/conductores/${conductorId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('foto-conductor-vacia')).toBeVisible()
    await expect(page.getByTestId('foto-conductor')).toHaveCount(0)

    await page.goto(`/admin/conductores/${conductorId}/editar`)
    await esperarHidratacion(page)
    await page.getByTestId('foto-input').setInputFiles(fotoDePrueba())
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/conductores/${conductorId}`, {
      timeout: 10_000
    })
    await esperarHidratacion(page)
    await expect(page.getByTestId('foto-conductor')).toBeVisible()
  })

  test('T011: reemplazar la foto de un conductor deja la nueva visible y elimina la anterior, sin historial', async ({
    page
  }) => {
    const { admin, conductorId, adminId, empresaId } = await sembrarConductor('T011')
    const v1 = await sembrarVersionFoto(admin, {
      empresaId,
      conductorId,
      subidoPor: adminId,
      nombreArchivo: 'seed-v1.jpg'
    })
    await admin.from('conductores').update({ foto_archivo_id: v1.id }).eq('id', conductorId)

    await page.goto(`/admin/conductores/${conductorId}/editar`)
    await esperarHidratacion(page)
    await page.getByTestId('foto-input').setInputFiles(fotoDePrueba('reemplazo.jpg'))
    await page.getByTestId('submit-btn').click()

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('conductores')
            .select('foto_archivo_id')
            .eq('id', conductorId)
            .single()
          return data?.foto_archivo_id
        },
        { timeout: 10_000 }
      )
      .not.toBe(v1.id)

    const { data: archivoV1Aun } = await admin
      .from('archivos')
      .select('id')
      .eq('id', v1.id)
      .maybeSingle()
    expect(archivoV1Aun).toBeNull()

    // Convergence T026 (SC-002 "sin objetos huérfanos en Storage"): la fila de `archivos` ya se
    // confirma arriba, pero eso no prueba que el objeto en Storage también se haya borrado —
    // `remove()` puede fallar en silencio sin que el resto del flujo lo note.
    const carpeta = `foto_conductor/${empresaId}/${conductorId}`
    const { data: objetosRestantes } = await admin.storage.from('documentos').list(carpeta)
    expect((objetosRestantes ?? []).map((o) => o.name)).not.toContain('seed-v1.jpg')
  })

  test('T012: un archivo de foto con tipo o tamaño inválido se rechaza antes de subirse', async ({
    page
  }) => {
    await page.goto('/admin/conductores/nuevo')
    await esperarHidratacion(page)
    await page.getByTestId('foto-input').setInputFiles(pdfDePrueba('no-es-foto.pdf'))

    await expect(page.getByText(/la foto debe ser jpg o png/i)).toBeVisible()
    await expect(page.getByLabel('Nombre', { exact: true })).toBeEditable()
  })

  test('T013: si la subida de la foto falla durante el alta, el conductor queda creado igual, sin foto (FR-005)', async ({
    page
  }) => {
    const nombre = `Foto T013 ${Date.now()}`
    const numeroLicencia = `T013-${Date.now()}`

    await page.route('**/storage/v1/object/documentos/foto_conductor/**', (route) =>
      route.fulfill({ status: 500, body: 'Fallo simulado de subida de foto (T013)' })
    )

    await page.goto('/admin/conductores/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByLabel('Apellidos', { exact: true }).fill('Foto')
    await page.getByLabel('Número de licencia', { exact: true }).fill(numeroLicencia)
    await page.getByRole('combobox', { name: 'Tipo de licencia' }).click()
    await page.getByRole('option', { name: 'Federal', exact: true }).click()
    await page.getByLabel('Fecha de vencimiento', { exact: true }).fill('2030-01-01')
    await page.getByTestId('foto-input').setInputFiles(fotoDePrueba())
    await page.getByTestId('submit-btn').click()

    await expect
      .poll(
        async () => {
          const admin = adminSupabaseClient()
          const { data } = await admin
            .from('conductores')
            .select('id')
            .eq('numero_licencia', numeroLicencia)
            .maybeSingle()
          return data?.id ?? null
        },
        { timeout: 10_000 }
      )
      .not.toBeNull()

    const admin = adminSupabaseClient()
    const { data: conductor } = await admin
      .from('conductores')
      .select('foto_archivo_id')
      .eq('numero_licencia', numeroLicencia)
      .single()
    expect(conductor!.foto_archivo_id).toBeNull()
  })

  test('T014: si la subida de una foto nueva falla durante un reemplazo, la foto anterior sigue siendo la vigente (FR-004)', async ({
    page
  }) => {
    const { admin, conductorId, adminId, empresaId } = await sembrarConductor('T014')
    const v1 = await sembrarVersionFoto(admin, {
      empresaId,
      conductorId,
      subidoPor: adminId,
      nombreArchivo: 'seed-v1.jpg'
    })
    await admin.from('conductores').update({ foto_archivo_id: v1.id }).eq('id', conductorId)

    await page.route('**/storage/v1/object/documentos/foto_conductor/**', (route) =>
      route.fulfill({ status: 500, body: 'Fallo simulado de subida de foto (T014)' })
    )

    await page.goto(`/admin/conductores/${conductorId}/editar`)
    await esperarHidratacion(page)
    await page.getByTestId('foto-input').setInputFiles(fotoDePrueba('nueva.jpg'))
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/conductores/${conductorId}`, {
      timeout: 10_000
    })

    const { data: conductor } = await admin
      .from('conductores')
      .select('foto_archivo_id')
      .eq('id', conductorId)
      .single()
    expect(conductor!.foto_archivo_id).toBe(v1.id)

    const { data: archivoV1Aun } = await admin
      .from('archivos')
      .select('id')
      .eq('id', v1.id)
      .maybeSingle()
    expect(archivoV1Aun).not.toBeNull()
  })
})
