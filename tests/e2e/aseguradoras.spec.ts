import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { esperarHidratacion, crearEmpresaConAdmin, crearSesionParaUsuario, inyectarSesion } from './helpers'

// El caso negativo de RLS (operario con solo 'ver' no puede escribir) vive en
// tests/e2e/rls.spec.ts, no aquí — mismo criterio que tipos-vehiculo.spec.ts (T020).

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

/**
 * Localiza una fila filtrando primero por el buscador (deja el filtro activo). El catálogo de
 * `Empresa E2E` es compartido entre corridas de test y acumula registros previos;
 * `TablaCatalogo.vue` pagina (10 por página por defecto, seleccionable 5/10/20) — sin filtrar,
 * una fila recién creada puede quedar en una página que el test nunca visita si el catálogo ya
 * tiene más registros que el tamaño de página vigente (visto de forma reproducible durante el
 * desarrollo de esta feature).
 */
async function buscarFila(page: Page, texto: string): Promise<Locator> {
  await page.getByLabel('Buscar por nombre o RFC', { exact: true }).fill(texto)
  const fila = page.locator('[data-testid="aseguradoras-tabla"] tbody tr', { hasText: texto })
  await expect(fila).toBeVisible({ timeout: 10_000 })
  return fila
}

test.describe('US2 — catálogo vacío por defecto (requiere una empresa recién creada, no la compartida)', () => {
  test('T024: una empresa recién creada tiene el catálogo de aseguradoras vacío', async ({ browser }) => {
    const admin = adminSupabaseClient()
    const { correo } = await crearEmpresaConAdmin(admin, { nombre: `Empresa Aseguradoras T024 ${Date.now()}` })
    const session = await crearSesionParaUsuario(correo)

    const context = await browser.newContext()
    await inyectarSesion(context, session, process.env.SUPABASE_URL!)
    const page = await context.newPage()

    await page.goto('/admin/aseguradoras')
    await esperarHidratacion(page)

    await expect(page.getByText('Sin aseguradoras que mostrar.')).toBeVisible()
    await expect(page.locator('[data-testid="aseguradoras-tabla"] tbody tr')).toHaveCount(1)

    await context.close()
  })
})

test.describe('US2 — Administrador gestiona compañías de seguro', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T025: alta con razón social y RFC', async ({ page }) => {
    const razonSocial = `Aseguradora Playwright T025 ${Date.now()}`

    await page.goto('/admin/aseguradoras')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Razón social', { exact: true }).fill(razonSocial)
    await page.getByLabel('RFC', { exact: true }).fill('AAA010101AAA')
    await page.getByTestId('submit-btn').click()

    await buscarFila(page, razonSocial)
  })

  test('T026: la búsqueda por nombre y por RFC filtra el listado', async ({ page }) => {
    const razonSocial = `Aseguradora Búsqueda T026 ${Date.now()}`
    const rfc = `BUS${Date.now().toString().slice(-9)}`

    await page.goto('/admin/aseguradoras')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Razón social', { exact: true }).fill(razonSocial)
    await page.getByLabel('RFC', { exact: true }).fill(rfc)
    await page.getByTestId('submit-btn').click()

    await page.getByLabel('Buscar por nombre o RFC', { exact: true }).fill(razonSocial)
    await expect(page.getByTestId('aseguradoras-tabla').getByText(razonSocial)).toBeVisible({
      timeout: 10_000
    })

    await page.getByLabel('Buscar por nombre o RFC', { exact: true }).fill('')
    await page.getByLabel('Buscar por nombre o RFC', { exact: true }).fill(rfc)
    await expect(page.getByTestId('aseguradoras-tabla').getByText(razonSocial)).toBeVisible({
      timeout: 10_000
    })
  })

  test('T027: edición de una aseguradora existente', async ({ page }) => {
    const razonOriginal = `Editable T027 ${Date.now()}`
    const razonEditada = `${razonOriginal} (editada)`

    await page.goto('/admin/aseguradoras')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Razón social', { exact: true }).fill(razonOriginal)
    await page.getByLabel('RFC', { exact: true }).fill('EDI010101AAA')
    await page.getByTestId('submit-btn').click()

    const fila = await buscarFila(page, razonOriginal)
    await fila.getByTestId('editar-btn').click()
    await page.getByLabel('Razón social', { exact: true }).fill(razonEditada)
    await page.getByTestId('submit-btn').click()

    await buscarFila(page, razonEditada)
  })

  test('T028: eliminar una aseguradora en uso muestra el mensaje de bloqueo y no la elimina', async ({
    page
  }) => {
    const admin = adminSupabaseClient()
    const razonSocial = `En Uso T028 ${Date.now()}`

    await page.goto('/admin/aseguradoras')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Razón social', { exact: true }).fill(razonSocial)
    await page.getByLabel('RFC', { exact: true }).fill('USO010101AAA')
    await page.getByTestId('submit-btn').click()
    const fila = await buscarFila(page, razonSocial)

    // Vehículos (003) no existe todavía — se siembra directo vía service_role, mismo
    // patrón que tests/e2e/usuarios.spec.ts T073 / tipos-vehiculo.spec.ts T018.
    const { data: aseguradora } = await admin
      .from('aseguradoras')
      .select('id, empresa_id')
      .eq('razon_social', razonSocial)
      .single()
    const { data: tipo } = await admin
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', aseguradora!.empresa_id)
      .eq('clave', 'ligero')
      .single()
    const { error: vehiculoError } = await admin.from('vehiculos').insert({
      empresa_id: aseguradora!.empresa_id,
      marca: 'Marca T028',
      modelo: 'Modelo T028',
      placa: `T028-${Date.now()}`,
      tipo_vehiculo_id: tipo!.id,
      aseguradora_id: aseguradora!.id
    })
    expect(vehiculoError).toBeNull()

    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('catalogo-error')).toContainText(
      'No se puede eliminar: hay vehículos usando esta aseguradora'
    )
    await expect(page.getByTestId('aseguradoras-tabla').getByText(razonSocial)).toBeVisible()
  })

  test('T029: eliminar una aseguradora sin vehículos asociados la quita del listado sin error', async ({
    page
  }) => {
    const razonSocial = `Eliminable T029 ${Date.now()}`

    await page.goto('/admin/aseguradoras')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Razón social', { exact: true }).fill(razonSocial)
    await page.getByLabel('RFC', { exact: true }).fill('ELI010101AAA')
    await page.getByTestId('submit-btn').click()
    const fila = await buscarFila(page, razonSocial)

    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('aseguradoras-tabla').getByText(razonSocial)).not.toBeVisible()
  })
})
