// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  devServer: {
    port: 3030
  },

  // `cookie` (dependencia de @supabase/ssr, vía @nuxtjs/supabase) es CJS puro sin `exports`
  // map (`exports.parse = ...`). @nuxtjs/supabase transpila su runtime como código fuente
  // (build.transpile), así que ese import no pasa por el pre-bundle normal de Vite; se sirve
  // crudo vía `@fs/` en dev, y el interop CJS→ESM nativo del navegador solo expone un
  // default export, no los named exports que @supabase/ssr espera
  // (`import { parse } from 'cookie'`) — revienta la hidratación con "does not provide an
  // export named 'parse'". `optimizeDeps.include` no resolvió esto (confirmado: 'cookie'
  // nunca aparece en node_modules/.cache/vite/client/deps/_metadata.json pese al include).
  // Fix robusto: alias a un shim propio (shims/cookie.mjs) que fuerza el interop a mano.
  alias: {
    cookie: fileURLToPath(new URL('./shims/cookie.mjs', import.meta.url))
  },

  css: ['~/assets/css/main.css'],

  modules: ['vuetify-nuxt-module', '@nuxtjs/supabase', '@vite-pwa/nuxt', '@nuxt/eslint'],

  // TypeScript estricto (constitución §1: sin `any` implícito).
  typescript: {
    strict: true
  },

  // El guard de rutas propio (app/middleware/auth.ts) es la única fuente de verdad
  // para redirecciones por sesión/rol — se desactiva el redirect automático del módulo.
  // url/key explícitos porque el proyecto usa SUPABASE_URL/SUPABASE_ANON_KEY (ver
  // .env.example) en vez de los nombres NUXT_PUBLIC_SUPABASE_* que espera el módulo por defecto.
  supabase: {
    redirect: false,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY
  },

  // Constitución §1: PWA instalable obligatoria. Íconos en public/icons/ son placeholder
  // (color primario de docs/design-system.md) hasta que exista un logo de app definitivo.
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Flotillas — Gestión de Flotilla de Vehículos',
      short_name: 'Flotillas',
      description: 'Sistema de gestión de flotilla de vehículos',
      theme_color: '#03224d',
      background_color: '#f8f9fa',
      display: 'standalone',
      start_url: '/',
      icons: [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: '/icons/icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico}']
    },
    devOptions: {
      enabled: true
    }
  },

  runtimeConfig: {
    // Server-only: nunca se envían al bundle del cliente. Se leen explícitamente de
    // process.env (no del auto-mapeo NUXT_* de Nuxt) para respetar los nombres de
    // variable ya documentados en .env.example.
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    turnstileSecretKey: process.env.TURNSTILE_SECRET_KEY,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    public: {
      // Expuesto al cliente.
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY
    }
  }
})
