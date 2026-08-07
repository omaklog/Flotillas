import { defineConfig, devices } from '@playwright/test'

// Sesiones pre-autenticadas por rol (research.md R10): tests/e2e/global-setup.ts (T024)
// siembra usuarios de prueba vía service_role y guarda un storageState por rol aquí.
const STORAGE_STATE_DIR = 'tests/e2e/.auth'

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3030',
    trace: 'on-first-retry'
  },

  projects: [
    {
      name: 'superusuario',
      use: {
        ...devices['Desktop Chrome'],
        storageState: `${STORAGE_STATE_DIR}/superusuario.json`
      }
    },
    {
      name: 'admin',
      use: {
        ...devices['Desktop Chrome'],
        storageState: `${STORAGE_STATE_DIR}/admin.json`
      }
    },
    {
      name: 'operario',
      use: {
        ...devices['Desktop Chrome'],
        storageState: `${STORAGE_STATE_DIR}/operario.json`
      }
    },
    {
      // Flujos sin sesión previa: login, recuperación de contraseña, alta de empresa.
      name: 'anonimo',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ],

  webServer: {
    command: 'yarn dev',
    // `port` (no `url`): el healthcheck de `url` exige una respuesta 2xx, pero `/` sin
    // sesión redirige a `/login`, que en fases tempranas del proyecto puede no existir
    // todavía (404) — eso lo dejaría esperando el timeout completo aunque el servidor sí
    // esté arriba. `port` solo confirma que el proceso escucha, sin depender del estado
    // de las rutas de la app.
    port: 3030,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
})
