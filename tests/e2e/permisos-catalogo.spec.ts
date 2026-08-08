import { test, expect, type Locator, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../app/types/database.types'
import { normalizarClave } from '../../app/utils/clave'
import { esperarHidratacion, crearEmpresaConAdmin, crearSesionParaUsuario, inyectarSesion } from './helpers'

// El caso negativo de RLS (operario con solo 'ver' no puede escribir) vive en
// tests/e2e/rls.spec.ts, no aquí — mismo criterio que tipos-vehiculo.spec.ts (T020) y
// aseguradoras.spec.ts (T030).

// Nombre de tabla real: `permisos` (catálogo de tipos de permiso de vehículo, no confundir con
// `usuario_permisos` — ver data-model.md).

function adminSupabaseClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

/**
 * Vuetify anima la entrada del `v-dialog` (~250ms). Interactuar con el `v-select` de "Tipo"
 * mientras esa transición sigue en curso deja su menú sin abrir tras el clic — reproducible
 * de forma determinista incluso con `--workers=1` (no es contención de recursos). Los otros
 * campos del formulario (texto simple) no muestran este problema, solo el `v-select`.
 */
async function abrirDialogo(page: Page, activador: Locator) {
  await activador.click()
  await page.waitForTimeout(300)
}

/**
 * Localiza una fila filtrando primero por el buscador (deja el filtro activo). El catálogo de
 * `Empresa E2E` es compartido entre corridas de test y acumula registros previos;
 * `TablaCatalogo.vue` pagina de a 20 — sin filtrar, una fila recién creada puede quedar en una
 * página que el test nunca visita si el catálogo ya tiene más de 20 registros (visto de forma
 * reproducible: el catálogo de permisos superó ese umbral durante el desarrollo de esta
 * feature). Buscar dexa además acotadas las búsquedas de filas subsecuentes en el mismo test.
 */
async function buscarFila(page: Page, texto: string): Promise<Locator> {
  await page.getByLabel('Buscar por nombre o clave', { exact: true }).fill(texto)
  const fila = page.locator('[data-testid="permisos-tabla"] tbody tr', { hasText: texto })
  await expect(fila).toBeVisible({ timeout: 10_000 })
  return fila
}

test.describe('US3 — catálogo vacío por defecto (requiere una empresa recién creada, no la compartida)', () => {
  test('T034: una empresa recién creada tiene el catálogo de permisos vacío', async ({ browser }) => {
    const admin = adminSupabaseClient()
    const { correo } = await crearEmpresaConAdmin(admin, { nombre: `Empresa Permisos T034 ${Date.now()}` })
    const session = await crearSesionParaUsuario(correo)

    const context = await browser.newContext()
    await inyectarSesion(context, session, process.env.SUPABASE_URL!)
    const page = await context.newPage()

    await page.goto('/admin/tipos-permiso')
    await esperarHidratacion(page)

    await expect(page.getByText('Sin permisos que mostrar.')).toBeVisible()
    await expect(page.locator('[data-testid="permisos-tabla"] tbody tr')).toHaveCount(1)

    await context.close()
  })
})

test.describe('US3 — Administrador gestiona catálogo de permisos aplicables', () => {
  test.use({ storageState: 'tests/e2e/.auth/admin.json' })

  test('T035: alta con clave autogenerada, nombre y tipo (Estatal o Federal)', async ({ page }) => {
    const nombre = `Verificación Físico-Mecánica T035 ${Date.now()}`

    await page.goto('/admin/tipos-permiso')
    await esperarHidratacion(page)
    await abrirDialogo(page, page.getByTestId('nuevo-btn'))
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByTestId('autogenerar-clave-btn').click()
    await expect(page.getByLabel('Clave', { exact: true })).toHaveValue(normalizarClave(nombre))
    await page.getByLabel('Tipo', { exact: true }).click({ force: true })
    await page.getByRole('option', { name: 'Estatal' }).click()
    await page.getByTestId('submit-btn').click()

    const fila = await buscarFila(page, nombre)
    await expect(fila).toContainText('Estatal')
  })

  test('T036: alta rechazada por clave duplicada dentro de la misma empresa', async ({ page }) => {
    const clave = `t036_${Date.now()}`

    await page.goto('/admin/tipos-permiso')
    await esperarHidratacion(page)

    await abrirDialogo(page, page.getByTestId('nuevo-btn'))
    await page.getByLabel('Nombre', { exact: true }).fill(`Permiso Original T036 ${Date.now()}`)
    await page.getByLabel('Clave', { exact: true }).fill(clave)
    await page.getByLabel('Tipo', { exact: true }).click({ force: true })
    await page.getByRole('option', { name: 'Federal' }).click()
    await page.getByTestId('submit-btn').click()
    await buscarFila(page, clave)

    await abrirDialogo(page, page.getByTestId('nuevo-btn'))
    await page.getByLabel('Nombre', { exact: true }).fill(`Permiso Duplicado T036 ${Date.now()}`)
    await page.getByLabel('Clave', { exact: true }).fill(clave)
    await page.getByLabel('Tipo', { exact: true }).click({ force: true })
    await page.getByRole('option', { name: 'Estatal' }).click()
    await page.getByTestId('submit-btn').click()

    await expect(page.getByText(/ya existe un registro con esa clave/i)).toBeVisible()
    await expect(page.getByTestId('submit-btn')).toBeVisible()
  })

  test('T037: la búsqueda por nombre y por clave filtra el listado', async ({ page }) => {
    const nombre = `Permiso Búsqueda T037 ${Date.now()}`
    const clave = `t037_${Date.now()}`

    await page.goto('/admin/tipos-permiso')
    await esperarHidratacion(page)
    await abrirDialogo(page, page.getByTestId('nuevo-btn'))
    await page.getByLabel('Nombre', { exact: true }).fill(nombre)
    await page.getByLabel('Clave', { exact: true }).fill(clave)
    await page.getByLabel('Tipo', { exact: true }).click({ force: true })
    await page.getByRole('option', { name: 'Estatal' }).click()
    await page.getByTestId('submit-btn').click()

    await page.getByLabel('Buscar por nombre o clave', { exact: true }).fill(nombre)
    await expect(page.getByTestId('permisos-tabla').getByText(nombre)).toBeVisible({ timeout: 10_000 })

    await page.getByLabel('Buscar por nombre o clave', { exact: true }).fill('')
    await page.getByLabel('Buscar por nombre o clave', { exact: true }).fill(clave)
    await expect(page.getByTestId('permisos-tabla').getByText(nombre)).toBeVisible({ timeout: 10_000 })
  })

  test('T038: edición de un permiso existente (incluidos clave y tipo)', async ({ page }) => {
    const nombreOriginal = `Editable T038 ${Date.now()}`
    const nombreEditado = `${nombreOriginal} (editado)`
    const claveEditada = `editado_t038_${Date.now()}`

    await page.goto('/admin/tipos-permiso')
    await esperarHidratacion(page)
    await abrirDialogo(page, page.getByTestId('nuevo-btn'))
    await page.getByLabel('Nombre', { exact: true }).fill(nombreOriginal)
    await page.getByTestId('autogenerar-clave-btn').click()
    await page.getByLabel('Tipo', { exact: true }).click({ force: true })
    await page.getByRole('option', { name: 'Estatal' }).click()
    await page.getByTestId('submit-btn').click()

    const fila = await buscarFila(page, nombreOriginal)
    await abrirDialogo(page, fila.getByTestId('editar-btn'))
    await page.getByLabel('Nombre', { exact: true }).fill(nombreEditado)
    await page.getByLabel('Clave', { exact: true }).fill(claveEditada)
    await page.getByLabel('Tipo', { exact: true }).click({ force: true })
    await page.getByRole('option', { name: 'Federal' }).click()
    await page.getByTestId('submit-btn').click()

    const filaEditada = await buscarFila(page, claveEditada)
    await expect(filaEditada).toContainText('Federal')
  })

  test('T039: eliminar un permiso asignado a un vehículo muestra el mensaje de bloqueo y no lo elimina', async ({
    page
  }) => {
    const admin = adminSupabaseClient()
    const nombreUnico = `En Uso T039 ${Date.now()}`
    const claveUnica = `enuso_t039_${Date.now()}`

    await page.goto('/admin/tipos-permiso')
    await esperarHidratacion(page)
    await abrirDialogo(page, page.getByTestId('nuevo-btn'))
    await page.getByLabel('Nombre', { exact: true }).fill(nombreUnico)
    await page.getByLabel('Clave', { exact: true }).fill(claveUnica)
    await page.getByLabel('Tipo', { exact: true }).click({ force: true })
    await page.getByRole('option', { name: 'Estatal' }).click()
    await page.getByTestId('submit-btn').click()
    const fila = await buscarFila(page, claveUnica)

    // Vehículos (003) no existe todavía — se siembra directo vía service_role, mismo
    // patrón que tests/e2e/usuarios.spec.ts T073 / tipos-vehiculo.spec.ts T018.
    const { data: permiso } = await admin
      .from('permisos')
      .select('id, empresa_id')
      .eq('clave', claveUnica)
      .single()
    const { data: tipo } = await admin
      .from('tipos_vehiculo')
      .select('id')
      .eq('empresa_id', permiso!.empresa_id)
      .eq('clave', 'ligero')
      .single()
    const { data: vehiculo, error: vehiculoError } = await admin
      .from('vehiculos')
      .insert({
        empresa_id: permiso!.empresa_id,
        marca: 'Marca T039',
        modelo: 'Modelo T039',
        placa: `T039-${Date.now()}`,
        tipo_vehiculo_id: tipo!.id
      })
      .select('id')
      .single()
    expect(vehiculoError).toBeNull()
    const { error: asignacionError } = await admin.from('vehiculo_permisos').insert({
      empresa_id: permiso!.empresa_id,
      vehiculo_id: vehiculo!.id,
      permiso_id: permiso!.id
    })
    expect(asignacionError).toBeNull()

    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('catalogo-error')).toContainText(
      'No se puede eliminar: hay vehículos con este permiso asignado'
    )
    await expect(page.getByTestId('permisos-tabla').getByText(nombreUnico)).toBeVisible()
  })

  test('T040: eliminar un permiso sin asignaciones lo quita del listado sin error', async ({ page }) => {
    const nombreUnico = `Eliminable T040 ${Date.now()}`

    await page.goto('/admin/tipos-permiso')
    await esperarHidratacion(page)
    await abrirDialogo(page, page.getByTestId('nuevo-btn'))
    await page.getByLabel('Nombre', { exact: true }).fill(nombreUnico)
    await page.getByTestId('autogenerar-clave-btn').click()
    await page.getByLabel('Tipo', { exact: true }).click({ force: true })
    await page.getByRole('option', { name: 'Federal' }).click()
    await page.getByTestId('submit-btn').click()
    const fila = await buscarFila(page, nombreUnico)

    await fila.getByTestId('eliminar-btn').click()
    await page.getByTestId('dialogo-eliminar-confirmar').click()

    await expect(page.getByTestId('permisos-tabla').getByText(nombreUnico)).not.toBeVisible()
  })
})
