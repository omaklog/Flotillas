// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import prettierConfig from 'eslint-config-prettier'

export default withNuxt(
  {
    // Generado con esbuild (yarn build:cookie-shim), no código propio — ver shims/cookie.mjs.
    // supabase/.temp/ lo genera `supabase start` (edge runtime local), no está versionado.
    // supabase/functions/** corre en Deno (globals `Deno.*`, imports `npm:`/`jsr:`), un runtime
    // aparte del tsconfig de Node de este proyecto (specs/012-alertas-dashboard/tasks.md T039)
    // — se verifica por separado con `deno check`, no con este ESLint.
    ignores: ['shims/cookie-bundled.mjs', 'supabase/.temp/**', 'supabase/functions/**']
  },
  {
    rules: {
      // Constitución §1: TypeScript estricto, sin `any` implícito.
      '@typescript-eslint/no-explicit-any': 'error'
    }
  },
  prettierConfig
)
