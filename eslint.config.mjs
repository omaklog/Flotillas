// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import prettierConfig from 'eslint-config-prettier'

export default withNuxt(
  {
    // Generado con esbuild (yarn build:cookie-shim), no código propio — ver shims/cookie.mjs.
    // supabase/.temp/ lo genera `supabase start` (edge runtime local), no está versionado.
    ignores: ['shims/cookie-bundled.mjs', 'supabase/.temp/**']
  },
  {
    rules: {
      // Constitución §1: TypeScript estricto, sin `any` implícito.
      '@typescript-eslint/no-explicit-any': 'error'
    }
  },
  prettierConfig
)
