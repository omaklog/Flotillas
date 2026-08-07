---

description: "Task list for Feature 001 — Autenticación, Configuración Inicial, Usuarios y Permisos"
---

# Tasks: Autenticación, Configuración Inicial, Usuarios y Permisos

**Input**: Design documents from `/specs/001-auth-config-usuarios/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada regla
de negocio explícita en `spec.md` y, como mínimo, una prueba de caso negativo por cada tabla con
RLS — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md), en el mismo orden de
prioridad ahí definido (P1 → P2 → P3).

**Esquema de base de datos**: T010–T014 aplican, en orden, los 4 archivos ya diseñados en
`docs/schema-reference/` (`schema.sql`, `schema_02_permisos.sql`, `schema_03_ver_y_defaults.sql`,
`schema_04_indices.sql`) como migraciones de Supabase, más una migración propia de esta feature
con lo que esos archivos no cubren todavía (`empresas.activo`, extensión del enum
`accion_auditoria`). Ver `data-model.md` para el detalle campo por campo.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1–US10, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend), según `plan.md`:
`app/`, `server/`, `supabase/`, `tests/e2e/` en la raíz del repo.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bootstrap del proyecto — no existe código todavía, este es el primer feature.

- [X] T001 Inicializar el proyecto Nuxt 4 en la raíz del repo (preservando `docs/`, `specs/`, `.specify/`, `CLAUDE.md` ya existentes)
- [X] T002 Instalar y registrar en `nuxt.config.ts` las dependencias core: `vuetify-nuxt-module`, `@nuxtjs/supabase`, `@vite-pwa/nuxt`, `nodemailer`
- [X] T003 [P] Configurar TypeScript estricto en `nuxt.config.ts`/`tsconfig.json` (constitución §1: sin `any` implícito)
- [X] T004 [P] Configurar ESLint/Prettier para el proyecto
- [X] T005 Configurar `vuetify.config.ts` con los tokens de `docs/design-system.md` (colores, tipografía Inter, radios, spacing)
- [X] T006 Inicializar proyecto Supabase local (`supabase init`, `supabase start`) y conectar `@nuxtjs/supabase` en `nuxt.config.ts` (puertos desplazados +100 en `supabase/config.toml` para no chocar con el proyecto hermano `control-contable`; API en `54421`, DB en `54422`, Studio en `54423`, Inbucket en `54424`)
- [X] T007 [P] Configurar `playwright.config.ts` con el esqueleto de `projects` por rol (superusuario/admin/operario)
- [X] T008 [P] Configurar manifest de `@vite-pwa/nuxt` (nombre, íconos, colores de tema) en `nuxt.config.ts` — íconos placeholder generados en `public/icons/` (color primario del sistema de diseño; pendiente de logo real)
- [X] T009 Crear `.env.example` documentando `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` — en local usa las site/secret keys de prueba de Cloudflare Turnstile y el puerto SMTP de Inbucket (`supabase/config.toml`) en vez de credenciales reales de Resend
- [ ] T010 Configurar Custom SMTP de Supabase Auth (dashboard: Authentication → Emails → SMTP Settings) con las credenciales de Resend de `.env` (FR-031 — sin esto, la recuperación de contraseña de US3 falla en cualquier ambiente real por el límite de 2 correos/hora del SMTP por defecto de Supabase; ver `quickstart.md` Prerequisites) — **diferida**: requiere un proyecto Supabase hospedado + cuenta real de Resend, ninguno existe todavía; en local, Inbucket ya captura los correos nativos de Supabase Auth sin necesidad de Custom SMTP

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema de base de datos, RLS base, utilidades de servidor y layout compartido que
todas las historias necesitan.

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [X] T011 Aplicar `docs/schema-reference/schema.sql` como migración Supabase (`supabase migration new initial_schema`) — tablas base (`empresas`, `usuarios`, catálogos, `cargas_combustible`, `mantenimientos`, `auditoria`, etc.) con RLS ya incluido en el archivo. **Reordenado al aplicar** (no en el archivo de referencia): las funciones `private.*` referenciaban `usuarios` antes de que la tabla existiera; se movieron las tablas `empresas`/`usuarios` desnudas antes de las funciones, y sus políticas RLS después — ver nota al inicio de la migración aplicada
- [X] T012 Aplicar `docs/schema-reference/schema_02_permisos.sql` como migración (`supabase migration new modulos_y_permisos`) — catálogos `modulos` (16 filas ya seedeadas) y `acciones_disponibles`, tabla `usuario_permisos`, función `private.tiene_permiso()`, políticas RLS ya incluidas en el archivo
- [X] T013 Aplicar `docs/schema-reference/schema_03_ver_y_defaults.sql` como migración (`supabase migration new permisos_ver_y_defaults`) — SELECT granular por `tiene_permiso('<modulo>','ver')` y trigger `otorgar_permisos_default_operario`
- [X] T014 Aplicar `docs/schema-reference/schema_04_indices.sql` como migración (`supabase migration new indices_v1`)
- [X] T015 Migración propia de esta feature: `alter table public.empresas add column activo boolean not null default true;` + `alter type accion_auditoria add value 'desactivar'; alter type accion_auditoria add value 'reactivar';` + políticas RLS/triggers de auditoría sobre `empresas.activo` y `usuarios.activo` (ver `data-model.md` "Extensiones sobre schema.sql" y `research.md` R12) — **incluye políticas RLS explícitas**, no solo el `alter table`. También: `auditoria.usuario_id` pasó a nullable (el schema real lo tenía `NOT NULL`, incompatible con escrituras `service_role` sin actor conocido) y se agregó `private.actor_id()` con la convención `set_config('app.actor_id', ...)` para cuando `auth.uid()` no aplica. Probado end-to-end: insertar/desactivar una empresa de prueba generó las filas de auditoría esperadas (`crear`, `desactivar`)

**Pausa sugerida (constitución §5)**: 5 tareas de migración completadas (T011–T015). Revisar
`supabase db reset` limpio antes de seguir con las utilidades de servidor/cliente.

- [X] T016 [P] Implementar `server/utils/supabaseAdmin.ts` (cliente `service_role`, solo importado dentro de `server/api/`) — nota importante dejada en el archivo: `set_config('app.actor_id', ...)` para atribuir auditoría NO puede fijarse en una llamada `.rpc()` separada de la escritura (cada llamada de supabase-js es su propia transacción vía PostgREST); los endpoints que necesiten atribuir el actor deben usar una función Postgres que haga `set_config` + la escritura en la misma llamada
- [X] T017 [P] Implementar `server/utils/mailer.ts` (transporte Nodemailer sobre SMTP de Resend, plantilla base con tokens de `docs/design-system.md`) — probado end-to-end contra Mailpit local (el correo de prueba llegó al buzón)
- [X] T018 [P] Implementar `app/composables/useAuth.ts` (sesión/usuario actual sobre `@nuxtjs/supabase`)
- [X] T019 [P] Implementar `app/composables/usePermisos.ts` (permisos del usuario actual vía `usuario_permisos`, sin caché de sesión — se reconsulta en cada navegación)
- [X] T020 [P] Implementar `app/composables/useTurnstile.ts` (carga del script de Cloudflare Turnstile y render del widget)

**Pausa sugerida (constitución §5)**: 5 tareas más completadas (T016–T020, 10 en total). Revisar
antes de continuar con el guard de rutas y los layouts.

- [X] T021 Implementar `app/middleware/auth.ts` (guard de rutas: exige sesión, redirige según `usuarios.rol`, y verifica `usuarios.activo`/`empresas.activo` en **cada navegación** — no solo en el login — cerrando la sesión con `signOut()` + mensaje explícito si alguno es `false`; esto es lo que cumple la Assumption de spec.md "las sesiones se cortan en la siguiente solicitud autenticada") — implementado como `app/middleware/auth.global.ts` (sufijo `.global`, no `auth.ts`) para que toda página nueva quede protegida por default salvo que se declare pública explícitamente
- [X] T022 [P] Implementar layouts `app/layouts/default.vue`, `app/layouts/superusuario.vue`, `app/layouts/admin.vue` — incluyó actualizar `app/app.vue` con el `<v-app>` raíz que Vuetify requiere (no estaba en ninguna tarea explícita, pero los layouts no funcionan sin eso)
- [X] T023 Documentar/sembrar el superusuario inicial en `supabase/seed.sql` (alta manual, fuera de la UI — ver Assumptions en spec.md) — probado end-to-end: login real contra el endpoint de Auth devolvió un access_token válido
- [X] T024 Implementar `tests/e2e/global-setup.ts`: siembra usuarios de prueba por rol vía `service_role` y guarda `storageState` por rol — la sesión se inyecta reconstruyendo manualmente la cookie que usa `@supabase/ssr` (no hay página de login todavía para hacerlo por UI); documentado en el archivo como intencionalmente frágil ante actualizaciones de esa librería. Validado con prueba real: sin cookie el servidor responde `302` a `/login`, con la cookie inyectada responde `200`

**Nota fuera de tasks.md**: se agregó `.gitignore` local (Playwright genera `test-results/`, `playwright-report/`, `tests/e2e/.auth/`, no cubiertos por el `.gitignore` del repo padre).

**Checkpoint**: Fundación lista — las historias de usuario pueden empezar.

---

## Phase 3: User Story 1 - Superusuario da de alta una nueva empresa (Priority: P1) 🎯 MVP

**Goal**: El superusuario puede crear una empresa junto con su primer administrador, que recibe
una invitación por correo.

**Independent Test**: Iniciar sesión como superusuario, completar el formulario de alta, verificar
que se crea la empresa, el usuario administrador y se dispara el correo de invitación.

### Tests for User Story 1

- [X] T025 [P] [US1] Playwright: alta exitosa de empresa + administrador en `tests/e2e/empresas.spec.ts`
- [X] T026 [P] [US1] Playwright: alta rechazada por RFC duplicado (409) en `tests/e2e/empresas.spec.ts`
- [X] T027 [P] [US1] Playwright: un rol distinto a superusuario NO puede acceder a la pantalla ni al endpoint de alta de empresa en `tests/e2e/empresas.spec.ts`
- [X] T028 [P] [US1] Playwright: flujo completo de invitación — abrir el enlace de invitación del administrador recién creado, establecer contraseña, iniciar sesión exitosamente — en `tests/e2e/empresas.spec.ts` (cubre SC-003; el mismo mecanismo de aceptación se reutiliza sin test propio en US5/US8, que solo prueban la parte de creación/estado, no el flujo de aceptación completo otra vez) — completada al cerrar US3 (requería `restablecer-password.vue`, T043). El correo se obtiene vía la REST API de Mailpit local (`GET /api/v1/messages` + `/api/v1/message/{ID}`, campo `HTML`) extrayendo el `<a href>` con regex. Encontró y corrigió dos bugs reales (no solo de test): (1) `supabase/config.toml` — `site_url`/`additional_redirect_urls` apuntaban al puerto 3000 por defecto, no al 3030 real del proyecto, así que GoTrue descartaba `redirectTo` y mandaba los enlaces a un puerto sin nada escuchando; (2) `restablecer-password.vue` — `@supabase/ssr`'s `createBrowserClient` fuerza `flowType: 'pkce'` (hardcodeado, no configurable), pero `admin.generateLink()` siempre genera enlaces de flujo implícito (tokens en el hash de la URL) — GoTrue descartaba el hash en silencio (`AuthPKCEGrantCodeExchangeError`, solo va a debug-log) y `detectSessionInUrl`/`getSession()` nunca veían la sesión; fix: parsear `window.location.hash` a mano y usar `client.auth.setSession()`, que no pasa por esa validación. También: `browser.newContext()` sin `storageState` explícito hereda el `storageState` del proyecto de Playwright activo (gotcha real de Playwright, no obvio) — el test debe pasar `{ cookies: [], origins: [] }` para un contexto verdaderamente anónimo.

### Implementation for User Story 1

- [X] T029 [US1] Implementar `server/api/empresas/index.post.ts` (transaccional: crea empresa + usuario admin + `admin.generateLink`, ver `contracts/empresas.md`) — acción compensatoria (borra la empresa) si falla el paso de `auth.admin`, no es una transacción de BD real
- [X] T030 [P] [US1] Implementar `app/components/empresas/FormularioAltaEmpresa.vue`
- [X] T031 [US1] Implementar `app/pages/superusuario/empresas/nueva.vue`
- [X] T032 [P] [US1] Implementar plantilla `server/utils/emails/invitacion-administrador.ts` (reutilizada también por US8)

**Hallazgos técnicos de esta fase (afectan todas las historias siguientes, no solo US1)**:
- **Bug real en `@nuxtjs/supabase`**: `useSupabaseUser()`/`serverSupabaseUser()` devuelven el JWT
  decodificado (`getClaims()`), no el `User` clásico — el id del usuario viene en `.sub`, no en
  `.id`. Como `JwtPayload` declara `[key: string]: any`, el type-check NO detecta el error si se
  usa `.id` por costumbre. Ya corregido en `useAuth.ts`, `auth.global.ts` y
  `server/api/empresas/index.post.ts` — **cualquier código nuevo que lea el usuario autenticado
  debe usar `.sub`**, no `.id`.
- **Bug de Nitro**: los `data` personalizados de `createError()` quedan anidados bajo
  `body.data.*` en la respuesta JSON, no en la raíz del body (`body.error` es siempre el booleano
  `true` que pone Nitro, no el código de error propio).
- **Bug de dev server (Vite 8.2 + `@nuxtjs/supabase`)**: `cookie` (dependencia de `@supabase/ssr`)
  es CJS sin `exports` map; al transpilar `@nuxtjs/supabase` como código fuente en vez de
  pre-bundlearlo, el interop CJS→ESM en caliente falla de forma diferente en cliente y en SSR dev
  (`vite-node`). `optimizeDeps.include` no lo resolvió. Fix: `shims/cookie.mjs` +
  `shims/cookie-bundled.mjs` (generado una vez con esbuild, `yarn build:cookie-shim`), aliasado
  globalmente en `nuxt.config.ts`. Regenerar el bundle si `cookie` cambia de versión.
- **Convención de test Playwright para apps SSR**: llamar `await page.waitForLoadState('networkidle')`
  después de `page.goto()` y antes de interactuar con formularios — si Playwright llena campos
  antes de que Vue termine de hidratar, la hidratación resetea el valor al reconciliar contra el
  estado reactivo (que sigue vacío). Aplicar en toda prueba nueva que llene un formulario.
- **Convención de ejecución de tests**: los archivos de esta suite fijan el rol con
  `test.use({ storageState: ... })` explícito por describe/test, así que correrlos contra los 4
  proyectos de `playwright.config.ts` a la vez es redundante y generó un flake por contención (4
  workers contra un solo dev server). Ejecutar con `--project=<uno>` durante desarrollo; los 4
  proyectos existen para cuando otras suites sí dependan del `storageState` por defecto del
  proyecto.

**Checkpoint**: US1 funcional y probado de forma independiente (T025–T028 en verde).

---

## Phase 4: User Story 2 - Inicio de sesión (Priority: P1) 🎯 MVP

**Goal**: Cualquier usuario activo puede iniciar sesión con correo + contraseña + captcha y llega
a la página principal de su rol.

**Independent Test**: Con una cuenta activa (sembrada en Foundational), probar login correcto,
incorrecto, con empresa desactivada, y con captcha sin resolver.

### Tests for User Story 2

- [X] T033 [P] [US2] Playwright: login exitoso redirige a la home del rol correspondiente en `tests/e2e/auth.spec.ts`
- [X] T034 [P] [US2] Playwright: credenciales incorrectas muestran mensaje genérico y permiten reintentar en `tests/e2e/auth.spec.ts`
- [X] T035 [P] [US2] Playwright: empresa con `activo = false` bloquea el login con mensaje explícito en `tests/e2e/auth.spec.ts` — corre en modo serial junto a T033/T034/T036 porque desactiva/reactiva la empresa E2E compartida
- [X] T036 [P] [US2] Playwright: el formulario no se envía si el captcha no está resuelto en `tests/e2e/auth.spec.ts`

### Implementation for User Story 2

- [X] T037 [US2] Implementar `server/api/auth/verify-captcha.post.ts` (ver `contracts/auth.md`)
- [X] T038 [US2] Implementar `app/pages/login.vue` (correo + contraseña + Turnstile + `signInWithPassword`)
- [X] T039 [US2] Añadir verificación post-login de `empresas.activo`/`usuarios.activo` en `app/pages/login.vue` (si `false`: `signOut()` + mensaje explícito) — implementado junto con T038 (usa `signInData.user.id` de la respuesta del login directamente, ver hallazgo de timing abajo, no el `usuario` reactivo de `useAuth()`)
- [X] T040 [P] [US2] Implementar páginas de inicio por rol: `app/pages/superusuario/index.vue`, `app/pages/admin/index.vue`, `app/pages/operario/index.vue`

**Hallazgo grande de esta fase — señal determinista de hidratación**: durante T033 se encontró que
los reintentos de `fill()`/`toHaveValue()` (la estrategia de US1) podían dar **falso positivo**:
un evento de hidratación tardío resetea TODOS los campos ya llenados de una vez, incluso después
de haber verificado su valor individualmente. Después de descartar varias hipótesis equivocadas
(interop de eventos de `.fill()`, versión de Vuetify — se probó bajar a 3.13.0 y no cambió nada,
se revirtió a `latest`), la causa real era la carrera de hidratación general, no algo específico
de Vuetify ni del método de tecleo. Fix definitivo: `app/app.vue` ahora expone
`data-hydrated="true"` en el `<v-app>` raíz una vez que `onMounted` corre (señal real, no
heurística), y `tests/e2e/helpers.ts` expone `esperarHidratacion(page)` que espera ese atributo
antes de tocar cualquier formulario. **Se reemplazó `fillHidratado` (usado en US1) por este
mecanismo** — ambos archivos de test ahora usan `esperarHidratacion()` + `fill()` normal.

**Otro hallazgo**: `signInWithPassword()` resuelve antes de que el listener `onAuthStateChange`
del plugin de `@nuxtjs/supabase` actualice `useSupabaseUser()` — usar el `usuario` reactivo de
`useAuth()` inmediatamente después de iniciar sesión puede leer estado viejo. `login.vue` usa
`signInData.user.id` (de la respuesta directa del login) para la consulta del perfil, no el ref
reactivo.

**Checkpoint**: US1 + US2 funcionales — ya existe un camino completo de alta + acceso (MVP operativo mínimo).

---

## Phase 5: User Story 3 - Recuperar contraseña (Priority: P2)

**Goal**: Un usuario puede solicitar recuperación de contraseña sin que el sistema revele si el
correo existe.

**Independent Test**: Solicitar recuperación con un correo existente y uno inexistente; comparar
el mensaje mostrado.

### Tests for User Story 3

- [X] T041 [P] [US3] Playwright: mensaje de confirmación idéntico exista o no la cuenta en `tests/e2e/auth.spec.ts`

### Implementation for User Story 3

- [X] T042 [US3] Implementar `app/pages/recuperar-password.vue` (`supabase.auth.resetPasswordForEmail`) — requiere T010 (Custom SMTP) ya configurado, o los correos no llegarán en ningún ambiente real
- [X] T043 [US3] Implementar `app/pages/restablecer-password.vue` (callback del enlace, define nueva contraseña) — la sesión de recuperación/invitación se detecta vía `onAuthStateChange` (no se asume que `useSupabaseUser()` ya esté poblado al montar: `detectSessionInUrl` de `@supabase/ssr` resuelve el hash/código de forma asíncrona)

**Checkpoint**: US1–US3 funcionales de forma independiente.

---

## Phase 6: User Story 4 - Configuración inicial de la empresa (Priority: P2)

**Goal**: El administrador completa/edita los datos de configuración de su empresa.

**Independent Test**: Como administrador, editar cada campo de configuración y verificar que
persiste; cambiar unidad y verificar que no se altera nada fuera de la fila de `empresas`.

### Tests for User Story 4

- [X] T044 [P] [US4] Playwright: administrador edita configuración de empresa y los cambios persisten en `tests/e2e/empresas.spec.ts`
- [X] T045 [P] [US4] Playwright: cambiar unidad de distancia/combustible no reescribe otros campos de la empresa en `tests/e2e/empresas.spec.ts` (validación completa contra registros históricos de combustible/mantenimiento se cubre en la feature de esos módulos, cuando existan)

### Implementation for User Story 4

- [X] T046 [US4] Implementar `server/api/empresas/[id]/index.patch.ts` (actualización de configuración: nombre, rfc, teléfonos, correo, unidad_distancia, unidad_combustible, pais, moneda — distinto del PATCH de `activo` de US7; documentar este endpoint en `contracts/empresas.md` antes de implementar). Escribe con el cliente de la sesión del usuario (no service_role) — RLS de `empresas_update` decide si procede (superusuario, o admin de esa empresa), así la auditoría atribuye la fila vía `auth.uid()` sin necesitar el mecanismo de `set_config('app.actor_id', ...)`. `.single()` sin filas (RLS excluye) → 403 genérico, no 404 (no revela existencia).
- [X] T047 [US4] Implementar `app/pages/admin/configuracion.vue` (carga la empresa propia vía `usuario.empresa_id`, sube logo a Storage antes del PATCH). De paso corrigió un bug real en `FormularioAltaEmpresa.vue` (US1): leía `err.data?.error` para el código de error de `$fetch`, pero Nitro anida el payload de `createError({data})` bajo `data.data`, no en la raíz (`err.data` es el body completo: `{error: true, ..., data: {...}}`) — confirmado con una llamada real al endpoint. El mensaje amigable de "RFC duplicado" nunca se mostraba en la UI, solo el genérico; ahora usa `err.data?.data?.error` en ambos formularios.
- [X] T048 [P] [US4] Configurar bucket de Supabase Storage + políticas para logos de empresa (validación de tipo/tamaño) en `supabase/migrations/` — bucket `logos-empresas` creado vía `insert into storage.buckets` (no vía `[storage.buckets.*]` de config.toml, que solo aplica al `supabase start` local y no se reproduce con `supabase db push` en producción). Público (2 MiB, png/jpeg/webp), políticas de `storage.objects` scoped por `(storage.foldername(name))[1] = private.empresa_id()`.

**Checkpoint**: US1–US4 funcionales de forma independiente.

---

## Phase 7: User Story 5 - Administrador invita a un operario (Priority: P2)

**Goal**: El administrador invita operarios a su empresa, con permisos mínimos por defecto.

**Independent Test**: Invitar un operario y verificar que queda "Pendiente" con los permisos por
defecto ya otorgados (por el trigger `otorgar_permisos_default_operario`, no por lógica del
endpoint).

### Tests for User Story 5

- [X] T049 [P] [US5] Playwright: invitar operario crea usuario con permisos por defecto correctos — `ver` en módulos operativos excepto Usuarios/Configuración, `crear` en combustible/mantenimiento/checklist/archivos — en `tests/e2e/usuarios.spec.ts`
- [X] T050 [P] [US5] Playwright: operario invitado se muestra como "Pendiente" en el listado en `tests/e2e/usuarios.spec.ts`

### Implementation for User Story 5

- [X] T051 [US5] Implementar `server/api/usuarios/index.post.ts` (ver `contracts/usuarios.md`). Igual que T046: escribe el INSERT de `usuarios` con el cliente de la sesión del admin (RLS de `usuarios_insert`), no service_role — atribuye la auditoría correctamente y deja que el trigger `otorgar_permisos_default_operario` (dispara igual, no depende de RLS) otorgue los permisos. service_role solo para `auth.admin.createUser`/`generateLink` (sin equivalente RLS). Gotcha real: Nitro/rollup cachea una resolución de import fallida si el archivo importado (`invitacion-operario.ts`) no existe todavía en el momento en que el dev server indexa el archivo que lo importa — reintentar la request no lo arregla, hace falta reiniciar el dev server (tocar el archivo no bastó).
- [X] T052 [P] [US5] Implementar `app/components/usuarios/FormularioInvitarOperario.vue`
- [X] T053 [US5] Implementar `app/pages/admin/usuarios/index.vue` (listado base: nombre + estado derivado). El estado "Pendiente" vive en `auth.users.email_confirmed_at`, no expuesto vía PostgREST — se agregó la función `security definer` `public.listar_operarios_propios()` (migración `20260807020000`, mismo patrón que `private.empresa_id()`/`private.rol()`) que hace el join `usuarios`↔`auth.users` y escopea a la empresa propia del que llama; regenerados `app/types/database.types.ts` (`supabase gen types typescript --local`) para tipar la RPC.
- [X] T054 [P] [US5] Implementar plantilla `server/utils/emails/invitacion-operario.ts`

**Checkpoint**: US1–US5 funcionales de forma independiente.

---

## Phase 8: User Story 6 - Administrador asigna permisos granulares a un operario (Priority: P2)

**Goal**: El administrador otorga/retira permisos por módulo y acción a un operario, con efecto
inmediato.

**Independent Test**: Abrir la pantalla de permisos de un operario, cambiar un permiso, verificar
que el operario ve el efecto sin volver a iniciar sesión.

### Tests for User Story 6

- [X] T055 [P] [US6] Playwright: `ver`/`crear` aparecen premarcados por defecto según el trigger; `editar`/`eliminar` no en `tests/e2e/permisos.spec.ts`. Gotcha: `data-testid` de un `v-checkbox` queda en el `<div class="v-input">` envolvente, no en el `<input type="checkbox">` real — `toBeChecked()` exige apuntar al input anidado (`.locator('input[type="checkbox"]')`), si no falla con "Not a checkbox or radio button".
- [X] T056 [P] [US6] Playwright: cambio de permiso se refleja en la sesión activa del operario sin reautenticar en `tests/e2e/permisos.spec.ts`. Probado a nivel RLS real (no UI): un único cliente autenticado como el operario E2E (login una sola vez) inserta un archivo, intenta borrarlo (falla, RLS exige `archivos.eliminar`), el admin otorga el permiso vía la API, y el MISMO cliente/JWT (sin reautenticar) vuelve a intentar el borrado — ahora procede. Es la señal más rigurosa disponible de "efecto inmediato sin caché", ya que `private.tiene_permiso()` se evalúa en cada query, no en el JWT.

### Implementation for User Story 6

- [X] T057 [US6] Implementar `server/api/usuarios/[id]/permisos.put.ts` (diff contra `usuario_permisos`, ver `contracts/usuarios.md`). Mismo patrón que T046/T051: escribe con el cliente de la sesión del admin (RLS de `usuario_permisos_write`), no service_role. Valida cada `(modulo_clave, accion)` contra `acciones_disponibles` (o `modulo_clave` contra `modulos` si `accion = 'todos'`) antes de aplicar el diff.
- [X] T058 [US6] Implementar `app/pages/admin/permisos/[id].vue` (pantalla dedicada, 16 módulos de `modulos`). Se agregó un enlace "Permisos" por fila en `app/pages/admin/usuarios/index.vue` (US5) para poder llegar a esta pantalla desde el listado — no estaba explícito en T053 pero sin él la pantalla quedaba inalcanzable desde la UI.
- [X] T059 [P] [US6] Implementar `app/components/permisos/TablaPermisosModulo.vue` (lee `acciones_disponibles` por módulo, incluye opción "todos")

**Checkpoint**: US1–US6 funcionales de forma independiente — cubre todo el flujo P1+P2.

---

## Phase 9: User Story 7 - Superusuario administra empresas existentes (Priority: P3)

**Goal**: El superusuario busca, revisa y desactiva empresas existentes.

**Independent Test**: Con al menos dos empresas, buscar por nombre/RFC y desactivar una.

### Tests for User Story 7

- [X] T060 [P] [US7] Playwright: búsqueda de empresas por nombre y por RFC en `tests/e2e/empresas.spec.ts`. Gotcha: `clearable` en el `v-text-field` de búsqueda agrega un botón cuyo `aria-label` ("Clear ...") también matchea `getByLabel` por substring — hay que usar `getByRole('textbox', {name})` para no ambigüar.
- [X] T061 [P] [US7] Playwright: desactivar empresa (`activo = false`, vía el endpoint real) y notifica a sus administradores en `tests/e2e/empresas.spec.ts` — usa una empresa propia y desechable, no la "Empresa E2E" compartida (T027/T044/T045, en el mismo archivo, corren en paralelo y dependen de que esa empresa siga activa — desactivarla, aunque sea un instante, les cierra la sesión a media request vía el `cerrarSesion()` del middleware). El bloqueo de login en sí ya lo cubre T035 (auth.spec.ts) exhaustivamente. De paso, `rfcUnico()` se subió de dentro del describe de US1 a nivel de módulo del archivo para poder reutilizarla aquí.

### Implementation for User Story 7

- [X] T062 [US7] Implementar `server/api/empresas/[id]/estado.patch.ts` (ver `contracts/empresas.md`). No necesita service_role para nada: RLS de `empresas_update` ya deja a cualquier superusuario escribir cualquier empresa, y `usuarios_select` leer sus administradores — todo con el cliente de la sesión de quien llama.
- [X] T063 [US7] Implementar `app/pages/superusuario/empresas/index.vue` (listado + búsqueda + detalle: administradores activos, fecha de alta). Incluye el botón activar/desactivar (no estaba explícito en la descripción de la tarea, pero FR-006 lo requiere y no hay otra pantalla que lo cubra).
- [X] T064 [P] [US7] Implementar plantilla `server/utils/emails/empresa-desactivada.ts`

**Checkpoint**: US1–US7 funcionales de forma independiente.

---

## Phase 10: User Story 8 - Superusuario gestiona administradores de una empresa (Priority: P3)

**Goal**: El superusuario invita administradores adicionales o revoca el acceso de uno existente.

**Independent Test**: Sobre una empresa existente, invitar un segundo administrador y luego
revocar el acceso de uno de los dos.

### Tests for User Story 8

- [X] T065 [P] [US8] Playwright: invitar administrador adicional a una empresa existente en `tests/e2e/empresas.spec.ts`
- [X] T066 [P] [US8] Playwright: revocar al último administrador activo de una empresa se rechaza (guard rail) en `tests/e2e/usuarios.spec.ts`

### Implementation for User Story 8

- [X] T067 [US8] Implementar `server/api/empresas/[id]/administradores.post.ts` (ver `contracts/empresas.md`). Escribe el INSERT con el cliente de la sesión del superusuario (RLS de `usuarios_insert` no restringe `rol` para la rama `es_superusuario()`), no service_role — reutiliza la plantilla `invitacion-administrador.ts` ya existente de US1.
- [X] T068 [US8] Implementar `server/api/usuarios/[id]/estado.patch.ts` (compartido con US9 — ver `contracts/usuarios.md`). RLS de `usuarios_update` ya distingue "admin solo puede escribir filas con `rol='operario'`" vs "superusuario sin esa restricción" a nivel de `WITH CHECK`, pero es más permisiva que el contrato (que exige además que el superusuario SOLO toque administradores, nunca operarios) — esa regla extra se valida a mano en el endpoint. Guard rail del último administrador: cuenta `usuarios` activos con `rol='admin'` de esa empresa antes de permitir `activo:false`.
- [X] T069 [US8] Implementar `app/pages/superusuario/empresas/[id]/administradores.vue`. Se agregó un enlace "Administradores" por fila en `app/pages/superusuario/empresas/index.vue` (US7) para llegar aquí desde el listado (mismo criterio que el enlace "Permisos" de US6).

**Checkpoint**: US1–US8 funcionales de forma independiente.

---

## Phase 11: User Story 9 - Administrador gestiona operarios existentes (Priority: P3)

**Goal**: El administrador busca, desactiva, reenvía invitación o elimina operarios (con guard de
integridad referencial).

**Independent Test**: Con operarios en distintos estados, desactivar uno, reenviar invitación a
otro, e intentar eliminar uno con y sin operaciones registradas.

### Tests for User Story 9

- [X] T070 [P] [US9] Playwright: búsqueda de operarios por nombre y visualización de estado en `tests/e2e/usuarios.spec.ts`
- [X] T071 [P] [US9] Playwright: desactivar operario (`activo = false`) bloquea su login y conserva su historial en `tests/e2e/usuarios.spec.ts`. Contraseña asignada directo vía service_role (`updateUserById`), no vía el flujo de invitación completo (ya cubierto por T028) — solo hacía falta un operario que SÍ pudiera iniciar sesión, para probar que dejar de poder es un efecto real de la desactivación.
- [X] T072 [P] [US9] Playwright: reenviar invitación a un operario pendiente genera un nuevo enlace en `tests/e2e/usuarios.spec.ts`
- [X] T073 [P] [US9] Playwright: eliminar un operario con operaciones registradas se rechaza y ofrece desactivar (FR-024) en `tests/e2e/usuarios.spec.ts`. Sin UI/API de checklists todavía, se siembra el registro dependiente a mano vía service_role solo para ejercer el guard.
- [X] T074 [P] [US9] Playwright: eliminar un operario sin operaciones registradas sí procede en `tests/e2e/usuarios.spec.ts`

**Pausa sugerida (constitución §5)**: 5 tareas de test completadas (T070–T074, todas deben fallar
antes de implementar). Revisar antes de pasar a la implementación.

### Implementation for User Story 9

- [X] T075 [US9] Implementar `server/api/usuarios/[id]/reenviar-invitacion.post.ts` (ver `contracts/usuarios.md`). Reutiliza la plantilla `invitacion-operario.ts` de US5, sin plantilla nueva.
- [X] T076 [US9] Implementar `server/api/usuarios/[id]/index.delete.ts` (guard de integridad referencial; sin módulos de negocio propios todavía, dejar el punto de extensión documentado para cuando existan combustible/mantenimiento/checklist). Solo revisa `cargas_combustible.creado_por`, `mantenimientos.creado_por` y `checklists.responsable_id` — `servicios_obligatorios` (que el contrato/spec sí menciona) NO tiene ninguna columna que referencie `usuarios` en `schema.sql`, así que no hay nada que revisar ahí todavía; documentado como punto de extensión si se agrega esa columna después. `usuarios.auth_user_id` tiene `on delete cascade` desde `auth.users`, así que un solo `admin.auth.admin.deleteUser(...)` basta (arrastra la fila de `public.usuarios` y sus `usuario_permisos`).
- [X] T077 [US9] Extender `app/pages/admin/usuarios/index.vue` con búsqueda y acciones (desactivar/reenviar/eliminar) — depende de T053. La búsqueda ya existía desde T053; se agregaron los botones de acción por fila.
- [X] T078 [P] [US9] Implementar `app/components/usuarios/DialogoConfirmarEliminarOperario.vue`

**Checkpoint**: US1–US9 funcionales de forma independiente.

---

## Phase 12: User Story 10 - Cierre de sesión (Priority: P3)

**Goal**: Cualquier usuario puede cerrar su sesión explícitamente desde el menú de perfil.

**Independent Test**: Con cada uno de los tres roles, usar "Cerrar sesión" y verificar el
redireccionamiento a login.

### Tests for User Story 10

- [X] T079 [P] [US10] Playwright: cerrar sesión funciona para los tres roles en `tests/e2e/auth.spec.ts`

### Implementation for User Story 10

- [X] T080 [US10] Implementar `app/components/AppMenuPerfil.vue` (opción "Cerrar sesión")
- [X] T081 [US10] Integrar el menú de perfil en los layouts (`default.vue`, `admin.vue`, `superusuario.vue`) — depende de T022. `default.vue` (usado también por las páginas públicas de login/recuperación) muestra el app-bar+menú solo si `usuario` no es null — antes no tenía ninguna forma de cerrar sesión para el rol operario (usaba ese layout "sin navegación" tal cual).

**Checkpoint**: Las 10 historias de usuario funcionan de forma independiente.

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Validación final transversal a toda la feature.

- [X] T082 [P] Ejecutar manualmente los 5 escenarios de `quickstart.md`. Escenario 1 corrido a mano en el navegador de punta a punta (login → alta de empresa → correo de invitación en Mailpit, verificado visualmente); escenarios 2–5 ya cuentan con equivalentes automatizados que corren contra la app real (no mocks): T061+T035 (empresa desactivada), T049/T050/T055/T056 (invitar operario + permisos), T073/T074 (eliminar vs. desactivar), T041 (recuperación sin enumeración). El recorrido manual del Escenario 1 encontró el bug real documentado en T083.
- [X] T083 [P] Auditoría de accesibilidad WCAG 2.1 AA en formularios de login, alta de empresa y permisos. Verificado con cálculo real de contraste (no estimado) para cada combinación color/texto del tema: **2 fallos reales corregidos** — (1) `on-warning` (blanco sobre `warning` #fb8c00) daba ~2.37:1, muy por debajo del mínimo de 4.5:1 para texto — afecta el chip "Pendiente"; corregido a `#3a1f00` (~6.43:1); de paso también `on-info` (no usado hoy, mismo problema, corregido preventivamente). (2) **2.4.7 Focus Visible**: verificado con teclado real en el navegador que `v-btn` y los `<a>` normales no mostraban ningún indicador de foco visible (los campos de texto sí, vía el cambio de borde de Vuetify) — agregado `:focus-visible { outline: 2px solid }` global en `main.css`, verificado de nuevo con captura de pantalla que ahora sí aparece. (3) Al verificar visualmente también apareció un bug no relacionado a contraste: los navigation drawers de `admin.vue`/`superusuario.vue` usaban `theme="dark"`, que en este proyecto (solo se define un tema `light`) cae al tema oscuro **por defecto** de Vuetify (azul genérico ajeno a la marca) en lugar de nuestros propios tokens — corregido quitando `theme="dark"` (con solo `color="primary"` Vuetify ya usa `on-primary` como texto).
- [X] T084 [P] Verificar ausencia de datos fiscales/contraseñas en logs de `server/api/` (constitución §3). No hay ninguna llamada `console.*` en todo `server/` (grep confirmado) — no hay logs de ningún tipo, y ningún endpoint refleja el body crudo de la request en sus mensajes de error.
- [X] T085 Confirmar cobertura 100% de pruebas RLS con caso negativo en `empresas`, `usuarios`, `usuario_permisos` (constitución §4). No existía ningún test que golpeara RLS directo (bypaseando `server/api/`, que en varios endpoints usa `service_role` y por lo tanto no ejercita RLS en absoluto) — se agregó `tests/e2e/rls.spec.ts` con 3 casos negativos reales: admin no puede leer/escribir una empresa ajena, admin no puede leer usuarios de otra empresa, operario no puede insertar en `usuario_permisos` directamente (solo vía el endpoint PUT). Las 3 pasaron al primer intento — RLS ya estaba bien configurada, solo faltaba la prueba.
- [X] T086 [P] Prueba de instalación PWA (manifest + service worker) en viewport de escritorio y móvil. **Bug real encontrado y corregido**: faltaba el componente `<VitePwaManifest />` en `app.vue` — sin él, `@vite-pwa/nuxt` nunca inyecta el `<link rel="manifest">` en el HTML (confirmado con curl: el JSON se servía bien en `/manifest.webmanifest`, pero ninguna página lo referenciaba, así que ningún navegador podía detectar la app como instalable). Corregido y verificado con un build de producción real (`yarn build` + `node .output/server/index.mjs`): manifest linkeado, `sw.js`/`workbox-*.js` servidos como archivos estáticos genuinos (200 OK), los 3 íconos (192/512/maskable) accesibles. Nota: en modo dev, `/sw.js` da 302 a `/login` porque cae en el middleware de auth como ruta no encontrada — es un artefacto conocido de dev-mode del propio `@vite-pwa/nuxt` (el dev-SW no es representativo de instalabilidad real); la build de producción es la señal que importa y esa sí es correcta.
- [X] T087 Limpieza de código y páginas placeholder que hayan quedado de fases anteriores. Encontrado y quitado: botón "Cerrar sesión" duplicado en `app/pages/operario/index.vue` (redundante desde que US10 agregó `AppMenuPerfil` al layout `default.vue`). Verificado que no quedan comentarios `TODO`/`FIXME`/referencias a tareas ya completadas en `app/`/`server/`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede iniciar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea todas las historias de usuario.
- **User Stories (Phase 3–12)**: todas dependen de Foundational. Dentro de esa restricción,
  pueden avanzar en paralelo o en el orden de prioridad P1→P2→P3 mostrado.
- **Polish (Phase 13)**: depende de las historias de usuario que se decida incluir en el alcance
  de esta entrega.

### User Story Dependencies

- **US1, US2 (P1)**: sin dependencia de otras historias — son el MVP.
- **US3 depende de T010** (Custom SMTP configurado) — sin eso, sus pruebas pasan pero los correos
  reales nunca llegan fuera de local.
- **US3–US6 (P2)**: sin dependencia dura entre sí; US6 asume que US5 ya puede invitar operarios
  para tener a quién asignarle permisos (comparten datos de prueba, no código).
- **US7, US8 (P3)**: US8 reutiliza el endpoint `estado.patch.ts` que también usa US9 (T068); si se
  implementa US9 primero, T068 puede moverse ahí sin cambiar el contrato.
- **US9 (P3)**: reutiliza el listado base creado en US5 (T053) — extiende, no reemplaza.
- **US10 (P3)**: depende de los layouts de Foundational (T022); independiente de las demás
  historias.

### Parallel Opportunities

- Todas las tareas [P] de Setup pueden correr en paralelo (excepto T010, que depende de que
  `.env.example`/credenciales de T009 ya estén definidas).
- T016–T020 y T022 de Foundational pueden correr en paralelo (archivos distintos); T011–T015
  (migraciones) son secuenciales entre sí — cada una depende de la anterior, tal como indican los
  encabezados de los propios archivos SQL.
- Una vez completa Foundational, US1 y US2 (ambas P1) pueden trabajarse en paralelo por
  desarrolladores distintos.
- Todos los tests Playwright marcados [P] dentro de una misma historia pueden escribirse/correr en
  paralelo.

---

## Parallel Example: User Story 1

```bash
# Tests de User Story 1 en paralelo:
Task: "Playwright: alta exitosa de empresa + administrador en tests/e2e/empresas.spec.ts"
Task: "Playwright: alta rechazada por RFC duplicado en tests/e2e/empresas.spec.ts"
Task: "Playwright: rol no-superusuario no puede acceder a alta de empresa en tests/e2e/empresas.spec.ts"

# Implementación de User Story 1 en paralelo (una vez el endpoint T029 existe):
Task: "Implementar app/components/empresas/FormularioAltaEmpresa.vue"
Task: "Implementar server/utils/emails/invitacion-administrador.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Completar Phase 1: Setup (incluye T010, Custom SMTP).
2. Completar Phase 2: Foundational (crítico — bloquea todo lo demás; T011–T015 aplican el esquema
   real de `docs/schema-reference/` en orden).
3. Completar Phase 3 (US1) y Phase 4 (US2).
4. **STOP y VALIDAR**: con esas dos historias ya existe un ciclo completo alta de empresa → login.
   Es el MVP mínimo funcional de todo el proyecto (nada más puede probarse sin esto).
5. Continuar con US3–US6 (P2) para tener una empresa realmente operable (config, invitar
   operarios, permisos).
6. US7–US10 (P3) son gestión continua — pueden entregarse después sin bloquear el uso del sistema.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. US1 + US2 → demo: alta de empresa + login (MVP).
3. US3–US6 → demo: empresa completamente configurable y operable con equipo de operarios.
4. US7–US9 → demo: gestión continua de empresas/administradores/operarios.
5. US10 → cierre de sesión (bajo riesgo, puede ir en cualquier punto después de Foundational).

### Parallel Team Strategy

Con más de un desarrollador: completar Setup + Foundational en conjunto: luego un desarrollador
puede tomar US1+US2 (P1) mientras otro empieza US3/US4 (P2), dado que ambos grupos solo dependen
de Foundational, no entre sí.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Las pruebas Playwright de cada historia deben escribirse y **fallar** antes de implementar (TDD
  ligero), tal como exige la constitución para reglas de negocio y políticas RLS.
- Cada historia debe quedar demostrable de forma independiente en su checkpoint.
- Confirmar antes de avanzar de fase: `npm run lint`, migraciones aplicadas limpias
  (`supabase db reset`), y la suite de Playwright de la historia en verde.
- Constitución §5: no ejecutar más de 5-8 tareas de este archivo sin revisión humana intermedia
  entre una y otra, incluso dentro de una misma fase (varias fases, como Foundational o US9,
  superan ese número de tareas).
