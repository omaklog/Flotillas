# Research: Alertas y Dashboard

## R1 — Arquitectura del job diario: `pg_cron` + `pg_net` disparan una Edge Function por HTTP

**Decision**: `pg_cron` agenda una tarea diaria que usa `pg_net.http_post()` para invocar la URL
de la Edge Function (`${SUPABASE_URL}/functions/v1/generar-alertas`), autenticada con el
`service_role` key vía header `Authorization` — el valor del key se lee de Postgres Vault en el
momento de la llamada, nunca escrito literal en la migración (research.md R7). La Edge Function
(Deno/TypeScript, bajo
`supabase/functions/generar-alertas/`) hace todo el trabajo real: escanea las 5 fuentes con un
cliente Supabase inicializado con `service_role` (sin RLS, cruza todos los tenants en una sola
corrida — FR-001), crea/resuelve filas de `alertas`, y dispara el correo (research.md R2).

**Rationale**: Es el patrón estándar y documentado de Supabase para "cron que llama una Edge
Function" — no requiere infraestructura externa (colas, workers separados), ambas piezas
(`pg_cron`, `pg_net`) son extensiones de la misma base de datos ya gestionada por Supabase. No
introduce un "servicio" nuevo que operar por separado — sigue siendo parte del mismo proyecto
Supabase, consistente con la constitución §1 ("no se introducen microservicios... en esta fase":
una Edge Function dentro del propio proyecto Supabase, disparada por una extensión de su propia
base de datos, no es un microservicio con infraestructura propia que desplegar/operar aparte).

**Alternatives considered**: Un `pg_cron` que llama directo a una función `plpgsql` (sin Edge
Function) — rechazado: el brief pide explícitamente una Edge Function, y de cualquier forma
`plpgsql` no puede enviar HTTP/SMTP por sí solo para el correo (research.md R2). Un cron externo
(GitHub Actions, un servicio de scheduling de terceros) — rechazado: agrega una dependencia
operativa fuera de Supabase sin necesidad, cuando `pg_cron` ya resuelve "una vez al día" de forma
nativa.

## R2 — El correo se envía reutilizando `server/utils/mailer.ts`, no una librería SMTP para Deno

**Decision**: La Edge Function NO envía el correo ella misma. Después de crear una alerta,
hace una llamada HTTP (`fetch`) a un endpoint nuevo y protegido,
`server/api/alertas/notificar.post.ts`, en el propio servidor Nitro de la aplicación — ese
endpoint reutiliza `sendMail()`/`renderEmailLayout()` ya existentes (Feature 001) para el envío
real. El endpoint se protege con un secreto compartido (`ALERTAS_CRON_SECRET`, variable de
entorno nueva) verificado por header — nunca queda abierto sin autenticar.

**Rationale**: `server/utils/mailer.ts` ya tiene el transporte SMTP (Nodemailer) y la plantilla
de marca completos, ya probados por la invitación de operarios — reescribir el envío de correo
con una librería SMTP nativa de Deno (ej. `denomailer`) duplicaría esa lógica y la plantilla de
marca en un segundo lugar del código, con el riesgo de que ambas se desalineen con el tiempo. Con
esta arquitectura, "cómo se envía un correo" sigue viviendo en un solo lugar del proyecto.

**Alternatives considered**: Cliente SMTP nativo de Deno (`denomailer` u otro paquete `npm:`
compatible) llamando directo a Mailpit (local)/Resend (producción) desde la Edge Function —
rechazado por la duplicación de plantilla/lógica arriba. API HTTP de Resend (en vez de SMTP) —
rechazado para esta fase: Mailpit (el capturador local de correo, `docs/schema-reference` /
`.env.example`) no tiene una API compatible con la de Resend, así que el mismo código no
funcionaría igual en local y en producción; SMTP (vía el mailer ya existente) sí es idéntico en
ambos entornos.

## R3 — Librería de gráficas: Chart.js + `vue-chartjs`

**Decision**: Se agrega `chart.js` + `vue-chartjs` como dependencia nueva para las 3 gráficas de
pastel de US-12.3. Los colores de cada rebanada se pasan explícitamente desde
`docs/design-system.md` (paleta ya definida) — sin depender de la paleta default de la librería.

**Rationale**: Es la opción más ligera y madura (MIT, comunidad enorme, sin dependencias propias
pesadas) entre las alternativas típicas de Vue 3; su wrapper `vue-chartjs` es un envoltorio fino
sobre Chart.js (fácil de auditar, sin capa de theming propia que choque con Vuetify). Los 3 casos
de uso de esta feature (pastel/dona simple) no necesitan las funciones más avanzadas de
librerías más pesadas.

**Alternatives considered**: ApexCharts (`vue3-apexcharts`) — más completo out-of-the-box
(tooltips, animaciones) pero con bundle notablemente mayor y su propio sistema de theming, que
tendría que forzarse a seguir la paleta del proyecto en vez de complementarla. ECharts
(`vue-echarts`) — el más pesado de los tres, pensado para dashboards de analítica compleja, muy
por encima de lo que 3 gráficas de pastel simples necesitan aquí.

## R4 — Cómo se prueba localmente (Playwright): invocar la Edge Function por HTTP, no esperar al cron real

**Decision**: `supabase/config.toml` ya tiene `[edge_runtime] enabled = true` — el contenedor de
runtime de Edge Functions (`supabase_edge_runtime_<proyecto>`) se levanta junto con el resto del
stack local en cuanto exista al menos una función bajo `supabase/functions/` (hoy aparece
"Stopped" en `supabase status` porque todavía no hay ninguna). Una vez creada la función, es
alcanzable en `${SUPABASE_URL}/functions/v1/generar-alertas` sin configuración adicional de
Playwright (mismo host/puerto que el resto de las llamadas a Supabase en los tests, vía Kong) —
no hace falta un segundo `webServer` en `playwright.config.ts`. Los tests Playwright de US-12.1
invocan esa URL directamente (`fetch`/`page.request.post`) para simular una corrida del cron, en
vez de esperar la agenda diaria real de `pg_cron`.

**Rationale**: Es el mismo mecanismo por el que ya se prueba el resto del proyecto (llamadas
HTTP directas desde el test, sin mockear infraestructura) — y evita que la suite dependa de
esperar tiempo real o de manipular el reloj del sistema para "forzar" que pase un día.

**Verificación de correo**: se reutiliza el mismo patrón ya establecido en
`tests/e2e/empresas.spec.ts` (`MAILPIT_URL = 'http://127.0.0.1:54424'`, polling de
`/api/v1/messages` hasta encontrar un mensaje al destinatario esperado) — sin inventar un
mecanismo nuevo de verificación de correo.

**Alternatives considered**: Ninguna — mismo patrón ya establecido para ambas partes (invocar
Supabase directo, verificar correo vía Mailpit).

**Correcciones encontradas durante la implementación (T019)**:

1. **El contenedor de `edge_runtime` que trae `supabase start` no registra una función nueva con
   solo reiniciar el contenedor** (`docker restart supabase_edge_runtime_<proyecto>`) — responde
   `404 Function not found` aunque el archivo ya exista en `supabase/functions/`. Hace falta un
   ciclo completo `supabase stop && supabase start` para que la CLI vuelva a montar/registrar las
   funciones. En la práctica, para desarrollo/pruebas locales de esta feature se usó en su lugar
   `supabase functions serve generar-alertas --env-file .env` (el respaldo ya documentado arriba
   para el caso "el contenedor no se levanta solo") — sirve la función directamente sobre el mismo
   puerto (`http://127.0.0.1:54421/functions/v1/generar-alertas`, vía Kong) sin depender de que
   `edge_runtime` haya sido reiniciado. **Debe quedar corriendo en una terminal aparte durante
   cualquier corrida de la suite de Playwright de esta feature.**
2. **`ALERTAS_NOTIFICAR_URL=http://host.docker.internal:3030/...` daba `ENETUNREACH` desde dentro
   del contenedor**, no por un problema de resolución de `host.docker.internal` en sí, sino porque
   el servidor Nitro (`yarn dev`) solo escuchaba en `localhost`, que en este Mac resuelve primero a
   `::1` (IPv6) — no tenía ningún listener en una interfaz IPv4, así que ninguna IP con la que el
   contenedor intentara conectarse (`host.docker.internal` resuelve a una IPv4 del host) podía
   llegar a un puerto que no estaba abierto ahí. **Fix**: `nuxt.config.ts` → `devServer.host =
   '0.0.0.0'` (escucha en todas las interfaces). Verificado end-to-end tras el fix: conductor de
   prueba → alerta creada → `notificar.post.ts` alcanzado desde el contenedor → correo recibido en
   Mailpit.

## R5 — Mapeo de cada fuente a `alertas.tipo`/`entidad_tipo` y su condición de auto-resolución

**Decision**:

| `tipo` | Fuente | Condición de alerta | Condición de auto-resolución (FR-006) |
|---|---|---|---|
| `licencia` | `conductores` | `activo=true` y `fecha_vencimiento_licencia` ≤ hoy+30 | conductor desactivado, o `fecha_vencimiento_licencia` ya fuera de la ventana |
| `poliza` | `vehiculos` | `baja=false` y `fecha_vencimiento_poliza` ≤ hoy+30 | vehículo dado de baja, o `fecha_vencimiento_poliza` ya fuera de la ventana |
| `permiso` | `vehiculo_permisos` | `fecha_vencimiento` no nulo y ≤ hoy+30 | `fecha_vencimiento` ya fuera de la ventana, o la fila fue eliminada (research.md, mismo criterio "la entidad ya no existe" de Feature 011) |
| `servicio_obligatorio` | `servicios_obligatorios` | `fecha_vencimiento` ≤ hoy+30 | `fecha_vencimiento` ya fuera de la ventana (editado), o el servicio fue eliminado (Feature 010, libre) |
| `checklist` | `checklists` | `resultado='con_observaciones'` sin alerta abierta previa | nunca se auto-resuelve por condición (Edge Cases de spec.md — un checklist es inmutable, "con_observaciones" no cambia solo); solo se resuelve manualmente (US-12.2) |

Todas usan `entidad_tipo` = el nombre de la tabla de origen y `entidad_id` = el id de esa fila —
mismo patrón ya usado por `archivos.entidad_tipo`/`entidad_id` en features anteriores.

**Rationale**: Fija de forma explícita el mapeo tabla→tipo→condición para que `/speckit-tasks`
pueda derivar tareas 1:1 por fuente, y para que el diseño de auto-resolución (que el brief deja
abierto en su mayoría) sea consistente entre las 4 fuentes con fecha.

**Alternatives considered**: Ninguna — es la traducción directa de spec.md (FR-001/FR-002/FR-006)
a comportamiento concreto por tabla.

## R6 — Permiso por sección del dashboard: mismo patrón "RLS ya filtra", sin gate manual

**Decision**: Cada KPI/gráfica del dashboard consulta su tabla de origen con
`useSupabaseClient()` normal (mismo composable ya existente de esa feature cuando aplica, ej.
`useServiciosObligatorios().listar()`) — si el usuario actual no tiene `tiene_permiso('<módulo>',
'ver')` para esa tabla, RLS ya devuelve 0 filas de forma transparente (FR-012), sin necesidad de
ningún `if` explícito de "¿tengo permiso?" antes de cada consulta.

**Rationale**: Mismo principio ya aplicado en toda la aplicación — RLS es la única capa de
autorización real (constitución §2); el cliente nunca decide qué mostrar en función de permisos
que él mismo calcula, solo renderiza lo que la consulta ya le devolvió.

**Alternatives considered**: Ninguna — es el patrón ya establecido, sin motivo para desviarse.

## R7 — Migración de esquema: `schema_14` + extensiones + agenda del cron, SIN el secreto en el archivo

**Decision**: Una migración aplica, en este orden: (1) el contenido literal de
`docs/schema-reference/schema_14_alertas_ajustes.sql` (columna `fecha_vencimiento` de `alertas`
pasa a opcional, índice único parcial anti-duplicados); (2) `create extension if not exists
pg_cron;`, `create extension if not exists pg_net;`, y `create extension if not exists
supabase_vault;` (ninguna de las tres está habilitada todavía); (3) `select
cron.schedule('generar-alertas-diario', '0 6 * * *', $$ select net.http_post( url :=
'<SUPABASE_URL>/functions/v1/generar-alertas', headers := jsonb_build_object('Authorization',
'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name =
'edge_functions_service_role_key'), 'Content-Type', 'application/json') ) $$);`.

**Corrección importante sobre el primer borrador de esta decisión**: el `service_role` key
NUNCA MUST escribirse literal dentro del archivo de migración — un archivo de migración se
versiona en git, así que hacerlo sería equivalente a publicar esa credencial en el repositorio
(constitución §2, "ningún uso de la `service_role key`... se expone" — el espíritu del principio
aplica igual a exponerla en control de versiones, no solo al cliente). En vez de eso, el valor
real del secreto se registra **una sola vez por entorno**, fuera de cualquier migración, con
`select vault.create_secret('<el valor real>', 'edge_functions_service_role_key');` — ejecutado a
mano (local) o vía el SQL Editor del dashboard de Supabase (staging/producción), igual que ya se
hace con las credenciales SMTP en `.env` (nunca committeadas). La migración solo referencia el
secreto **por nombre**, nunca por valor.

**Rationale**: Todo el trabajo de esquema de esta feature en un solo lugar, siguiendo el mismo
criterio de "una migración por feature" ya usado en 007-011 — salvo el secreto en sí, que por
definición no puede vivir en un archivo versionado.

**Alternatives considered**: Registrar el cron desde el dashboard de Supabase ("Cron Jobs", UI
nativa que no requiere escribir `cron.schedule()` a mano) — válido y sin este riesgo, pero
significaría que la agenda del cron no queda versionada como el resto del esquema del proyecto
(todas las demás decisiones de esquema de este proyecto viven en migraciones, no en
configuración manual del dashboard); se prefiere `cron.schedule()` en migración + secreto en
Vault por consistencia con esa convención, no por ser la única opción seguible.

## R8 — Ventanas de tiempo ya resueltas (Clarifications sesión 2026-08-11)

**Decision**: KPI "vehículos activos" (sin ventana, es un conteo actual), KPI "licencias por
vencer"/"pólizas por vencer" (ventana fija de 30 días desde hoy — igual que FR-001), KPI
"checklists con observaciones sin atender" (alertas tipo `checklist` abiertas creadas en los
últimos 30 días), gráfica de mantenimiento por tipo (últimos 30 días), gráficas de licencias/
pólizas por vencer (mes calendario en curso, `date_trunc('month', current_date)` a fin de mes),
indicador de cumplimiento de checklists (últimos 30 días). Documentado aquí para que
`/speckit-tasks` no tenga que re-derivarlo de `spec.md`.

**Rationale**: Ya resuelto vía `/speckit-clarify` — se centraliza aquí para referencia rápida de
implementación.

**Alternatives considered**: N/A — decisión ya tomada en clarify.

## R9 — `alertas` no tiene ningún trigger de auditoría; falta agregarlo

**Decision**: `alertas` no está entre las 19 tablas que `schema_13` conectó originalmente
(007-010), y Feature 011 (que sí agregó el trigger de auditoría faltante para
`usuario_permisos`) tampoco la incluyó — no tiene ningún trigger de auditoría hoy. Esta feature
agrega `trg_alertas_auditoria after insert or update on public.alertas for each row execute
function private.registrar_auditoria()`, reutilizando la función genérica ya creada por Feature
011 (`data-model.md` de 011). Sin `delete` en el trigger: `alertas` no tiene ninguna política RLS
de `delete` (ni para usuarios normales ni implícita) — no hace falta auditar una operación que no
puede ocurrir.

**Corrección importante sobre el primer borrador de esta decisión**: se había asumido que
`private.registrar_auditoria()` (tal como la dejó Feature 011) ya mapeaba `update→'editar'`
correctamente. Al leer el cuerpo real de la función
(`supabase/migrations/20260811224530_auditoria_usuario_permisos.sql`), esto es falso — Feature 011
la escribió como una versión **simplificada** solo para `usuario_permisos` (que únicamente hace
`insert`/`delete`, nunca `update`), con esta rama:

```sql
if TG_OP = 'INSERT' then
  v_accion := 'crear';
else
  v_accion := 'eliminar';  -- ¡todo lo que no sea INSERT cae aquí, incluido UPDATE!
end if;
```

Conectar `alertas` (que sí hace `update` al marcar una alerta como `resuelta`, FR-009) a esta
versión tal cual registraría cada resolución con `accion='eliminar'` y
`valores_antes`/`valores_despues` en `null` — un hallazgo de auditoría con la acción incorrecta
y sin el detalle antes/después, violando constitución §2. **Fix**: esta feature restaura, vía
`create or replace function`, la rama `UPDATE` de la versión original de `private.registrar_auditoria()`
tal como la diseñó `schema_13_bitacora_auditoria_automatica.sql` (`docs/schema-reference/`) —
`insert→'crear'`, `update→'editar'`, `delete→'eliminar'`, con `valores_antes`/`valores_despues`
poblados según corresponda — sin la rama especial `'cancelar'` de `schema_13` (solo aplica a
`cargas_combustible`/`mantenimientos`, que ya tienen su propio trigger dedicado, no pasan por esta
función). Es un cambio seguro: `usuario_permisos` (el único llamador actual, verificado vía
`grep -rn registrar_auditoria supabase/migrations/*.sql`) nunca hace `update`, así que restaurar
esa rama no cambia su comportamiento — solo habilita correctamente el caso nuevo que `alertas`
necesita.

**Rationale**: Mismo gap encontrado y corregido en cada feature anterior de este proyecto
(007-011) — aplicar la lección en cuanto se detecta, no como corrección posterior. La corrección
de la función en sí sigue la misma disciplina: verificar el código real antes de asumir que una
pieza reutilizada hace lo que su nombre sugiere.

**Alternatives considered**: Escribir una función de auditoría dedicada solo para `alertas` en vez
de ampliar la genérica — rechazado: hubiera dejado la función genérica con el mismo bug latente
para la próxima feature que la reutilice con `update`, en vez de corregirlo en el origen.
