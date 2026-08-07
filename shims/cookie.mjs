// Shim de interop CJS→ESM para el paquete `cookie` (dependencia de @supabase/ssr).
//
// `cookie` es CJS puro sin `exports` map. Cuando Vite lo sirve vía `@fs/` en dev sin pasar
// por su optimizador (@nuxtjs/supabase transpila su runtime como código fuente, así que
// nunca entra al pre-bundle normal), el interop CJS→ESM en caliente es inconsistente entre
// runtimes: en el navegador falla "does not provide an export named 'parse'" (ni named ni
// default import funcionan sobre el archivo CJS crudo sin `__esModule` reconocido en ese
// modo), y en el runtime SSR de dev (vite-node) un intento distinto fallaba con
// "parse is not a function". `optimizeDeps.include` tampoco lo resolvió (confirmado:
// 'cookie' nunca aparece en node_modules/.cache/vite/client/deps/_metadata.json pese al
// include).
//
// Fix definitivo: `cookie-bundled.mjs` es un ESM real y estático (generado una vez con
// esbuild, no en caliente) — sin ninguna ambigüedad de interop porque ya no hay nada CJS
// que interpretar en tiempo de ejecución. Ver package.json script `build:cookie-shim` para
// regenerarlo si `cookie` cambia de versión:
//   npx esbuild node_modules/cookie/dist/index.js --bundle --format=esm --platform=neutral --outfile=shims/cookie-bundled.mjs
import cookiePkg from './cookie-bundled.mjs'

export const parse = cookiePkg.parse
export const serialize = cookiePkg.serialize
