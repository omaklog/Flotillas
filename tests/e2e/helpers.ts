import type { Page } from '@playwright/test'

/**
 * Nuxt es SSR: el HTML llega funcional-looking antes de que Vue termine de hidratar. Si se
 * interactúa con un formulario antes de que la hidratación reconcilie su estado reactivo
 * (que sigue vacío), un evento de hidratación tardío puede resetear campos ya llenados —
 * incluso después de haber verificado su valor, si el reset ocurre justo después de esa
 * verificación (probado: reintentar fill()/toHaveValue() da falsos positivos aquí).
 *
 * `waitForLoadState('networkidle')` tampoco sirve como señal: el WebSocket de HMR de Vite
 * mantiene la red activa indefinidamente en dev, así que a veces nunca se resuelve.
 *
 * `app.vue` expone `data-hydrated="true"` en el `<v-app>` raíz una vez que `onMounted` corrió
 * (que solo pasa en cliente, después de que la hidratación terminó) — es una señal real, no
 * una heurística.
 */
export async function esperarHidratacion(page: Page) {
  await page.waitForSelector('[data-hydrated="true"]', { timeout: 15_000 })
}
