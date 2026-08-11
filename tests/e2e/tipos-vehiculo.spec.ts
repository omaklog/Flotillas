import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { normalizarClave } from '../../app/utils/clave'
import { esperarHidratacion, crearEmpresaConAdmin, crearSesionParaUsuario, inyectarSesion } from './helpers'

// El caso negativo de RLS (operario con solo 'ver' no puede escribir) vive en
// tests/e2e/rls.spec.ts, no aquí — es el archivo dedicado del proyecto para pruebas
// negativas contra PostgREST directo (constitución §4), no se duplica por feature.

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
  await page.getByLabel('Buscar por nombre', { exact: true }).fill(texto)
  const fila = page.locator('[data-testid="tipos-vehiculo-tabla"] tbody tr', { hasText: texto })
  await expect(fila).toBeVisible({ timeout: 10_000 })
  return fila
}

test.describe('US1 — siembra automática (requiere una empresa recién creada, no la compartida)', () => {
  test('T012: una empresa recién creada muestra exactamente los 3 tipos de vehículo predefinidos', async ({
    browser
  }) => {
    const admin = adminSupabaseClient()
    const { correo } = await crearEmpresaConAdmin(admin, { nombre: `Empresa Siembra T012 ${Date.now()}` })
    const session = await crearSesionParaUsuario(correo)

    const context = await browser.newContext()
    await inyectarSesion(context, session, process.env.SUPABASE_URL!)
    const page = await context.newPage()

    await page.goto('/admin/tipos-vehiculo')
    await esperarHidratacion(page)

    await expect(page.getByText('Vehículo ligero')).toBeVisible()
    await expect(page.getByText('Servicio pesado (más de 3.5 toneladas)')).toBeVisible()
    await expect(page.getByText('Transporte de materiales peligrosos')).toBeVisible()
    await expect(page.locator('[data-testid="tipos-vehiculo-tabla"] tbody tr')).toHaveCount(3)

    await context.close()
  })
})

test.describe('US1 — Administrador gestiona tipos de vehículo', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T013: alta con clave autogenerada desde el nombre', async ({ page }) => {
    const nombre = `Grúa Especial T013 ${Date.now()}`

    await page.goto('/admin/tipos-vehiculo')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByTestId('autogenerar-clave-btn').click()
    await expect(page.getByLabel('Clave', { exact: true })).toHaveValue(normalizarClave(nombre))

    await page.getByTestId('submit-btn').click()
    await buscarFila(page, nombre)
  })

  test('T014: alta manual rechazada por formato de clave inválido', async ({ page }) => {
    await page.goto('/admin/tipos-vehiculo')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill('Tipo Inválido T014')
    await page.getByLabel('Clave', { exact: true }).fill('Con Espacio')
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText(/solo minúsculas, números y guion bajo/i)).toBeVisible()
    // El diálogo sigue abierto — no se envió.
    await expect(page.getByTestId('submit-btn')).toBeVisible()
  })

  test('T015: alta rechazada por clave duplicada dentro de la misma empresa', async ({ page }) => {
    await page.goto('/admin/tipos-vehiculo')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill('Pesado Duplicado T015')
    // 'pesado' ya viene sembrado por defecto en toda empresa (FR-011).
    await page.getByLabel('Clave', { exact: true }).fill('pesado')
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText(/ya existe un registro con esa clave/i)).toBeVisible()
    await expect(page.getByTestId('submit-btn')).toBeVisible()
  })

  test('T016: la búsqueda por nombre filtra el listado', async ({ page }) => {
    await page.goto('/admin/tipos-vehiculo')
    await esperarHidratacion(page)

    await page.getByLabel('Buscar por nombre', { exact: true }).fill('ligero')
    await expect(page.getByTestId('tipos-vehiculo-tabla').getByText('Vehículo ligero')).toBeVisible()
    await expect(
      page.getByTestId('tipos-vehiculo-tabla').getByText('Servicio pesado (más de 3.5 toneladas)')
    ).not.toBeVisible()
  })

  test('T017: edición de un tipo existente (incluida su clave)', async ({ page }) => {
    const nombreOriginal = `Editable T017 ${Date.now()}`
    const nombreEditado = `${nombreOriginal} (editado)`
    const claveEditada = `editado_t017_${Date.now()}`

    await page.goto('/admin/tipos-vehiculo')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill(nombreOriginal)
    await page.getByTestId('autogenerar-clave-btn').click()
    await page.getByTestId('submit-btn').click()

    const fila = await buscarFila(page, nombreOriginal)
    await fila.getByTestId('editar-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill(nombreEditado)
    await page.getByLabel('Clave', { exact: true }).fill(claveEditada)
    await page.getByTestId('submit-btn').click()

    // Se busca por nombre, no por clave: tipos_vehiculo solo indexa 'nombre' en el buscador
    // (FR-001 — a diferencia de permisos, que también busca por clave).
    const filaEditada = await buscarFila(page, nombreEditado)
    await expect(filaEditada).toContainText(claveEditada)
  })

  test('T018: eliminar un tipo en uso muestra el mensaje de bloqueo y no lo elimina', async ({ page }) => {
    const admin = adminSupabaseClient()
    const nombreUnico = `En Uso T018 ${Date.now()}`
    const claveUnica = `enuso_t018_${Date.now()}`

    await page.goto('/admin/tipos-vehiculo')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill(nombreUnico)
    await page.getByLabel('Clave', { exact: true }).fill(claveUnica)
    await page.getByTestId('submit-btn').click()
    const fila = await buscarFila(page, nombreUnico)

    // Vehículos (003) no existe todavía — se siembra directo vía service_role, mismo
    // patrón que tests/e2e/usuarios.spec.ts T073.
    const { data: tipo } = await admin
      .from('tipos_vehiculo')
      .select('id, empresa_id')
      .eq('clave', claveUnica)
      .single()
    const { error: vehiculoError } = await admin.from('vehiculos').insert({
      empresa_id: tipo!.empresa_id,
      marca: 'Marca T018',
      modelo: 'Modelo T018',
      placa: `T018-${Date.now()}`,
      tipo_vehiculo_id: tipo!.id
    })
    expect(vehiculoError).toBeNull()

    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('catalogo-error')).toContainText(
      'No se puede eliminar: hay vehículos usando este tipo'
    )
    // Acotado a la tabla: el texto del diálogo de confirmación ("¿Eliminar
    // <strong>{nombre}</strong>?") puede seguir presente en el DOM durante su
    // animación de cierre y generaría un match ambiguo con getByText a nivel de página.
    await expect(page.getByTestId('tipos-vehiculo-tabla').getByText(nombreUnico)).toBeVisible()
  })

  test('T019: eliminar un tipo sin vehículos asociados lo quita del listado sin error', async ({
    page
  }) => {
    const nombreUnico = `Eliminable T019 ${Date.now()}`

    await page.goto('/admin/tipos-vehiculo')
    await esperarHidratacion(page)
    await page.getByTestId('nuevo-btn').click()
    await page.getByLabel('Nombre', { exact: true }).fill(nombreUnico)
    await page.getByTestId('autogenerar-clave-btn').click()
    await page.getByTestId('submit-btn').click()
    const fila = await buscarFila(page, nombreUnico)

    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('tipos-vehiculo-tabla').getByText(nombreUnico)).not.toBeVisible()
  })
})
