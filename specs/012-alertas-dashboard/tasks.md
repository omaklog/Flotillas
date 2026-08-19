---

description: "Task list for Feature 012 — Alertas y Dashboard"
---

# Tasks: Alertas y Dashboard

**Input**: Design documents from `/specs/012-alertas-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/alertas-dashboard.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada
regla de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS por
módulo de permisos afectado — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) — US1 (Job diario, P1) es
prerrequisito funcional de facto de US2 (Panel de alertas, P1): sin alertas generadas no hay
nada que listar/resolver. US3 (Dashboard, P2) es independiente de US1/US2 en el sentido de que
sus 3 KPIs/gráficas que no dependen de `alertas` (vehículos activos, mantenimiento, licencias/
pólizas por vencer, cumplimiento de checklists) leen directo de sus propias tablas — solo el KPI
"checklists sin atender" depende de que US1 ya exista. Se implementa después de US1/US2 de
todas formas, por ser P2 y por compartir el layout de "Panel de Alertas" en la barra superior
que US2 ya construye.

**Esquema de base de datos**: `public.alertas`, su enum `estado_alerta`, y su RLS
(`alertas_select`/`alertas_update`, ya con el patrón `tiene_permiso('alertas','ver'/'aprobar')`,
`ver` otorgado por defecto) **ya existen completos** desde la migración inicial de permisos del
proyecto — a diferencia de 010, aquí no hay ninguna corrección de modelo de permisos pendiente
(spec.md § Assumptions). T004-T011 aplican una única migración con: `schema_14_alertas_ajustes.sql`
(columna `fecha_vencimiento` opcional + índice único anti-duplicados), las extensiones
`pg_cron`/`pg_net`/`supabase_vault` (`pg_net`/`supabase_vault` ya están instaladas en este
entorno local, verificado vía la API de `pg-meta` — solo `pg_cron` requiere habilitarse), el
trigger de auditoría que le faltaba a `alertas` (research.md R9), y el registro de la agenda del
cron — **sin el secreto `service_role` escrito en ningún archivo versionado** (research.md R7,
T009 es un paso manual por entorno, no un archivo de migración).

**Primera Edge Function del proyecto**: `supabase/functions/generar-alertas/index.ts` (Deno,
`npm:@supabase/supabase-js@2`) — research.md R1, R4. Reachable localmente en
`${SUPABASE_URL}/functions/v1/generar-alertas` en cuanto el archivo existe y se reinicia el stack
local (`supabase stop && supabase start` — `[edge_runtime]` ya está `enabled = true` en
`config.toml`, el contenedor aparece "Stopped" en `supabase status` solo porque hoy no hay
ninguna función que servir). Si esa suposición no se cumple al verificar T019, el respaldo es
`supabase functions serve generar-alertas` en una terminal aparte durante los tests locales — no
bloquea el resto del trabajo, se ajusta ese único paso.

**Primera dependencia de gráficas**: `chart.js` + `vue-chartjs` (research.md R3) — T002.

**Referencias visuales**: `dashboard-flotilla.png` (ya descargado, `docs/design-references/`)
se reutiliza como referencia de **estilo** (tarjetas de KPI, ícono de campana en la barra
superior, layout de tarjetas + gráficas) — sus métricas exactas (consumo de combustible,
distribución de flota) NO son las de esta feature, que define su propio set de 4 KPIs + 3
gráficas + indicador de cumplimiento (spec.md US-12.3). Sin mockup nuevo.

**Lecciones de features anteriores a aplicar desde el inicio, no redescubrir**:
- **Auditoría genérica desde Foundational, no como corrección posterior** (research.md R9):
  `alertas` no tenía ningún trigger de auditoría — ni en `schema_13` (007-010) ni en lo que
  Feature 011 agregó. T007 lo corrige usando `private.registrar_auditoria()`, ya existente desde
  011 — sin función dedicada nueva.
- **El `service_role` key nunca en un archivo versionado** (research.md R7): la agenda del cron
  lee el secreto de Postgres Vault por nombre (`vault.decrypted_secrets`), nunca literal. T009
  (`vault.create_secret(...)`) es un paso manual por entorno (local/staging/producción), igual de
  criterio que las credenciales SMTP ya en `.env` (nunca committeadas) — NO es una tarea que
  produzca un archivo para el repo.
- **El correo se reutiliza, no se reimplementa en Deno** (research.md R2): la Edge Function NO
  envía correo ella misma — llama a `server/api/alertas/notificar.post.ts`, que reutiliza
  `sendMail()`/`renderEmailLayout()` (`server/utils/mailer.ts`, ya existentes desde Feature 001,
  sin cambios). Ninguna tarea de esta feature MUST agregar una librería SMTP para Deno.
- **Un fallo de correo no MUST bloquear la alerta** (FR-005, SC-002, Edge Cases — hallazgo de
  `/speckit-analyze`): la alerta ya insertada MUST seguir visible in-app en `pendiente` aunque el
  envío falle, y el fallo de UNA condición no MUST interrumpir el resto de la corrida (T017).
- **El permiso de `alertas` ya está completo** (spec.md § Assumptions) — a diferencia de 010,
  ninguna tarea de esta feature MUST tocar RLS de `alertas` ni el catálogo de
  `modulos`/`acciones_disponibles`.
- **El dashboard reemplaza rutas ya existentes, no crea nuevas** (`app/pages/admin/index.vue`,
  `app/pages/operario/index.vue`, ambas ya existen como placeholders de Feature 001) — mismo
  componente de dashboard compartido entre ambas rutas, con datos que varían solo por RLS
  (research.md R6), no por lógica distinta escrita a mano por rol.
- **Ventanas de tiempo ya resueltas** (research.md R8, Clarifications sesión 2026-08-11): 30
  días fijo para todo excepto las 2 gráficas de "mes en curso" (licencias/pólizas) — ver tabla
  completa en research.md R8 antes de escribir cada consulta.
- `supabase gen types typescript --local > archivo` **nunca** con `2>&1` después del `>` —
  corrompe el archivo con el banner del CLI.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1 = Job diario, US2 = Panel de alertas,
  US3 = Dashboard, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend), más
`supabase/functions/` (Deno, fuera del árbol de Nitro) por primera vez en el proyecto.

---

## Phase 1: Setup

- [X] T001 Agregar una entrada a `docs/design-references/screens.md` documentando que Alertas y
      Dashboard (012) reutiliza `dashboard-flotilla.png` como referencia de **estilo** (tarjetas
      de KPI, campana de notificaciones, layout de tarjetas + gráficas) — sus métricas exactas no
      son las de esta feature, que define su propio set en `spec.md` US-12.3; sin mockup nuevo
- [X] T002 [P] Agregar `chart.js` y `vue-chartjs` a `package.json` (`yarn add chart.js
      vue-chartjs`, research.md R3) — única dependencia nueva de esta feature
- [X] T003 [P] Documentar `ALERTAS_CRON_SECRET` en `.env.example` (secreto compartido entre la
      Edge Function y `server/api/alertas/notificar.post.ts`, research.md R2 — distinto del
      `service_role` key de Supabase) y agregar un valor de desarrollo a `.env` local

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema — nada de la UI ni de la Edge Function puede probarse hasta que esta fase
esté completa.

**⚠️ CRITICAL**: Ninguna tarea de implementación de US1/US2/US3 puede empezar hasta que esta fase
esté completa.

- [X] T004 Crear la migración de esta feature: `supabase migration new alertas_cron`
- [X] T005 En esa migración: aplicar el contenido literal de
      `docs/schema-reference/schema_14_alertas_ajustes.sql` (columna `fecha_vencimiento` de
      `alertas` pasa a opcional, índice único parcial `uq_alertas_abiertas` anti-duplicados)
- [X] T006 En esa misma migración: `create extension if not exists pg_cron;`, `create extension
      if not exists pg_net;`, `create extension if not exists supabase_vault;` (research.md R7 —
      `if not exists` hace estas dos últimas no-op seguro en este entorno, ya instaladas)
- [X] T007 En esa misma migración: `create or replace function private.registrar_auditoria()`
      restaurando la rama `UPDATE→'editar'` (con `valores_antes`/`valores_despues` poblados) que
      la versión de Feature 011 no tenía — verificado que `usuario_permisos`, su único llamador
      actual, nunca hace `update`, así que el cambio no le afecta (research.md R9, corrección);
      luego `create trigger trg_alertas_auditoria after insert or update on public.alertas for
      each row execute function private.registrar_auditoria();` (gap encontrado, `alertas` no
      tenía ningún trigger de auditoría)
- [X] T008 En esa misma migración: registrar la agenda diaria con `select cron.schedule(
      'generar-alertas-diario', '0 6 * * *', $$ select net.http_post(url :=
      '<url>/functions/v1/generar-alertas', headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where
      name = 'edge_functions_service_role_key'), 'Content-Type', 'application/json')) $$);` —
      **MUST NOT** escribir el valor real del `service_role` key en este archivo (research.md
      R7); solo la referencia por nombre al secreto de Vault. La URL en local MUST usar el
      nombre del contenedor de Kong en la red Docker (`http://supabase_kong_flotillas:8000/...`,
      verificado con `docker ps`) — `127.0.0.1:<puerto publicado>` no es alcanzable desde dentro
      del contenedor de Postgres, que es donde corre `pg_net`; en staging/producción MUST
      actualizarse a la URL real del proyecto, mismo criterio operativo por entorno que T009
- [X] T009 Paso manual, **no produce ningún archivo para el repo**: registrar el secreto real por
      entorno con `select vault.create_secret('<service_role key real de este entorno>',
      'edge_functions_service_role_key');` — ejecutar contra la base de datos local ahora (SQL
      Editor de Supabase Studio o `psql`), y repetir el mismo paso manualmente contra
      staging/producción cuando corresponda (research.md R7, mismo criterio que las credenciales
      SMTP ya en `.env`, nunca committeadas)
- [X] T010 Aplicar la migración en local (`supabase migration up`) y verificar manualmente:
      `pg_cron`/`pg_net`/`supabase_vault` quedan habilitadas; `select * from cron.job;` muestra
      la tarea `generar-alertas-diario` agendada; un `update` sobre una fila de prueba de
      `alertas` genera una fila en `auditoria` con `accion='editar'`
- [X] T011 [P] Regenerar `app/types/database.types.ts`
      (`supabase gen types typescript --local > app/types/database.types.ts`, **sin** `2>&1`) —
      la columna `alertas.fecha_vencimiento` cambia de `not null` a nullable

**Checkpoint**: Fundación lista — US1, US2, y US3 pueden empezar (US2 depende funcionalmente de
que US1 ya genere alertas para tener algo que mostrar; US3 es independiente de ambas salvo por su
KPI de checklists).

---

## Phase 3: User Story 1 - Detección diaria de vencimientos y notificación (Priority: P1) 🎯 MVP (parte 1/3)

**Goal**: Un job diario (Edge Function `generar-alertas`, disparada por `pg_cron`) escanea, sin
filtrar por empresa, licencias/pólizas/permisos/servicios obligatorios por vencer en 30 días y
checklists con observaciones, crea una alerta por condición nueva, notifica una sola vez por
correo a los administradores activos de cada empresa, y auto-resuelve alertas cuya condición ya
no aplica.

**Independent Test**: Con datos de prueba que incluyan al menos una condición de cada una de las
5 fuentes, invocar la Edge Function directamente (research.md R4) y confirmar que se crea
exactamente una alerta por condición, con su correo correspondiente; invocarla de nuevo sin
cambios y confirmar que no se duplica; hacer que una condición deje de aplicar y confirmar que su
alerta se resuelve en la siguiente invocación.

### Tests for User Story 1

- [X] T012 [P] [US1] Playwright: con un conductor, un vehículo, un permiso de vehículo, y un
      servicio obligatorio por vencer dentro de 30 días (cada uno sin alerta abierta previa),
      invocar la Edge Function y confirmar que se crean las 4 alertas correspondientes en
      `estado='enviada'`, cada una con un correo recibido por los administradores activos de esa
      empresa (Mailpit, mismo patrón que `tests/e2e/empresas.spec.ts`) (FR-001, FR-003, FR-005,
      US-12.1/AC1, AC2) en `tests/e2e/alertas.spec.ts`
- [X] T013 [P] [US1] Playwright: con un checklist `resultado='con_observaciones'` sin alerta
      abierta previa, invocar la Edge Function y confirmar que se crea una alerta tipo
      `checklist` (sin `fecha_vencimiento`) en `estado='enviada'`, con su correo correspondiente
      (FR-002, FR-003, US-12.1/AC3) en `tests/e2e/alertas.spec.ts`
- [X] T014 [P] [US1] Playwright: invocar la Edge Function una segunda vez sin cambiar ningún
      dato y confirmar que no se crea ninguna alerta nueva para las condiciones ya alertadas
      (FR-004, US-12.1/AC4) en `tests/e2e/alertas.spec.ts`
- [X] T015 [P] [US1] Playwright: con una alerta abierta cuya condición deja de aplicar (ej. se da
      de baja el vehículo de una alerta `poliza`), invocar la Edge Function y confirmar que esa
      alerta pasa a `resuelta`, sin afectar las demás alertas abiertas (FR-006, US-12.1/AC5) en
      `tests/e2e/alertas.spec.ts`
- [X] T016 [P] [US1] Playwright: con una condición nueva en una empresa sin ningún administrador
      activo, invocar la Edge Function y confirmar que la alerta se crea igual (visible in-app),
      sin que la ausencia de destinatario rompa la corrida para las demás empresas/condiciones
      (US-12.1/AC6, Edge Cases) en `tests/e2e/alertas.spec.ts`
- [X] T017 [P] [US1] Playwright: con una condición nueva cuyo administrador destinatario sí
      existe, pero el envío de correo falla (ej. interceptar la llamada a
      `/api/alertas/notificar` y forzar un error, o usar un `ALERTAS_CRON_SECRET` incorrecto
      solo para ese intento), invocar la Edge Function y confirmar que la alerta igual queda
      creada en `pendiente` (no `enviada`), y que las demás condiciones de la misma corrida se
      procesan sin verse afectadas (FR-005, SC-002, Edge Cases — hallazgo de `/speckit-analyze`)
      en `tests/e2e/alertas.spec.ts`. **Nota de implementación**: el fallo determinístico se logró
      con un administrador cuyo `correo` no tiene formato de correo válido (sembrado directo vía
      `service_role`, bypassea la validación de formulario) — `sendMail()`/Nodemailer lo rechaza
      sincrónicamente ("No recipients defined"), un fallo real, no una simulación de
      infraestructura. Se agregó además T017b (fuera de la numeración original, mismo archivo):
      `POST /api/alertas/notificar` directo con secreto incorrecto → 401, alerta sin cambios —
      cubre el otro mecanismo que tasks.md ya sugería.
      **Hallazgo de concurrencia** (ampliado tras T020): la Edge Function escanea TODOS los
      tenants en cada corrida (FR-001); dos invocaciones concurrentes de `invocarJob()` — de
      *cualquier* test de este archivo, no solo dentro de US-12.1 — pueden intercalar la fase de
      creación de una corrida con la de resolución de otra sobre datos que cambiaron a medio
      camino: desde una alerta duplicada (reproducido con `--repeat-each=2`) hasta que un test que
      "resuelve" una alerta a mano (sin desactivar también la condición de origen) la vea
      recreada por la corrida de otro test (reproducido en T020 corriendo junto al resto del
      archivo: contador esperado 2, observado 3). Fix definitivo: todo el archivo — ambas
      historias, US-12.1 y US-12.2 — corre serializado en un solo worker
      (`test.describe.configure({ mode: 'serial' })` en un `describe` que envuelve a los tres del
      archivo), mismo criterio que `empresas.spec.ts` T044/T045. No es un bug de la Edge Function
      en sí (un cron real nunca se dispara dos veces en paralelo), es un requisito de aislamiento
      de esta suite de pruebas.

### Implementation for User Story 1

- [X] T018 [P] [US1] Implementar `server/api/alertas/notificar.post.ts`: recibe `{ alertaId }`,
      exige `Authorization: Bearer <ALERTAS_CRON_SECRET>` (401 si falta/no coincide), busca la
      alerta y sus datos de origen con `service_role`, arma el correo con `renderEmailLayout()`
      y lo envía con `sendMail()` (`server/utils/mailer.ts`, sin cambios) a cada administrador
      activo de la empresa de la alerta; 200 si envió al menos uno, 204 si no había ningún
      destinatario (contracts/alertas-dashboard.md)
- [X] T019 [US1] Implementar `supabase/functions/generar-alertas/index.ts` (Deno,
      `npm:@supabase/supabase-js@2`): por cada una de las 5 fuentes (research.md R5), consulta
      las condiciones vigentes, intenta `insert` en `alertas` con `on conflict ... do nothing`
      sobre el índice único de T005, llama a `notificar.post.ts` (T018) por cada alerta
      insertada con éxito y actualiza a `enviada` **solo si esa llamada tuvo éxito** — si falla,
      la deja en `pendiente` y continúa con la siguiente condición sin abortar la corrida (FR-005,
      T017); luego resuelve automáticamente las alertas abiertas cuya condición ya no aplica
      (research.md R5, columna "condición de auto-resolución"); responde `200 { alertasCreadas,
      alertasResueltas, correosEnviados }` (data-model.md § Edge Function)
      **Verificado**: `docker restart` del contenedor `edge_runtime` NO basta para que registre
      una función nueva (`404 Function not found`) — hace falta `supabase stop && supabase start`
      completo, y ese ciclo no pudo ejecutarse en este entorno (bloqueado por permisos). Se usó el
      respaldo ya documentado, `supabase functions serve generar-alertas --env-file .env`
      (research.md R4) — DEBE quedar corriendo en una terminal aparte para correr la suite de
      Playwright de esta feature. También se encontró y corrigió que `ALERTAS_NOTIFICAR_URL`
      (`host.docker.internal:3030`) no era alcanzable porque Nitro (`yarn dev`) solo escuchaba en
      `localhost`/IPv6 — fix en `nuxt.config.ts` (`devServer.host = '0.0.0.0'`), verificado
      end-to-end (research.md R4, corrección post-implementación)

**Checkpoint**: Job diario funcional y probado de forma independiente — US2 puede empezar (ya
hay alertas que listar).

---

## Phase 4: User Story 2 - Panel de alertas in-app (Priority: P1) 🎯 MVP (parte 2/3)

**Goal**: Un usuario con permiso `ver` en `alertas` ve un contador de alertas abiertas en la
barra superior de toda la aplicación, y puede consultar/filtrar la pantalla de alertas; un
usuario con permiso `aprobar` puede además marcarlas como resueltas manualmente.

**Independent Test**: Con varias alertas ya generadas (US1) de distintos tipos y estados,
confirmar que el contador de la barra superior refleja el total de abiertas; aplicar cada filtro
por separado y confirmar que el listado muestra exactamente lo esperado; resolver una
manualmente y confirmar que el contador baja.

### Tests for User Story 2

- [X] T020 [P] [US2] Playwright: con varias alertas abiertas y una resuelta ya sembradas, el
      ícono de notificaciones de la barra superior muestra el número correcto de abiertas
      (pendiente + enviada, sin contar la resuelta) — probar tanto en el layout de administrador
      como en el de operario (FR-007, US-12.2/AC1) en `tests/e2e/alertas.spec.ts`
- [X] T021 [P] [US2] Playwright: filtrar la pantalla de alertas por tipo o por estado muestra
      únicamente las alertas que cumplen ese filtro (FR-008, US-12.2/AC2) en
      `tests/e2e/alertas.spec.ts`
- [X] T022 [P] [US2] Playwright: un administrador (o un operario con permiso `aprobar`) usa
      "Marcar como resuelta" sobre una alerta abierta y confirma que pasa a `resuelta` de
      inmediato y que el contador de la barra superior baja (FR-009, US-12.2/AC3) en
      `tests/e2e/alertas.spec.ts`
- [X] T023 [P] [US2] Playwright: un operario sin el permiso `aprobar` (permiso por defecto, solo
      `ver`) consulta la pantalla de alertas y no tiene disponible la acción de resolverlas
      (FR-010, US-12.2/AC4) en `tests/e2e/alertas.spec.ts`

### Implementation for User Story 2

- [X] T024 [P] [US2] Implementar `app/composables/useAlertas.ts`: `listar(filtros?)` (`tipo?`,
      `estado?`), `contarAbiertas()` (conteo liviano, `head: true`), `marcarResuelta(id)`
      (contracts/alertas-dashboard.md)
- [X] T025 [US2] Implementar `app/components/AppNotificacionesAlertas.vue` (ruta plana, mismo
      nivel que `AppMenuPerfil.vue` — no `app/components/app/`, ese path no sigue la convención
      real del proyecto, corrección sobre plan.md): ícono de campana con badge de
      `contarAbiertas()`, navega a la pantalla de alertas de la sección actual del usuario
      (`/admin/alertas` o `/operario/alertas` según `usuario.rol` — ver corrección de T026/T027)
      al hacer click
- [X] T026 [US2] Integrar `<AppNotificacionesAlertas />` en `app/layouts/admin.vue` y
      `app/layouts/default.vue` (junto a `<AppMenuPerfil />` — este último es el layout que ya
      usa la página de inicio del operario, spec.md § Assumptions)
- [X] T027 [US2] **Corrección sobre el plan original** (plan.md, hallazgo T026/T027):
      `app/middleware/auth.global.ts` bloquea a un operario de navegar a `/admin/**` — una sola
      página en `admin/alertas/` habría dejado inalcanzable la pantalla para un operario con
      permiso `ver` (default), incumpliendo FR-007/FR-008 para ese rol. Implementado en su lugar:
      `app/components/alertas/Panel.vue` (auto-importado `<AlertasPanel />`) con la tabla, fila de
      filtros (tipo/estado), botón "Marcar como resuelta" por fila gateado por
      `usePermisos().tienePermiso('alertas', 'aprobar')`, y paginación cliente 5/10/20 (mismo
      estilo que `app/pages/admin/auditoria/index.vue`) — montado en `app/pages/admin/alertas/
      index.vue` y `app/pages/operario/alertas/index.vue`, mismo componente compartido, sin
      lógica distinta por rol (datos y acción ya varían solo por RLS/permiso)

**Checkpoint**: Panel de alertas funcional y probado de forma independiente — US1 y US2 juntas
entregan el flujo completo de detección→notificación→seguimiento (MVP).

---

## Phase 5: User Story 3 - Dashboard principal (Priority: P2)

**Goal**: Administrador y operario ven, al iniciar sesión, un dashboard con 4 KPIs, 3 gráficas de
pastel, y un indicador de cumplimiento de checklists — cada sección reflejando solo los datos que
el permiso de su usuario le permite ver.

**Independent Test**: Con datos de prueba que cubran vehículos activos, licencias/pólizas por
vencer, mantenimientos de ambos tipos, y checklists con ambos resultados, abrir el dashboard y
confirmar que cada KPI y cada gráfica refleja los números esperados.

### Tests for User Story 3

- [X] T028 [P] [US3] Playwright: el dashboard muestra los 4 KPIs (vehículos activos, licencias
      por vencer, pólizas por vencer, checklists con observaciones sin atender) con los valores
      correctos contra datos sembrados (FR-011, US-12.3/AC1) en `tests/e2e/dashboard.spec.ts`
- [X] T029 [P] [US3] Playwright: la gráfica de mantenimiento por tipo refleja la suma de
      `costo_total` de los últimos 30 días agrupada por correctivo/preventivo, solo registros
      `activo` (FR-011, US-12.3/AC2, research.md R8) en `tests/e2e/dashboard.spec.ts`
- [X] T030 [P] [US3] Playwright: las gráficas de licencias y pólizas por vencer reflejan
      únicamente lo que vence dentro del mes calendario en curso (FR-011, US-12.3/AC3,
      research.md R8) en `tests/e2e/dashboard.spec.ts`
- [X] T031 [P] [US3] Playwright: el indicador de cumplimiento de checklists por tipo de vehículo
      refleja el % aprobado vs. con observaciones de los últimos 30 días (FR-011, US-12.3/AC4,
      research.md R8) en `tests/e2e/dashboard.spec.ts`
- [X] T032 [P] [US3] Playwright: un operario sin permiso `ver` en uno de los módulos de origen
      (ej. sin `checklist.ver`) ve esa sección del dashboard vacía/en cero, sin que rompa el
      resto de la pantalla (FR-012, US-12.3/AC5) en `tests/e2e/dashboard.spec.ts`

### Implementation for User Story 3

- [X] T033 [P] [US3] Implementar `app/composables/useDashboard.ts`: un método por sección
      (data-model.md § Consultas del dashboard) — `contarVehiculosActivos()`,
      `contarLicenciasPorVencer()`, `contarPolizasPorVencer()`, `contarChecklistsSinAtender()`,
      `montosMantenimientoPorTipo()`, `licenciasPorVencerMesActual()`,
      `polizasPorVencerMesActual()`, `cumplimientoChecklistsPorTipoVehiculo()`
- [X] T034 [US3] Implementar `app/components/dashboard/PanelPrincipal.vue`: 4 tarjetas de KPI +
      3 gráficas de pastel (Chart.js/`vue-chartjs`, colores de `docs/design-system.md`) + el
      indicador de cumplimiento; cada gráfica de pastel MUST incluir una alternativa textual
      accesible (tabla o lista de valores, constitución §4 — quickstart.md)
- [X] T035 [US3] Reemplazar el contenido de `app/pages/admin/index.vue` y
      `app/pages/operario/index.vue` por `<DashboardPanelPrincipal />` (mismo componente
      compartido, spec.md § Assumptions — sin lógica distinta por rol, los datos ya varían solo
      por RLS)

**Checkpoint**: Las 3 historias de usuario funcionan de forma independiente — feature completa.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional (constitución §2-§4).

- [X] T036 [P] Playwright, caso positivo Y negativo (RLS, constitución §2 "no basta con probar el
      camino permitido"): un operario sin el permiso `aprobar` (permiso por defecto, solo `ver`)
      no puede actualizar una alerta ni siquiera llamando directo al cliente Supabase; con
      `aprobar` otorgado explícitamente, sí puede en `tests/e2e/rls.spec.ts`
      **Nota**: usa un operario aislado (`admin.auth.admin.createUser()`), no el `operario-e2e`
      compartido.
- [X] T037 Accesibilidad WCAG 2.1 AA (constitución §4): revisar `NotificacionesAlertas.vue`,
      `app/pages/admin/alertas/index.vue`, y `PanelPrincipal.vue` con teclado real — mismo
      criterio ya aplicado en features anteriores; confirmar específicamente la alternativa
      textual de las 3 gráficas de pastel (T034)
      **Hallazgos y fixes** (verificado con navegación real por teclado + `axe-core` inyectado
      en vivo contra `/admin`, `/operario`, `/admin/alertas`, `/operario/alertas`):
      1. `AppNotificacionesAlertas.vue`: el botón de la campana no tenía nombre accesible
         descriptivo — un lector de pantalla lo anunciaba solo con el dígito del badge (ej.
         "166"). Fix: `:aria-label` dinámico ("Alertas: N abiertas"/"sin alertas abiertas").
      2. `PanelPrincipal.vue`: el subtítulo del dashboard (`text-medium-emphasis` directo sobre
         el fondo de página `#f8f9fa`, sin tarjeta de por medio) daba un contraste de 4.45:1,
         por debajo del mínimo AA de 4.5:1 para texto normal. Fix: se quitó `text-medium-emphasis`
         de ese párrafo (mismo patrón de texto en `text-body-main` a emphasis completo).
      3. `app/components/alertas/Panel.vue` (montado por `admin/alertas/index.vue`): mismo
         problema de contraste (4.45:1) en el subtítulo de la pantalla y en el texto de
         paginación ("Mostrando…"/"Filas por página:"), todos `text-medium-emphasis` fuera de
         una tarjeta. Fix: se quitó `text-medium-emphasis` de esos 3 elementos.
      4. Navegación por teclado confirmada: campana → Enter navega a `/alertas`; filtros Tipo/
         Estado y botones "Marcar como resuelta" alcanzables por Tab con foco visible
         (`:focus-visible` global de `main.css`); las 3 gráficas de pastel exponen su
         alternativa textual como una `<table>` siempre visible (no solo para lectores de
         pantalla) con `<caption>`/`<th scope="row">`, más `role="img"` + `aria-label` con
         resumen en el propio `<canvas>` de Chart.js.
      5. Hallazgos **fuera de alcance** (pre-existentes, app completa, no introducidos por esta
         feature): `axe-core` reporta `document-title`/`html-has-lang` en toda página — no hay
         `<title>` ni `lang` configurados en `nuxt.config.ts`/`app.vue`. No se corrigen aquí.
- [X] T038 Ejecutar `quickstart.md` completo de punta a punta (los 6 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
      **Resultado**: los 6 escenarios están cubiertos por la suite automatizada y pasan en
      verde — Escenario 1→T012/T013, Escenario 2→T014, Escenario 3→T015, Escenario 4→T020/T021,
      Escenario 5→T022/T023, Escenario 6→T028-T032 (`npx playwright test tests/e2e/alertas.spec.ts
      tests/e2e/dashboard.spec.ts`, 16/16 passed). De las 4 notas de validación no funcional:
      RLS→T036 y accesibilidad→T037 ya verificadas arriba; "fallo de correo no bloquea la
      alerta"→T017 ya cubierto. La única sin cobertura automatizada explícita, **auditoría**, se
      verificó manualmente contra la corrida de T022 (operario resolviendo una alerta desde la
      UI): `select * from auditoria where entidad='alertas' order by created_at desc limit 1`
      devuelve `accion='editar'`, `valores_antes.estado='enviada'`,
      `valores_despues.estado='resuelta'` — confirma que el fix de research.md R9 (rama `UPDATE`
      restaurada en `private.registrar_auditoria()`) funciona correctamente end-to-end. Sin
      ajustes al contenido de `quickstart.md` — todo lo documentado ahí se cumple tal cual.
- [X] T039 `yarn typecheck` y `yarn lint` en verde sobre el código Nuxt/Nitro nuevo de esta
      feature; excluir `supabase/functions/**` de esa configuración (vive en un runtime Deno
      aparte, no en el `tsconfig` de Node) y verificarla por separado con
      `deno check supabase/functions/generar-alertas/index.ts`
      **Resultado**: `yarn typecheck` (vue-tsc) en verde. `yarn lint` encontró 1 error real
      pre-existente — `fechaHoyISO()` en `supabase/functions/generar-alertas/index.ts`, definida
      y nunca usada (resto de una iteración anterior de T019) — se eliminó. Se agregó
      `supabase/functions/**` a `ignores` en `eslint.config.mjs` (no estaba excluido todavía;
      ESLint no entiende los globals `Deno.*` ni imports `npm:` de ese runtime). Deno CLI no
      estaba instalado en esta máquina — se instaló vía `brew install deno` (2.9.5) para poder
      correr `deno check`, que pasa sin errores. Verificación final: `yarn typecheck` + `yarn
      lint` + `deno check` en verde, y la suite completa de esta feature
      (`alertas.spec.ts`+`dashboard.spec.ts`+`rls.spec.ts`, 39/39) sigue en verde tras estos
      cambios.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea las 3 historias de usuario.
- **User Story 1 (Phase 3)**: depende de Foundational — sin dependencias de otra historia.
- **User Story 2 (Phase 4)**: depende de Foundational; su "Independent Test" asume que ya
  existen alertas generadas (de US1 o sembradas directo) — se implementa después de US1 para
  poder probarse de punta a punta.
- **User Story 3 (Phase 5)**: depende de Foundational; solo su KPI de "checklists sin atender"
  depende de datos de US1 — el resto de sus secciones son independientes. Se implementa al final
  por ser P2 y por compartir la barra superior que US2 ya construye.
- **Polish (Phase 6)**: depende de que US1, US2 y US3 estén completas.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- El endpoint de correo (T018) antes que la Edge Function que lo llama (T019).
- Los composables (T024/T033) antes que los componentes/páginas que los consumen.

### Parallel Opportunities

- T002/T003 (Setup) en paralelo entre sí.
- T011 (regenerar tipos) puede correr en paralelo al resto de Foundational una vez aplicada la
  migración (T010).
- Todos los tests de una misma historia marcados [P] pueden correr en paralelo (casos
  independientes dentro del mismo archivo).
- T018 (endpoint de correo) puede implementarse en paralelo a escribir los tests de US1
  (T012-T017) — T019 (Edge Function) depende de T018 ya existir para poder llamarlo.
- US3 puede implementarse en paralelo a US1/US2 si se prioriza así (independiente salvo el KPI de
  checklists) — el orden sugerido en este documento (US1→US2→US3) no es la única secuencia
  válida, ver nota en "Organization" al inicio.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: 4 alertas con fecha se crean y notifican"
Task: "Playwright: alerta de checklist se crea y notifica"
Task: "Playwright: corrida repetida no duplica"
Task: "Playwright: condición resuelta se auto-cierra"
Task: "Playwright: empresa sin administrador no rompe la corrida"
Task: "Playwright: fallo de correo no bloquea la alerta ni la corrida"
```

---

## Implementation Strategy

### MVP First (US1 + US2, ambas P1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea las 3 historias)
3. Completar Phase 3 (Job diario) — prerrequisito funcional de facto de US2
4. **PARAR y VALIDAR**: probar US1 de forma independiente
5. Completar Phase 4 (Panel de alertas) — usa las alertas ya generadas
6. **PARAR y VALIDAR**: ambas juntas son el MVP completo
7. Completar Phase 5 (Dashboard)
8. Completar Phase 6: Polish
9. Deploy/demo

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Job diario) → probar de forma independiente → prerrequisito listo
3. US2 (Panel de alertas) → probar de forma independiente → MVP completo
4. US3 (Dashboard) → probar de forma independiente → feature completa
5. Cada historia agrega valor sin romper las anteriores

---

## Notes

- [P] tareas = archivos distintos o casos independientes, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en el checkpoint para validar cada historia de forma independiente antes de continuar.
- Dado el tamaño de esta feature (primera Edge Function, primer cron, primera librería de
  gráficas), considerar revisión humana intermedia más seguido que el máximo de 5-8 tareas ya
  establecido por la constitución §5 — especialmente entre T008/T009/T010 (agenda del cron +
  secreto de Vault, sin cobertura de test automatizada posible para el disparo real diario).
