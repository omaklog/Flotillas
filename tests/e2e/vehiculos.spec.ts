import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
import type { Database } from '../../app/types/database.types'
import { esperarHidratacion } from './helpers'

// El caso negativo de RLS (operario con solo 'ver' no puede escribir) y el aislamiento de
// Storage por empresa viven en tests/e2e/rls.spec.ts, no aquí — mismo criterio que Catálogos
// Base (T020/T030/T041 de esa feature).

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

/**
 * Localiza una fila filtrando primero por el buscador (deja el filtro activo) — mismo criterio
 * que Catálogos Base: el catálogo de `Empresa E2E` es compartido entre corridas y
 * `TablaCatalogo.vue` pagina de a 20.
 */
async function buscarFila(page: Page, texto: string): Promise<Locator> {
  await page.getByLabel('Buscar por marca, modelo o placa', { exact: true }).fill(texto)
  const fila = page.locator('[data-testid="vehiculos-tabla"] tbody tr', { hasText: texto })
  await expect(fila).toBeVisible({ timeout: 10_000 })
  return fila
}

function pdfDePrueba(nombre = 'poliza.pdf') {
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

async function empresaYTipoAdmin() {
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

/** Sube un PDF de prueba directo a Storage con `service_role` (bypassea RLS) y registra su fila
 * en `archivos`, simulando una versión de póliza ya existente antes de que corra el test. */
async function sembrarVersionPoliza(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: { empresaId: string; vehiculoId: string; subidoPor: string; nombreArchivo: string }
) {
  const ruta = `poliza/${opciones.empresaId}/${opciones.vehiculoId}/${opciones.nombreArchivo}`
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
      tipo: 'poliza',
      storage_path: ruta,
      entidad_tipo: 'vehiculo',
      entidad_id: opciones.vehiculoId,
      subido_por: opciones.subidoPor
    })
    .select('id')
    .single()
  return { id: archivo!.id, storagePath: ruta }
}

/** Igual que `sembrarVersionPoliza`, pero `tipo: 'foto'` — la foto NO tiene historial, así que
 * quien llama a esto además debe actualizar `vehiculos.foto_archivo_id` si quiere que sea "la
 * vigente" (a diferencia de la póliza, aquí normalmente solo hay una fila a la vez). */
async function sembrarVersionFoto(
  admin: ReturnType<typeof adminSupabaseClient>,
  opciones: { empresaId: string; vehiculoId: string; subidoPor: string; nombreArchivo: string }
) {
  const ruta = `foto/${opciones.empresaId}/${opciones.vehiculoId}/${opciones.nombreArchivo}`
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
      tipo: 'foto',
      storage_path: ruta,
      entidad_tipo: 'vehiculo',
      entidad_id: opciones.vehiculoId,
      subido_por: opciones.subidoPor
    })
    .select('id')
    .single()
  return { id: archivo!.id, storagePath: ruta }
}

test.describe('US1 — Administrador da de alta un vehículo', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T011: alta sin póliza crea el vehículo con los campos obligatorios', async ({ page }) => {
    const marca = `Volvo T011 ${Date.now()}`
    const placa = `T011-${Date.now()}`

    await page.goto('/admin/vehiculos/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Marca', { exact: true }).fill(marca)
    await page.getByLabel('Modelo', { exact: true }).fill('FH16')
    await page.getByLabel('Placa', { exact: true }).fill(placa)
    await page.getByRole('combobox', { name: 'Tipo de vehículo' }).fill('Vehículo ligero')
    await page.getByRole('option', { name: 'Vehículo ligero', exact: true }).click()
    await page.getByTestId('submit-btn').click()

    await page.waitForURL('**/admin/vehiculos**', { timeout: 10_000 })
    await esperarHidratacion(page)
    if (!page.url().includes('/admin/vehiculos/nuevo') && page.url() !== '/admin/vehiculos') {
      // Redirigió al detalle del vehículo recién creado.
      await expect(page.getByText(marca)).toBeVisible({ timeout: 10_000 })
      return
    }
    const fila = await buscarFila(page, placa)
    await expect(fila).toContainText(marca)
  })

  test('T012: alta con póliza adjunta crea el vehículo con la póliza vigente', async ({ page }) => {
    const marca = `Scania T012 ${Date.now()}`
    const placa = `T012-${Date.now()}`

    await page.goto('/admin/vehiculos/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Marca', { exact: true }).fill(marca)
    await page.getByLabel('Modelo', { exact: true }).fill('R450')
    await page.getByLabel('Placa', { exact: true }).fill(placa)
    await page.getByRole('combobox', { name: 'Tipo de vehículo' }).fill('Vehículo ligero')
    await page.getByRole('option', { name: 'Vehículo ligero', exact: true }).click()
    await page.getByLabel('Fecha de vencimiento de póliza', { exact: true }).fill('2027-01-01')
    await page.getByTestId('poliza-input').setInputFiles(pdfDePrueba())
    await page.getByTestId('submit-btn').click()

    // No usar el glob '**/admin/vehiculos**': coincide de inmediato con la propia
    // '/admin/vehiculos/nuevo' en la que ya estamos, sin esperar el redirect real tras el envío.
    await page.waitForURL((url) => url.pathname === '/admin/vehiculos', { timeout: 10_000 })
    await esperarHidratacion(page)

    const admin = adminSupabaseClient()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .select('id, poliza_archivo_id')
      .eq('placa', placa)
      .single()
    expect(vehiculo!.poliza_archivo_id).not.toBeNull()
  })

  test('T013: alta rechazada por placa duplicada dentro de la misma empresa', async ({ page }) => {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const placaExistente = `T013-${Date.now()}`
    await admin.from('vehiculos').insert({
      empresa_id: empresaId,
      marca: 'Existente T013',
      modelo: 'X',
      placa: placaExistente,
      tipo_vehiculo_id: tipoVehiculoId
    })

    await page.goto('/admin/vehiculos/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Marca', { exact: true }).fill('Duplicado T013')
    await page.getByLabel('Modelo', { exact: true }).fill('Y')
    await page.getByLabel('Placa', { exact: true }).fill(placaExistente)
    await page.getByRole('combobox', { name: 'Tipo de vehículo' }).fill('Vehículo ligero')
    await page.getByRole('option', { name: 'Vehículo ligero', exact: true }).click()
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText(/ya existe un vehículo con esa placa/i)).toBeVisible()
    await expect(page.getByTestId('submit-btn')).toBeVisible()
  })

  test('T014: un archivo con tipo o tamaño inválido se rechaza antes de subirse', async ({ page }) => {
    await page.goto('/admin/vehiculos/nuevo')
    await esperarHidratacion(page)
    await page.getByTestId('poliza-input').setInputFiles({
      name: 'nota.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('no es una póliza')
    })

    await expect(page.getByText(/el archivo debe ser pdf, jpg o png/i)).toBeVisible()

    // El resto del formulario sigue disponible — no se bloqueó la pantalla completa.
    await expect(page.getByLabel('Marca', { exact: true })).toBeEditable()
  })

  test('T015: si la subida de la póliza falla, el vehículo queda creado igual (FR-005)', async ({
    page
  }) => {
    const marca = `Kenworth T015 ${Date.now()}`
    const placa = `T015-${Date.now()}`

    await page.route('**/storage/v1/object/documentos/**', (route) =>
      route.fulfill({ status: 500, body: 'Fallo simulado de subida (T015)' })
    )

    await page.goto('/admin/vehiculos/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Marca', { exact: true }).fill(marca)
    await page.getByLabel('Modelo', { exact: true }).fill('T680')
    await page.getByLabel('Placa', { exact: true }).fill(placa)
    await page.getByRole('combobox', { name: 'Tipo de vehículo' }).fill('Vehículo ligero')
    await page.getByRole('option', { name: 'Vehículo ligero', exact: true }).click()
    await page.getByTestId('poliza-input').setInputFiles(pdfDePrueba())
    await page.getByTestId('submit-btn').click()

    // El vehículo debe existir en la base de datos aunque la subida haya fallado.
    await expect
      .poll(
        async () => {
          const admin = adminSupabaseClient()
          const { data } = await admin.from('vehiculos').select('id').eq('placa', placa).maybeSingle()
          return data?.id ?? null
        },
        { timeout: 10_000 }
      )
      .not.toBeNull()

    const admin = adminSupabaseClient()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .select('poliza_archivo_id')
      .eq('placa', placa)
      .single()
    expect(vehiculo!.poliza_archivo_id).toBeNull()
  })
})

test.describe('US2 — Administrador busca y consulta el listado de vehículos', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T019: el listado muestra vehículos activos y el buscador filtra por marca, modelo y placa', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const marca = `Isuzu T019 ${Date.now()}`
    const placa = `T019-${Date.now()}`
    await admin.from('vehiculos').insert({
      empresa_id: empresaId,
      marca,
      modelo: 'NPR',
      placa,
      tipo_vehiculo_id: tipoVehiculoId
    })

    await page.goto('/admin/vehiculos')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, placa)
    await expect(fila).toContainText(marca)
  })

  test('T020: un vehículo dado de baja no aparece por defecto; el toggle lo incluye', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const marca = `Hino T020 ${Date.now()}`
    const placa = `T020-${Date.now()}`
    await admin.from('vehiculos').insert({
      empresa_id: empresaId,
      marca,
      modelo: '300',
      placa,
      tipo_vehiculo_id: tipoVehiculoId,
      baja: true,
      motivo_baja: 'Sembrado por T020'
    })

    await page.goto('/admin/vehiculos')
    await esperarHidratacion(page)
    await page.getByLabel('Buscar por marca, modelo o placa', { exact: true }).fill(placa)
    await expect(
      page.locator('[data-testid="vehiculos-tabla"] tbody tr', { hasText: placa })
    ).toHaveCount(0)

    await page.getByLabel('Mostrar dados de baja', { exact: true }).click()
    await expect(
      page.locator('[data-testid="vehiculos-tabla"] tbody tr', { hasText: placa })
    ).toBeVisible()
  })

  test('T021: el badge de vigencia de póliza refleja vencida, por vencer y vigente (umbral 60 días)', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    // Las marcas evitan las propias palabras del badge ("Vencida"/"Vigente") — si coinciden,
    // `getByText` choca en modo estricto contra el texto de la fila y el del chip a la vez.
    const vencida = { marca: `Foton Uno ${sufijo}`, placa: `T021V-${sufijo}` }
    const porVencer = { marca: `Foton Dos ${sufijo}`, placa: `T021P-${sufijo}` }
    const vigente = { marca: `Foton Tres ${sufijo}`, placa: `T021G-${sufijo}` }

    await admin.from('vehiculos').insert([
      {
        empresa_id: empresaId,
        marca: vencida.marca,
        modelo: 'X',
        placa: vencida.placa,
        tipo_vehiculo_id: tipoVehiculoId,
        fecha_vencimiento_poliza: fechaEnDias(-10)
      },
      {
        empresa_id: empresaId,
        marca: porVencer.marca,
        modelo: 'X',
        placa: porVencer.placa,
        tipo_vehiculo_id: tipoVehiculoId,
        fecha_vencimiento_poliza: fechaEnDias(30)
      },
      {
        empresa_id: empresaId,
        marca: vigente.marca,
        modelo: 'X',
        placa: vigente.placa,
        tipo_vehiculo_id: tipoVehiculoId,
        fecha_vencimiento_poliza: fechaEnDias(120)
      }
    ])

    await page.goto('/admin/vehiculos')
    await esperarHidratacion(page)

    const filaVencida = await buscarFila(page, vencida.placa)
    await expect(filaVencida.getByText(/vencida/i)).toBeVisible()

    const filaPorVencer = await buscarFila(page, porVencer.placa)
    await expect(filaPorVencer.getByText(/por vencer/i)).toBeVisible()

    const filaVigente = await buscarFila(page, vigente.placa)
    await expect(filaVigente.getByText(/vigente/i)).toBeVisible()
  })
})

test.describe('US3 — Administrador edita un vehículo y gestiona el historial de su póliza', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T023: editar campos de un vehículo existente (incluida la aseguradora y el número de póliza) guarda los cambios', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Iveco T023 ${sufijo}`,
        modelo: 'Daily',
        placa: `T023-${sufijo}`,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()
    const razonSocial = `Aseguradora T023 ${sufijo}`
    await admin
      .from('aseguradoras')
      .insert({ empresa_id: empresaId, razon_social: razonSocial, rfc: `T023${sufijo}` })

    const nuevoModelo = `Daily Max ${sufijo}`
    const nuevaPoliza = `POL-${sufijo}`

    await page.goto(`/admin/vehiculos/${vehiculo!.id}/editar`)
    await esperarHidratacion(page)
    await page.getByLabel('Modelo', { exact: true }).fill(nuevoModelo)
    await page.getByLabel('Número de póliza', { exact: true }).fill(nuevaPoliza)
    await page.getByRole('combobox', { name: 'Aseguradora' }).fill(razonSocial)
    await page.getByRole('option', { name: razonSocial, exact: true }).click()
    await page.getByTestId('submit-btn').click()

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('vehiculos')
            .select('modelo, numero_poliza, aseguradora_id')
            .eq('id', vehiculo!.id)
            .single()
          return data?.modelo
        },
        { timeout: 10_000 }
      )
      .toBe(nuevoModelo)

    const { data: actualizado } = await admin
      .from('vehiculos')
      .select('numero_poliza, aseguradora_id')
      .eq('id', vehiculo!.id)
      .single()
    expect(actualizado!.numero_poliza).toBe(nuevaPoliza)
    expect(actualizado!.aseguradora_id).not.toBeNull()
  })

  test('T024: reemplazar el archivo de póliza deja el nuevo como vigente sin borrar el anterior', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId, adminId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `MAN T024 ${sufijo}`,
        modelo: 'TGX',
        placa: `T024-${sufijo}`,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()
    const v1 = await sembrarVersionPoliza(admin, {
      empresaId,
      vehiculoId: vehiculo!.id,
      subidoPor: adminId,
      nombreArchivo: 'seed-v1.pdf'
    })
    await admin.from('vehiculos').update({ poliza_archivo_id: v1.id }).eq('id', vehiculo!.id)

    await page.goto(`/admin/vehiculos/${vehiculo!.id}/editar`)
    await esperarHidratacion(page)
    await page.getByTestId('poliza-input').setInputFiles(pdfDePrueba('reemplazo.pdf'))
    await page.getByTestId('submit-btn').click()

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('vehiculos')
            .select('poliza_archivo_id')
            .eq('id', vehiculo!.id)
            .single()
          return data?.poliza_archivo_id
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

  test('T025: el historial de versiones muestra ambas versiones ordenadas por fecha descendente, con quién subió, y solo la más reciente marcada "Vigente"', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId, adminId, adminNombre } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `DAF T025 ${sufijo}`,
        modelo: 'XF',
        placa: `T025-${sufijo}`,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()
    const v1 = await sembrarVersionPoliza(admin, {
      empresaId,
      vehiculoId: vehiculo!.id,
      subidoPor: adminId,
      nombreArchivo: 'seed-v1.pdf'
    })
    // Fuerza que v2 quede estrictamente después de v1 en `created_at` (ambos insertados en el
    // mismo segundo si no se separan).
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const v2 = await sembrarVersionPoliza(admin, {
      empresaId,
      vehiculoId: vehiculo!.id,
      subidoPor: adminId,
      nombreArchivo: 'seed-v2.pdf'
    })
    await admin.from('vehiculos').update({ poliza_archivo_id: v2.id }).eq('id', vehiculo!.id)

    await page.goto(`/admin/vehiculos/${vehiculo!.id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Historial de Póliza' }).click()

    const lista = page.getByTestId('historial-poliza-lista')
    await expect(lista).toBeVisible()
    const items = lista.locator('[data-testid^="historial-poliza-item-"]')
    await expect(items).toHaveCount(2)

    // v2 (la más reciente) debe aparecer primero (orden descendente).
    await expect(items.nth(0)).toHaveAttribute('data-testid', `historial-poliza-item-${v2.id}`)
    await expect(items.nth(1)).toHaveAttribute('data-testid', `historial-poliza-item-${v1.id}`)

    await expect(page.getByTestId(`vigente-badge-${v2.id}`)).toBeVisible()
    await expect(page.getByTestId(`vigente-badge-${v1.id}`)).toHaveCount(0)

    await expect(items.nth(0)).toContainText(adminNombre)
  })

  test('T026: descargar una versión no vigente desde el historial resuelve una URL válida y descarga el archivo correcto', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId, adminId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Renault T026 ${sufijo}`,
        modelo: 'T High',
        placa: `T026-${sufijo}`,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()
    const v1 = await sembrarVersionPoliza(admin, {
      empresaId,
      vehiculoId: vehiculo!.id,
      subidoPor: adminId,
      nombreArchivo: 'seed-no-vigente.pdf'
    })
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const v2 = await sembrarVersionPoliza(admin, {
      empresaId,
      vehiculoId: vehiculo!.id,
      subidoPor: adminId,
      nombreArchivo: 'seed-vigente.pdf'
    })
    await admin.from('vehiculos').update({ poliza_archivo_id: v2.id }).eq('id', vehiculo!.id)

    await page.goto(`/admin/vehiculos/${vehiculo!.id}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Historial de Póliza' }).click()
    await expect(page.getByTestId('historial-poliza-lista')).toBeVisible()

    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId(`descargar-btn-${v1.id}`).click()
    ])
    expect(descarga.suggestedFilename()).toBe(`poliza-${v1.id}.pdf`)
    const ruta = await descarga.path()
    expect(ruta).not.toBeNull()
    const contenido = await readFile(ruta!, 'utf-8')
    expect(contenido).toBe('%PDF-1.4 versión seed-no-vigente.pdf')
  })
})

test.describe('US4 — Administrador da de baja y reactiva un vehículo', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function sembrarVehiculo(prefijo: string) {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Mack ${prefijo} ${sufijo}`,
        modelo: 'Granite',
        placa: `${prefijo}-${sufijo}`,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()
    return { admin, vehiculoId: vehiculo!.id as string, placa: `${prefijo}-${sufijo}` }
  }

  test('T030: intentar confirmar "Dar de baja" sin capturar un motivo lo bloquea', async ({
    page
  }) => {
    const { admin, vehiculoId } = await sembrarVehiculo('T030')

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByTestId('dar-de-baja-btn').click()
    await expect(page.getByTestId('dialogo-baja-motivo')).toBeVisible()
    await expect(page.getByTestId('dialogo-baja-confirmar')).toBeDisabled()
    await page.getByTestId('dialogo-baja-confirmar').click({ force: true })

    // El diálogo sigue abierto (no se envió) y el vehículo sigue activo en la base de datos.
    await expect(page.getByTestId('dialogo-baja-motivo')).toBeVisible()
    const { data: vehiculo } = await admin.from('vehiculos').select('baja').eq('id', vehiculoId).single()
    expect(vehiculo!.baja).toBe(false)
  })

  test('T031: dar de baja con un motivo válido oculta el vehículo del listado por defecto', async ({
    page
  }) => {
    const { vehiculoId, placa } = await sembrarVehiculo('T031')

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByTestId('dar-de-baja-btn').click()
    await page.getByLabel('Motivo de la baja', { exact: true }).fill('Ya no forma parte de la flotilla activa.')
    await page.getByTestId('dialogo-baja-confirmar').click()

    await expect(page.getByTestId('estado-baja-chip')).toBeVisible()

    await page.goto('/admin/vehiculos')
    await esperarHidratacion(page)
    await page.getByLabel('Buscar por marca, modelo o placa', { exact: true }).fill(placa)
    await expect(
      page.locator('[data-testid="vehiculos-tabla"] tbody tr', { hasText: placa })
    ).toHaveCount(0)
  })

  test('T032: reactivar un vehículo dado de baja lo regresa al listado por defecto', async ({
    page
  }) => {
    const { admin, vehiculoId, placa } = await sembrarVehiculo('T032')
    await admin.from('vehiculos').update({ baja: true, motivo_baja: 'Sembrado por T032' }).eq('id', vehiculoId)

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('dar-de-baja-btn')).toHaveCount(0)
    await page.getByTestId('reactivar-btn').click()
    await expect(page.getByTestId('reactivar-btn')).toHaveCount(0)
    await expect(page.getByTestId('dar-de-baja-btn')).toBeVisible()

    await page.goto('/admin/vehiculos')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, placa)
    await expect(fila).toBeVisible()
  })

  test('T033: dar de baja y reactivar generan filas en auditoría con accion desactivar/reactivar, no editar', async ({
    page
  }) => {
    const { admin, vehiculoId } = await sembrarVehiculo('T033')

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByTestId('dar-de-baja-btn').click()
    await page.getByLabel('Motivo de la baja', { exact: true }).fill('Motivo de prueba T033.')
    await page.getByTestId('dialogo-baja-confirmar').click()
    await expect(page.getByTestId('estado-baja-chip')).toBeVisible()

    await page.getByTestId('reactivar-btn').click()
    await expect(page.getByTestId('dar-de-baja-btn')).toBeVisible()

    const { data: auditoria } = await admin
      .from('auditoria')
      .select('accion')
      .eq('entidad', 'vehiculos')
      .eq('entidad_id', vehiculoId)
      .order('created_at', { ascending: true })

    const acciones = auditoria!.map((fila) => fila.accion)
    expect(acciones).toContain('desactivar')
    expect(acciones).toContain('reactivar')
    expect(acciones).not.toContain('editar')
  })
})

test.describe('US5 — Administrador elimina definitivamente un vehículo sin historial', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function eliminarDesdeListado(page: Page, placa: string) {
    await page.goto('/admin/vehiculos')
    await esperarHidratacion(page)
    const fila = await buscarFila(page, placa)
    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()
  }

  test('T036: eliminar un vehículo con una carga de combustible sembrada se rechaza y no borra nada', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId, adminId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const placa = `T036-${sufijo}`
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Freightliner T036 ${sufijo}`,
        modelo: 'Cascadia',
        placa,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()

    // Combustible (004) no existe todavía — se siembra a mano solo lo necesario para ejercer el
    // guard de integridad referencial del DELETE (mismo criterio que usuarios.spec.ts T073).
    const { data: proveedor } = await admin
      .from('proveedores')
      .insert({ empresa_id: empresaId, nombre: `Proveedor T036 ${sufijo}` })
      .select('id')
      .single()
    const { data: producto } = await admin
      .from('productos')
      .insert({ empresa_id: empresaId, nombre: 'Diésel', tipo: 'combustible' })
      .select('id')
      .single()
    await admin.from('cargas_combustible').insert({
      empresa_id: empresaId,
      vehiculo_id: vehiculo!.id,
      proveedor_id: proveedor!.id,
      producto_id: producto!.id,
      fecha: new Date().toISOString().slice(0, 10),
      odometro: 1000,
      cantidad: 50,
      costo_unitario: 20,
      costo_total: 1000,
      creado_por: adminId
    })

    await eliminarDesdeListado(page, placa)

    await expect(page.getByTestId('listado-error')).toContainText(/cargas de combustible/i)

    const { data: sigueExistiendo } = await admin
      .from('vehiculos')
      .select('id')
      .eq('id', vehiculo!.id)
      .maybeSingle()
    expect(sigueExistiendo).not.toBeNull()
  })

  test('T037: eliminar un vehículo sin dependientes pero con una póliza adjunta borra también su historial de archivos (FR-016a)', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId, adminId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const placa = `T037-${sufijo}`
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Hyundai T037 ${sufijo}`,
        modelo: 'Xcient',
        placa,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()
    const version = await sembrarVersionPoliza(admin, {
      empresaId,
      vehiculoId: vehiculo!.id,
      subidoPor: adminId,
      nombreArchivo: 'seed-t037.pdf'
    })
    await admin.from('vehiculos').update({ poliza_archivo_id: version.id }).eq('id', vehiculo!.id)

    await eliminarDesdeListado(page, placa)

    await expect
      .poll(
        async () => {
          const { data } = await admin.from('vehiculos').select('id').eq('id', vehiculo!.id).maybeSingle()
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

    const carpeta = `poliza/${empresaId}/${vehiculo!.id}`
    const { data: objetosRestantes } = await admin.storage.from('documentos').list(carpeta)
    expect(objetosRestantes ?? []).toHaveLength(0)
  })

  test('T038: eliminar un vehículo sin ningún dato adjunto procede sin error', async ({ page }) => {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const placa = `T038-${sufijo}`
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Mitsubishi Fuso T038 ${sufijo}`,
        modelo: 'Canter',
        placa,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()

    await eliminarDesdeListado(page, placa)

    await expect(page.getByTestId('listado-error')).toHaveCount(0)
    await expect
      .poll(
        async () => {
          const { data } = await admin.from('vehiculos').select('id').eq('id', vehiculo!.id).maybeSingle()
          return data
        },
        { timeout: 10_000 }
      )
      .toBeNull()
  })
})

test.describe('US6 — Administrador asigna los permisos aplicables a un vehículo', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function sembrarVehiculoYPermiso(prefijo: string) {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Western Star ${prefijo} ${sufijo}`,
        modelo: '49X',
        placa: `${prefijo}-${sufijo}`,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()
    const { data: permiso } = await admin
      .from('permisos')
      .insert({
        empresa_id: empresaId,
        clave: `${prefijo.toLowerCase()}_${sufijo}`,
        nombre: `Permiso ${prefijo} ${sufijo}`,
        tipo: 'estatal'
      })
      .select('id, nombre')
      .single()
    return { admin, empresaId, vehiculoId: vehiculo!.id as string, permisoId: permiso!.id as string, permisoNombre: permiso!.nombre as string }
  }

  test('T040: asignar un permiso del catálogo con fecha de vencimiento lo muestra en la lista de permisos aplicables', async ({
    page
  }) => {
    const { vehiculoId, permisoNombre } = await sembrarVehiculoYPermiso('T040')

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Permisos' }).click()
    await page.getByRole('combobox', { name: 'Permiso' }).fill(permisoNombre)
    await page.getByRole('option', { name: permisoNombre, exact: true }).click()
    await page
      .getByLabel('Fecha de vencimiento del permiso', { exact: true })
      .fill('2027-06-01')
    await page.getByTestId('asignar-permiso-btn').click()

    await expect(page.getByTestId('permisos-vehiculo-lista')).toContainText(permisoNombre)
  })

  test('T041: asignar el mismo permiso dos veces al mismo vehículo se rechaza como duplicado (FR-018)', async ({
    page
  }) => {
    const { vehiculoId, permisoNombre } = await sembrarVehiculoYPermiso('T041')

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Permisos' }).click()

    await page.getByRole('combobox', { name: 'Permiso' }).fill(permisoNombre)
    await page.getByRole('option', { name: permisoNombre, exact: true }).click()
    await page.getByTestId('asignar-permiso-btn').click()
    await expect(page.getByTestId('permisos-vehiculo-lista')).toContainText(permisoNombre)

    await page.getByRole('combobox', { name: 'Permiso' }).fill(permisoNombre)
    await page.getByRole('option', { name: permisoNombre, exact: true }).click()
    await page.getByTestId('asignar-permiso-btn').click()

    await expect(page.getByTestId('asignar-permiso-error')).toContainText(/ya está asignado/i)
  })

  test('T042: editar la fecha de vencimiento de una asignación existente se refleja de inmediato', async ({
    page
  }) => {
    const { admin, empresaId, vehiculoId, permisoId } = await sembrarVehiculoYPermiso('T042')
    const { data: asignacion } = await admin
      .from('vehiculo_permisos')
      .insert({
        empresa_id: empresaId,
        vehiculo_id: vehiculoId,
        permiso_id: permisoId,
        fecha_vencimiento: '2027-01-01'
      })
      .select('id')
      .single()

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Permisos' }).click()
    await expect(page.getByTestId(`permiso-item-${asignacion!.id}`)).toBeVisible()

    await page
      .getByTestId(`fecha-vencimiento-input-${asignacion!.id}`)
      .locator('input')
      .fill('2028-03-15')
    await page.getByTestId(`guardar-vencimiento-${asignacion!.id}`).click()

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('vehiculo_permisos')
            .select('fecha_vencimiento')
            .eq('id', asignacion!.id)
            .single()
          return data?.fecha_vencimiento
        },
        { timeout: 10_000 }
      )
      .toBe('2028-03-15')
  })

  test('T043: quitar una asignación la quita de la lista del vehículo sin afectar el catálogo general de permisos', async ({
    page
  }) => {
    const { admin, empresaId, vehiculoId, permisoId } = await sembrarVehiculoYPermiso('T043')
    const { data: asignacion } = await admin
      .from('vehiculo_permisos')
      .insert({ empresa_id: empresaId, vehiculo_id: vehiculoId, permiso_id: permisoId })
      .select('id')
      .single()

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByRole('tab', { name: 'Permisos' }).click()
    await expect(page.getByTestId(`permiso-item-${asignacion!.id}`)).toBeVisible()

    await page.getByTestId(`quitar-btn-${asignacion!.id}`).click()
    await expect(page.getByTestId(`permiso-item-${asignacion!.id}`)).toHaveCount(0)

    const { data: permisoAun } = await admin
      .from('permisos')
      .select('id')
      .eq('id', permisoId)
      .maybeSingle()
    expect(permisoAun).not.toBeNull()
  })
})

test.describe('US7 — Administrador consulta el detalle de un vehículo sin entrar a edición', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function sembrarVehiculo(prefijo: string) {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const marca = `Isuzu ${prefijo} ${sufijo}`
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca,
        modelo: 'NPR',
        placa: `${prefijo}-${sufijo}`,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()
    return { vehiculoId: vehiculo!.id as string, marca }
  }

  test('T050: abrir un vehículo desde el listado muestra su detalle en modo solo lectura', async ({
    page
  }) => {
    const { vehiculoId, marca } = await sembrarVehiculo('T050')

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)

    await expect(page.getByTestId('datos-vehiculo').getByText(marca)).toBeVisible()
    await expect(page.getByTestId('editar-btn')).toBeVisible()
    // Modo solo lectura: ni el botón de envío del formulario ni sus campos editables existen.
    await expect(page.getByTestId('submit-btn')).toHaveCount(0)
    await expect(page.getByLabel('Marca', { exact: true })).toHaveCount(0)
  })

  test('T051: la acción "Editar" desde el detalle navega al formulario con los datos precargados', async ({
    page
  }) => {
    const { vehiculoId, marca } = await sembrarVehiculo('T051')

    await page.goto(`/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await page.getByTestId('editar-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/vehiculos/${vehiculoId}/editar`)
    await esperarHidratacion(page)
    await expect(page.getByLabel('Marca', { exact: true })).toHaveValue(marca)
    await expect(page.getByTestId('submit-btn')).toBeVisible()
  })

  test('T052: guardar cambios en el formulario regresa a la vista de detalle mostrando los datos actualizados', async ({
    page
  }) => {
    const { vehiculoId } = await sembrarVehiculo('T052')
    const nuevoModelo = `NPR Actualizado ${Date.now()}`

    await page.goto(`/admin/vehiculos/${vehiculoId}/editar`)
    await esperarHidratacion(page)
    await page.getByLabel('Modelo', { exact: true }).fill(nuevoModelo)
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/vehiculos/${vehiculoId}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('datos-vehiculo').getByText(nuevoModelo)).toBeVisible()
    await expect(page.getByTestId('submit-btn')).toHaveCount(0)
  })
})

test.describe('Foto del vehículo (FR-023 a FR-025)', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  async function sembrarVehiculo(prefijo: string) {
    const { admin, empresaId, tipoVehiculoId, adminId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Kenworth ${prefijo} ${sufijo}`,
        modelo: 'T880',
        placa: `${prefijo}-${sufijo}`,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()
    return { admin, empresaId, adminId, vehiculoId: vehiculo!.id as string }
  }

  test('T057: adjuntar una foto durante el alta la deja visible en el detalle del vehículo', async ({
    page
  }) => {
    const marca = `Volvo T057 ${Date.now()}`
    const placa = `T057-${Date.now()}`

    await page.goto('/admin/vehiculos/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Marca', { exact: true }).fill(marca)
    await page.getByLabel('Modelo', { exact: true }).fill('FH16')
    await page.getByLabel('Placa', { exact: true }).fill(placa)
    await page.getByRole('combobox', { name: 'Tipo de vehículo' }).fill('Vehículo ligero')
    await page.getByRole('option', { name: 'Vehículo ligero', exact: true }).click()
    await page.getByTestId('foto-input').setInputFiles(fotoDePrueba())
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === '/admin/vehiculos', { timeout: 10_000 })

    const admin = adminSupabaseClient()
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('vehiculos')
            .select('foto_archivo_id')
            .eq('placa', placa)
            .single()
          return data?.foto_archivo_id ?? null
        },
        { timeout: 10_000 }
      )
      .not.toBeNull()

    const { data: vehiculo } = await admin
      .from('vehiculos')
      .select('id, foto_archivo_id')
      .eq('placa', placa)
      .single()
    expect(vehiculo!.foto_archivo_id).not.toBeNull()

    await page.goto(`/admin/vehiculos/${vehiculo!.id}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('foto-vehiculo')).toBeVisible()
  })

  test('T058: reemplazar la foto de un vehículo deja la nueva visible y elimina la anterior', async ({
    page
  }) => {
    const { admin, vehiculoId, adminId, empresaId } = await sembrarVehiculo('T058')
    const v1 = await sembrarVersionFoto(admin, {
      empresaId,
      vehiculoId,
      subidoPor: adminId,
      nombreArchivo: 'seed-v1.jpg'
    })
    await admin.from('vehiculos').update({ foto_archivo_id: v1.id }).eq('id', vehiculoId)

    await page.goto(`/admin/vehiculos/${vehiculoId}/editar`)
    await esperarHidratacion(page)
    await page.getByTestId('foto-input').setInputFiles(fotoDePrueba('reemplazo.jpg'))
    await page.getByTestId('submit-btn').click()

    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('vehiculos')
            .select('foto_archivo_id')
            .eq('id', vehiculoId)
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
  })

  test('T059: un archivo de foto con tipo o tamaño inválido se rechaza antes de subirse', async ({
    page
  }) => {
    await page.goto('/admin/vehiculos/nuevo')
    await esperarHidratacion(page)
    await page.getByTestId('foto-input').setInputFiles(pdfDePrueba('no-es-foto.pdf'))

    await expect(page.getByText(/la foto debe ser jpg o png/i)).toBeVisible()
    await expect(page.getByLabel('Marca', { exact: true })).toBeEditable()
  })

  test('T060: si la subida de una foto nueva falla durante un reemplazo, la foto anterior sigue siendo la vigente', async ({
    page
  }) => {
    const { admin, vehiculoId, adminId, empresaId } = await sembrarVehiculo('T060')
    const v1 = await sembrarVersionFoto(admin, {
      empresaId,
      vehiculoId,
      subidoPor: adminId,
      nombreArchivo: 'seed-v1.jpg'
    })
    await admin.from('vehiculos').update({ foto_archivo_id: v1.id }).eq('id', vehiculoId)

    await page.route('**/storage/v1/object/documentos/foto/**', (route) =>
      route.fulfill({ status: 500, body: 'Fallo simulado de subida de foto (T060)' })
    )

    await page.goto(`/admin/vehiculos/${vehiculoId}/editar`)
    await esperarHidratacion(page)
    await page.getByTestId('foto-input').setInputFiles(fotoDePrueba('nueva.jpg'))
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/vehiculos/${vehiculoId}`, {
      timeout: 10_000
    })

    const { data: vehiculo } = await admin
      .from('vehiculos')
      .select('foto_archivo_id')
      .eq('id', vehiculoId)
      .single()
    expect(vehiculo!.foto_archivo_id).toBe(v1.id)

    const { data: archivoV1Aun } = await admin
      .from('archivos')
      .select('id')
      .eq('id', v1.id)
      .maybeSingle()
    expect(archivoV1Aun).not.toBeNull()
  })
})

test.describe('Campos adicionales del vehículo y detalle agrupado en tarjetas (FR-001, FR-026)', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T066: alta capturando VIN, kilometraje actual, combustible y transmisión deja esos datos visibles en el detalle', async ({
    page
  }) => {
    const marca = `Scania T066 ${Date.now()}`
    const placa = `T066-${Date.now()}`
    const vin = `VIN${Date.now()}`
    const kilometraje = '125000'
    const combustible = 'Diésel'
    const transmision = 'Automatizada'

    await page.goto('/admin/vehiculos/nuevo')
    await esperarHidratacion(page)
    await page.getByLabel('Marca', { exact: true }).fill(marca)
    await page.getByLabel('Modelo', { exact: true }).fill('R450')
    await page.getByLabel('Placa', { exact: true }).fill(placa)
    await page.getByLabel('VIN', { exact: true }).fill(vin)
    await page.getByLabel('Kilometraje actual', { exact: true }).fill(kilometraje)
    await page.getByLabel('Combustible', { exact: true }).fill(combustible)
    await page.getByLabel('Transmisión', { exact: true }).fill(transmision)
    await page.getByRole('combobox', { name: 'Tipo de vehículo' }).fill('Vehículo ligero')
    await page.getByRole('option', { name: 'Vehículo ligero', exact: true }).click()
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === '/admin/vehiculos', { timeout: 10_000 })

    const admin = adminSupabaseClient()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .select('id, vin, kilometraje_actual, combustible, transmision')
      .eq('placa', placa)
      .single()
    expect(vehiculo!.vin).toBe(vin)
    expect(vehiculo!.kilometraje_actual).toBe(125000)
    expect(vehiculo!.combustible).toBe(combustible)
    expect(vehiculo!.transmision).toBe(transmision)

    await page.goto(`/admin/vehiculos/${vehiculo!.id}`)
    await esperarHidratacion(page)
    await expect(page.getByTestId('tarjeta-registro').getByText(vin)).toBeVisible()
    await expect(page.getByTestId('tarjeta-registro').getByText('125000')).toBeVisible()
    await expect(page.getByTestId('tarjeta-especificaciones').getByText(combustible)).toBeVisible()
    await expect(page.getByTestId('tarjeta-especificaciones').getByText(transmision)).toBeVisible()
  })

  test('T067: el detalle de solo lectura agrupa los campos en las 4 tarjetas de FR-026', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const razonSocial = `Aseguradora T067 ${sufijo}`
    await admin
      .from('aseguradoras')
      .insert({ empresa_id: empresaId, razon_social: razonSocial, rfc: `T067${sufijo}` })
    const { data: aseguradora } = await admin
      .from('aseguradoras')
      .select('id')
      .eq('razon_social', razonSocial)
      .single()

    const marca = `Foton T067 ${sufijo}`
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca,
        modelo: 'Aumark',
        placa: `T067-${sufijo}`,
        color: 'Blanco',
        anio: 2024,
        numero_serie: `SERIE${sufijo}`,
        numero_motor: `MOTOR${sufijo}`,
        capacidad_carga: 3500,
        numero_ejes: 2,
        vin: `VIN${sufijo}`,
        kilometraje_actual: 42000,
        combustible: 'Gasolina',
        transmision: 'Manual',
        tipo_vehiculo_id: tipoVehiculoId,
        aseguradora_id: aseguradora!.id,
        numero_poliza: `POL-${sufijo}`,
        fecha_vencimiento_poliza: fechaEnDias(120)
      })
      .select('id')
      .single()

    await page.goto(`/admin/vehiculos/${vehiculo!.id}`)
    await esperarHidratacion(page)

    const identificacion = page.getByTestId('tarjeta-identificacion')
    await expect(identificacion).toBeVisible()
    await expect(identificacion.getByText(marca)).toBeVisible()
    await expect(identificacion.getByText('Aumark')).toBeVisible()
    await expect(identificacion.getByText('2024')).toBeVisible()
    await expect(identificacion.getByText('Blanco')).toBeVisible()
    await expect(identificacion.getByText('Vehículo ligero')).toBeVisible()

    const registro = page.getByTestId('tarjeta-registro')
    await expect(registro).toBeVisible()
    await expect(registro.getByText(`T067-${sufijo}`)).toBeVisible()
    await expect(registro.getByText(`VIN${sufijo}`)).toBeVisible()
    await expect(registro.getByText(`SERIE${sufijo}`)).toBeVisible()
    await expect(registro.getByText(`MOTOR${sufijo}`)).toBeVisible()
    await expect(registro.getByText('42000')).toBeVisible()

    const especificaciones = page.getByTestId('tarjeta-especificaciones')
    await expect(especificaciones).toBeVisible()
    await expect(especificaciones.getByText('Gasolina')).toBeVisible()
    await expect(especificaciones.getByText('Manual')).toBeVisible()
    await expect(especificaciones.getByText('3500')).toBeVisible()

    const seguroPoliza = page.getByTestId('tarjeta-seguro-poliza')
    await expect(seguroPoliza).toBeVisible()
    await expect(seguroPoliza.getByText(razonSocial)).toBeVisible()
    await expect(seguroPoliza.getByText(`POL-${sufijo}`)).toBeVisible()

    // Los datos de identificación no deben duplicarse en la tarjeta de registro (agrupación
    // real, no solo etiquetas nuevas sobre la misma cuadrícula plana).
    await expect(registro.getByText(marca)).toHaveCount(0)
  })

  test('T068: editar VIN, kilometraje actual, combustible y transmisión de un vehículo existente guarda los cambios', async ({
    page
  }) => {
    const { admin, empresaId, tipoVehiculoId } = await empresaYTipoAdmin()
    const sufijo = Date.now()
    const { data: vehiculo } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: empresaId,
        marca: `Hino T068 ${sufijo}`,
        modelo: '500',
        placa: `T068-${sufijo}`,
        tipo_vehiculo_id: tipoVehiculoId
      })
      .select('id')
      .single()

    const nuevoVin = `EDITVIN${sufijo}`
    const nuevoKilometraje = '80000'
    const nuevoCombustible = 'Diésel'
    const nuevaTransmision = 'Automática'

    await page.goto(`/admin/vehiculos/${vehiculo!.id}/editar`)
    await esperarHidratacion(page)
    await page.getByLabel('VIN', { exact: true }).fill(nuevoVin)
    await page.getByLabel('Kilometraje actual', { exact: true }).fill(nuevoKilometraje)
    await page.getByLabel('Combustible', { exact: true }).fill(nuevoCombustible)
    await page.getByLabel('Transmisión', { exact: true }).fill(nuevaTransmision)
    await page.getByTestId('submit-btn').click()

    await page.waitForURL((url) => url.pathname === `/admin/vehiculos/${vehiculo!.id}`, {
      timeout: 10_000
    })

    const { data: actualizado } = await admin
      .from('vehiculos')
      .select('vin, kilometraje_actual, combustible, transmision')
      .eq('id', vehiculo!.id)
      .single()
    expect(actualizado!.vin).toBe(nuevoVin)
    expect(actualizado!.kilometraje_actual).toBe(80000)
    expect(actualizado!.combustible).toBe(nuevoCombustible)
    expect(actualizado!.transmision).toBe(nuevaTransmision)

    await expect(page.getByTestId('tarjeta-registro').getByText(nuevoVin)).toBeVisible()
    await expect(page.getByTestId('tarjeta-especificaciones').getByText(nuevoCombustible)).toBeVisible()
  })
})
