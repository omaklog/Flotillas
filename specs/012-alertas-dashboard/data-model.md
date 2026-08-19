# Data Model: Alertas y Dashboard

> **Fuente de verdad**: la tabla `public.alertas`, su RLS (`alertas_select`/`alertas_update`, ya
> con el patrón `tiene_permiso('alertas', 'ver'/'aprobar')`), y el módulo de permisos `alertas`
> (ya sembrado, `ver` otorgado por defecto) ya existen desde la migración inicial de permisos del
> proyecto — sin cambios necesarios (research.md, spec.md § Assumptions). Esta feature agrega:
> `schema_14_alertas_ajustes.sql`, las extensiones `pg_cron`/`pg_net`, la agenda del cron, la
> Edge Function, y un endpoint interno de correo.

## Alerta (`public.alertas`, ya existente + extensión de esta feature)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `tipo` | text, not null | `'licencia'\|'poliza'\|'permiso'\|'servicio_obligatorio'\|'checklist'` (research.md R5) — texto libre, no enum, ya así desde el diseño original |
| `entidad_tipo` | text, not null | nombre de la tabla de origen (`'conductores'`, `'vehiculos'`, `'vehiculo_permisos'`, `'servicios_obligatorios'`, `'checklists'`) |
| `entidad_id` | uuid, not null | id de la fila de origen |
| `fecha_vencimiento` | date, **nullable tras `schema_14`** | `null` para alertas tipo `checklist` (no tienen una fecha de vencimiento real, FR-002); las otras 4 fuentes sí la traen |
| `estado` | enum `estado_alerta` (`pendiente`\|`enviada`\|`resuelta`), not null, default `pendiente` | |
| `created_at` | timestamptz, not null | |

**Sin duplicados mientras esté abierta** (`schema_14`, research.md R7): índice único parcial
`uq_alertas_abiertas (empresa_id, tipo, entidad_tipo, entidad_id) where estado in ('pendiente',
'enviada')` — un segundo `insert` para la misma condición mientras la primera sigue abierta
choca contra este índice; la Edge Function MUST tratar esa colisión como "ya existe, no hacer
nada" (`on conflict do nothing`), no como un error.

RLS (ya existente, sin cambios):

- `alertas_select`: `tiene_permiso('alertas','ver')` (o admin/superusuario) — `ver` ya otorgado
  por defecto a todo operario nuevo.
- `alertas_update`: `tiene_permiso('alertas','aprobar')` (o admin/superusuario) — no otorgado por
  defecto; es la única acción de escritura expuesta a un usuario normal (marcar como resuelta,
  FR-009). No hay política de `insert` para usuarios normales — solo la Edge Function (con
  `service_role`, que bypassea RLS) inserta filas nuevas.

## Extensiones nuevas de esta feature (resumen para `/speckit-tasks`)

Una sola migración con, en orden (research.md R7):

1. Contenido literal de `docs/schema-reference/schema_14_alertas_ajustes.sql`:
   `alter table public.alertas alter column fecha_vencimiento drop not null;` +
   `create unique index uq_alertas_abiertas on public.alertas (empresa_id, tipo, entidad_tipo,
   entidad_id) where estado in ('pendiente', 'enviada');`
2. `create extension if not exists pg_cron;`, `create extension if not exists pg_net;`, y
   `create extension if not exists supabase_vault;` — ninguna de las tres habilitada todavía en
   este proyecto.
3. `select cron.schedule('generar-alertas-diario', '0 6 * * *', $$ select net.http_post( url :=
   '<SUPABASE_URL>/functions/v1/generar-alertas', headers := jsonb_build_object('Authorization',
   'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name =
   'edge_functions_service_role_key'), 'Content-Type', 'application/json') ) $$);` — corre una
   vez al día (FR-001); el horario exacto (6:00 UTC en el ejemplo) es una decisión de
   implementación sin impacto funcional para la spec. El secreto se registra por separado, fuera
   de la migración (`vault.create_secret(...)`, research.md R7) — MUST NOT aparecer literal en
   ningún archivo versionado.
4. `create trigger trg_alertas_auditoria after insert or update on public.alertas for each row
   execute function private.registrar_auditoria();` — gap encontrado, `alertas` no tenía ningún
   trigger de auditoría (research.md R9).

## Edge Function `generar-alertas` (`supabase/functions/generar-alertas/index.ts`, nueva)

No es una tabla — es la pieza de cómputo de US-12.1. Recibe un `POST` (sin cuerpo relevante,
disparado por `pg_net`), usa un cliente Supabase con `service_role` (sin RLS), y por cada fuente
de research.md R5:

1. Consulta las filas que cumplen la condición de alerta de esa fuente.
2. Por cada una, intenta `insert` en `alertas` con `on conflict (empresa_id, tipo, entidad_tipo,
   entidad_id) where estado in ('pendiente','enviada') do nothing` — si la fila se insertó
   (no hubo conflicto), continúa al paso 3; si no, ya había una alerta abierta, no hace nada más
   para esa condición.
3. Para cada alerta recién insertada: llama a `server/api/alertas/notificar.post.ts` (research.md
   R2) con el id de la alerta; si la llamada tiene éxito, actualiza esa fila a `estado='enviada'`
   (FR-005) — si falla, la deja en `pendiente` (Edge Cases de spec.md: un fallo de correo no
   MUST impedir que la alerta exista).
4. Consulta las alertas abiertas (`pendiente`/`enviada`) de cada tipo cuya condición de origen ya
   no se cumple (research.md R5, columna "condición de auto-resolución") y las actualiza a
   `resuelta` (FR-006).

Responde `200` con un resumen (`{ alertasCreadas, alertasResueltas, correosEnviados }`) — sin
datos sensibles, solo para observabilidad de la corrida.

## Endpoint `server/api/alertas/notificar.post.ts` (nuevo)

Recibe `{ alertaId: string }`, protegido por un header compartido
(`Authorization: Bearer <ALERTAS_CRON_SECRET>`, variable de entorno nueva — research.md R2, no
confundir con el `service_role` key de Supabase, que la Edge Function ya usa para su propia
autenticación contra la base de datos, no contra este endpoint). Con `service_role` (server-side,
nunca expuesto al cliente — constitución §2), busca la alerta y los datos de su entidad de
origen, arma el asunto/cuerpo del correo con `renderEmailLayout()`, y llama `sendMail()` (ambas
ya existentes, `server/utils/mailer.ts`) a cada administrador activo de la empresa de la alerta
(FR-005; spec.md § Decisiones, "destinatarios: solo administradores activos").

## Consultas del dashboard (US-12.3) — sin entidades nuevas

Todas leen tablas ya existentes con `useSupabaseClient()` normal (research.md R6, sin `server/
api/` intermedio):

| Sección | Fuente | Filtro |
|---|---|---|
| KPI vehículos activos | `vehiculos` | `baja=false`, conteo |
| KPI licencias por vencer | `conductores` | `activo=true`, `fecha_vencimiento_licencia` ≤ hoy+30, conteo |
| KPI pólizas por vencer | `vehiculos` | `baja=false`, `fecha_vencimiento_poliza` ≤ hoy+30, conteo |
| KPI checklists sin atender | `alertas` | `tipo='checklist'`, `estado in ('pendiente','enviada')`, `created_at` ≥ hoy-30, conteo (research.md R8) |
| Gráfica mantenimiento por tipo | `mantenimientos` | `estado='activo'`, `fecha` ≥ hoy-30, `sum(costo_total)` agrupado por `tipo` |
| Gráfica licencias por vencer (mes) | `conductores` | `activo=true`, `fecha_vencimiento_licencia` dentro del mes calendario en curso, conteo |
| Gráfica pólizas por vencer (mes) | `vehiculos` | `baja=false`, `fecha_vencimiento_poliza` dentro del mes calendario en curso, conteo |
| Indicador cumplimiento checklists | `checklists` | `fecha` ≥ hoy-30, agrupado por `tipo_vehiculo_id` (join a `tipos_vehiculo.nombre`), % `resultado='aprobado'` vs. `'con_observaciones'` |

Cada fila hereda el filtro de RLS de su propia tabla (research.md R6) — sin lógica de permisos
adicional en el cliente.
