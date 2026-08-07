# Research: Autenticación, Configuración Inicial, Usuarios y Permisos

Este es el primer feature del proyecto: no hay código previo, así que estas decisiones fijan el
bootstrap técnico completo, no solo lo específico de auth/usuarios/permisos.

## R1 — Versión de Nuxt

**Decision**: Nuxt 4 (última versión estable 4.x).

**Rationale**: Nuxt 3 llega a fin de vida el 31 de julio de 2026 (hoy: 5 de agosto de 2026) — deja
de recibir parches de seguridad. Nuxt 4 es estable desde julio de 2025 y es una versión de
"refinamiento" sobre Nuxt 3 (misma API mental, nueva convención de carpeta `app/`), no una
reescritura. Como el proyecto arranca de cero, no hay costo de migración. La constitución
(`.specify/memory/constitution.md`) se actualizó de "Nuxt 3" a "Nuxt 4" como parte de este plan,
con el visto bueno del usuario.

**Alternatives considered**: Nuxt 3 — rechazado por EOL inminente/ya alcanzado, sin justificación
para empezar hoy un proyecto nuevo sobre una versión sin soporte.

## R2 — Integración con Supabase

**Decision**: módulo `@nuxtjs/supabase` (community module oficial del equipo Supabase para Nuxt).

**Rationale**: Maneja sesión SSR-friendly (cookies, refresh automático de JWT), expone
composables (`useSupabaseClient`, `useSupabaseUser`) que ya respetan RLS porque usan la
`anon key` + JWT del usuario — evita reinventar el manejo de sesión a mano con
`@supabase/supabase-js` puro. Es la opción con menor superficie de código propio, alineado con la
prioridad de "simplicidad operativa" de la constitución.

**Alternatives considered**: `@supabase/supabase-js` directo + composables propios — más control,
pero reimplementa manejo de cookies/sesión SSR que el módulo ya resuelve; se descarta por
complejidad innecesaria para un equipo de un desarrollador.

## R3 — Integración con Vuetify

**Decision**: `vuetify-nuxt-module` (módulo oficial de Vuetify para Nuxt).

**Rationale**: Zero-config, detecta SSR automáticamente, permite configurar el tema (colores,
tipografía, radios) vía `vuetify.config.ts` — encaja directo con los tokens ya extraídos en
`docs/design-system.md`. Es el módulo mantenido por el propio equipo de Vuetify.

**Alternatives considered**: Integración manual de Vuetify como plugin de Vue — descartada por
requerir configuración manual de SSR/hidratación que el módulo ya resuelve.

## R4 — PWA

**Decision**: `@vite-pwa/nuxt`.

**Rationale**: Módulo oficial para generar manifest + service worker en proyectos Nuxt/Vite,
mandatado por la constitución ("obligatorio que la aplicación funcione como PWA instalable").
Confirmado compatible con Nuxt 4.

**Alternatives considered**: Ninguna evaluada — es la opción estándar del ecosistema Nuxt/Vite
para PWA, sin alternativas competitivas relevantes.

## R5 — Captcha (Cloudflare Turnstile)

**Decision**: Integración directa vía el script oficial de Cloudflare Turnstile (`<script>` +
`div` con `data-sitekey`) envuelta en un composable propio (`useTurnstile`), sin dependencia de
terceros.

**Rationale**: Turnstile no requiere SDK — es un script + callback. Los wrappers de comunidad para
Vue 3 existentes tienen mantenimiento variable (última publicación de `vue-turnstile` hace 2
años). Evitar una dependencia de mantenimiento incierto para algo que son ~30 líneas de composable
propio reduce riesgo y superficie de dependencias externas.

La verificación del token ocurre en `server/api/auth/verify-captcha.post.ts`, llamando al
endpoint `siteverify` de Cloudflare con el secret key (nunca expuesto al cliente). El login en sí
sigue pasando por `supabase.auth.signInWithPassword` en el cliente (patrón estándar del módulo
`@nuxtjs/supabase`); el captcha solo gatea que el formulario permita enviarse.

**Alternatives considered**: `vue-turnstile` (paquete npm) — descartado por antigüedad de
mantenimiento y porque agrega una dependencia para algo trivial de implementar directo.

## R6 — Envío de correo

**Decision**: confirmado en `spec.md` — dos mecanismos, un solo proveedor SMTP (Resend) detrás de
ambos.
- Correos nativos de Supabase Auth (recuperación de contraseña, cambio de correo): Custom SMTP
  configurado en el dashboard de Supabase (fuera del código de la aplicación).
- Invitaciones y notificaciones propias: Nodemailer desde `server/api/`, usando
  `admin.generateLink` de la API de administración de Supabase (requiere `service_role`, solo
  server-side) para obtener el enlace seguro, y plantillas HTML propias con el sistema de diseño
  del proyecto (`docs/design-system.md`).

**Rationale**: Resend expone un relay SMTP estándar, por lo que Nodemailer no queda acoplado al
proveedor — cambiarlo después es solo cambiar credenciales, no código.

## R7 — Manejo de estado en el cliente

**Decision**: composables de Nuxt (`useState`) para sesión/usuario/permisos en caché; sin Pinia.

**Rationale**: El estado a manejar en esta feature es acotado (usuario actual, permisos del
usuario actual, empresa activa) — `useState` de Nuxt ya provee estado reactivo compartido
SSR-safe sin dependencia adicional. Agregar Pinia sería una abstracción prematura para el alcance
actual, en contra del principio de simplicidad operativa de la constitución.

**Alternatives considered**: Pinia — descartado por ahora; si el estado del cliente crece en
features posteriores (ej. filtros complejos de reportes), puede reconsiderarse en ese momento.

## R8 — Mecanismo de bitácora de auditoría

**Decision**: triggers de PostgreSQL sobre las tablas `empresas`, `usuarios` y `permisos`, que
insertan en una tabla `auditoria` (usuario que ejecuta la acción vía `auth.uid()`, entidad, acción,
`to_jsonb(OLD)`/`to_jsonb(NEW)`, timestamp).

**Rationale**: La constitución exige que toda creación/edición/eliminación/cancelación quede
auditada. Implementarlo vía trigger de base de datos (no en el código de `server/api/`) garantiza
que no se pueda omitir por un bug o un nuevo endpoint que se le olvide llamar al logger — es
consistente con el enfoque de la constitución de que RLS (y por extensión la integridad de datos)
es la línea principal de defensa, no una capa de aplicación opcional.

**Alternatives considered**: Logging manual en cada endpoint de `server/api/` — descartado por ser
fácil de omitir accidentalmente en un endpoint nuevo.

## R9 — Modelo de estado de invitación

**Decision**: no se crea una tabla `invitaciones` separada, y `public.usuarios` no lleva una
columna de texto tipo "estado" — solo `activo boolean` (ya definido así en `schema.sql`). El
estado "Pendiente"/"invitado" que ve el administrador en la UI se **deriva** de los campos nativos
de Supabase Auth (`invited_at` no nulo, `email_confirmed_at` nulo), combinado con
`usuarios.activo` para "activo"/"inactivo".

**Rationale**: Supabase Auth ya trackea el ciclo de vida de la invitación (enviada, aceptada) a
nivel de `auth.users`. Duplicar ese estado en una columna propia añade una fuente de verdad
redundante que puede desincronizarse — confirmado por el propio `schema.sql` (`docs/schema-reference/`),
que tampoco tiene esa columna. Reenviar invitación = volver a llamar
`admin.generateLink`/reenviar correo, no un nuevo registro.

**Alternatives considered**: Tabla `invitaciones` con expiración propia — descartada por
redundante frente al estado que Supabase Auth ya mantiene.

## R10 — Estrategia de pruebas Playwright multi-rol

**Decision**: Playwright con un `global-setup` que, vía `service_role`, siembra usuarios de
prueba para los tres roles (superusuario, admin, operario) y realiza login programático una vez
por rol, guardando `storageState` por rol. Los specs de cada historia de usuario se agrupan en
proyectos de Playwright (`projects` en `playwright.config.ts`) que cargan el `storageState`
correspondiente al rol que necesitan probar.

**Rationale**: Evita repetir el flujo de login por UI en cada test (lento, y duplica la
responsabilidad del test de login). Permite escribir directamente pruebas de "operario NO puede
hacer X" (mandatadas por la constitución para toda tabla con RLS) sin volver a autenticar en cada
caso.

**Alternatives considered**: Login por UI en cada test — descartado por lentitud y duplicación
innecesaria del camino de login ya cubierto por sus propios tests.

## R11 — Modelo de datos de permisos granulares

**Decision**: se adopta tal cual el modelo ya diseñado en `docs/schema-reference/schema_02_permisos.sql`
y `schema_03_ver_y_defaults.sql` (no el modelo UUID que se había propuesto en una versión anterior
de este documento): catálogo `modulos` (`clave` text PK, 16 filas fijas ya seedeadas), catálogo
`acciones_disponibles` (`modulo_clave`, `accion`, qué acciones aplica cada módulo — no todos
soportan las mismas), y `usuario_permisos` (`usuario_id`, `modulo_clave`, `accion`,
`otorgado_por`) como fuente de verdad que consultan las políticas RLS vía la función
`private.tiene_permiso(modulo, accion)`. Es un modelo **por presencia de fila**, no por columna
booleana `otorgado`: la fila existe = permiso otorgado. `accion = 'todos'` es un comodín para
"módulo completo". Los defaults al crear un operario (ver en todos los módulos operativos excepto
`usuarios`/`configuracion`, crear en `combustible`/`mantenimiento`/`checklist`/`archivos`) los
aplica un trigger (`otorgar_permisos_default_operario`) ya escrito en `schema_03_ver_y_defaults.sql`.

**Rationale**: Es el modelo que el usuario ya diseñó y validó en una sesión previa (con el propio
"Claude en la web"), incluyendo la función `tiene_permiso()` que las políticas RLS de los módulos
de negocio (fuera de esta feature) ya usan. Reinventar un modelo distinto (UUID + columna
`otorgado` boolean) solo generaría dos diseños incompatibles para el mismo problema.

**Alternatives considered**: Modelo UUID normalizado con `modulo_id`/`accion_id`/`otorgado
boolean` (propuesta original de este documento) — descartado por duplicar trabajo ya hecho y por
no ser compatible con las políticas RLS que `schema_02_permisos.sql` ya define contra
`modulo_clave`/`accion` como texto. Permisos como JSONB en la fila de `usuarios` — descartado
porque dificulta las políticas RLS y complica el historial de auditoría por cambio individual.

## R12 — `empresas.activo` no existe en `schema.sql` v1

**Decision**: agregar `empresas.activo boolean not null default true` en una migración propia de
esta feature, aplicada después de `docs/schema-reference/schema.sql`, junto con
`ALTER TYPE accion_auditoria ADD VALUE 'desactivar'`/`'reactivar'`.

**Rationale**: `schema.sql` (v1, marcado explícitamente como "pendiente de refinar" por su autor)
no incluye ningún mecanismo para desactivar una empresa, pero US7/FR-006/FR-007/FR-008 lo
requieren. No es una contradicción con el esquema existente — es una extensión que faltaba,
consistente con la convención ya usada en `usuarios.activo` (boolean, no un enum de texto).

**Alternatives considered**: Reutilizar alguna combinación existente (ej. borrar la empresa) —
descartado explícitamente por FR-006 ("sin eliminar sus datos ni su historial").
