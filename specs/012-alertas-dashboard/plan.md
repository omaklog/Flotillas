# Implementation Plan: Alertas y Dashboard

**Branch**: `012-alertas-dashboard` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-alertas-dashboard/spec.md`

## Summary

Job diario (`pg_cron` + `pg_net` disparando la primera Edge Function del proyecto,
`generar-alertas`) que escanea, sin filtrar por empresa, 4 fuentes con fecha de vencimiento
(licencias, pólizas, permisos de vehículo, servicios obligatorios) más checklists con
observaciones, crea una alerta por condición nueva, notifica una sola vez a los administradores
reutilizando el mailer ya existente (`server/utils/mailer.ts`, vía un endpoint interno nuevo —
research.md R2, evita duplicar la plantilla de correo en Deno), y auto-resuelve alertas cuya
condición ya no aplica. Panel in-app (contador en la barra superior + pantalla con filtros +
resolución manual) y un dashboard nuevo (4 KPIs + 3 gráficas de pastel + indicador de
cumplimiento, con Chart.js — primera librería de gráficas del proyecto) que reemplaza las
pantallas de bienvenida genéricas de administrador y operario. El modelo de permisos del módulo
`alertas` ya está completo desde la migración inicial — el único trabajo de esquema es aplicar
`schema_14_alertas_ajustes.sql`, habilitar `pg_cron`/`pg_net`, y registrar la agenda del cron.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS para el servidor
Nitro/cliente Nuxt 4 (sin cambios); Deno 2 para la Edge Function nueva (`supabase/config.toml`
`[edge_runtime] deno_version = 2`, ya configurado aunque sin usar hasta ahora).

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase`, `nodemailer`
(ya instaladas, sin cambios). Nuevas: `chart.js` + `vue-chartjs` (research.md R3, único
paquete nuevo — el resto de la feature reutiliza infraestructura ya existente).

**Storage**: PostgreSQL gestionado por Supabase. Una migración: `schema_14_alertas_ajustes.sql`
tal cual (columna `fecha_vencimiento` de `alertas` opcional, índice único parcial
anti-duplicados) + `create extension pg_cron`/`pg_net` (primeras veces en el proyecto) + registro
de la agenda diaria vía `cron.schedule()` (research.md R7) + un trigger de auditoría para
`alertas`, que no tenía ninguno (research.md R9). Ninguna tabla nueva, ninguna política RLS
existente se modifica.

**Testing**: Playwright para UI (panel de alertas, dashboard) y para invocar directamente la
Edge Function por HTTP simulando al cron (research.md R4, mismo mecanismo ya usado en el resto
del proyecto — sin mocks de infraestructura). Verificación de correo reutilizando el patrón ya
establecido de polling a Mailpit (`tests/e2e/empresas.spec.ts`).

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios
para la UI. La Edge Function corre en el runtime Deno gestionado por Supabase (local vía
`supabase start`, ya con `edge_runtime` habilitado en `config.toml`).

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt, con un endpoint `server/
api/` nuevo (`alertas/notificar.post.ts`, interno/protegido) y una Edge Function nueva fuera del
árbol de Nitro (`supabase/functions/generar-alertas/`) — primera vez que este proyecto tiene
código de servidor fuera de `server/`.

**Performance Goals**: sin metas de throughput específicas para la UI. La Edge Function escanea
todos los tenants en una sola corrida diaria — sin restricción de tiempo dura, pero MUST
completar dentro de una ejecución razonable para el volumen actual de datos de prueba (no hay
miles de empresas reales todavía).

**Constraints**: WCAG 2.1 AA en el panel de alertas y el dashboard (constitución §4) — las
gráficas de pastel MUST tener una alternativa textual accesible (quickstart.md). El endpoint de
correo interno MUST estar protegido por secreto compartido, nunca abierto sin autenticar
(constitución §3). Mismo riesgo de límite de 1000 filas de PostgREST en el listado de alertas sin
filtrar — research.md no introduce paginación de servidor nueva, mismo criterio que el resto del
proyecto.

**Scale/Scope**: 3 historias de usuario, 1 migración (schema_14 + 2 extensiones + 1 agenda de
cron), 1 Edge Function nueva, 1 endpoint `server/api/` nuevo, 2 composables nuevos
(`useAlertas.ts`, `useDashboard.ts`), 1 componente de notificaciones compartido entre 2 layouts,
1 página de alertas, 2 páginas de dashboard reemplazadas (admin y operario), 1 dependencia nueva
(Chart.js).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración en el proyecto Nuxt; la Edge Function nueva también se escribe en TypeScript (Deno lo soporta nativo). |
| §1 Monolito modular, un solo repo/deploy | La Edge Function vive dentro del mismo repo/proyecto Supabase — no es un servicio desplegado aparte con infraestructura propia que operar; `pg_cron`/`pg_net` son extensiones de la misma base de datos ya gestionada (research.md R1, justificación explícita de por qué esto no es un "microservicio" en el sentido que la constitución prohíbe). |
| §1 PWA instalable, responsivo | El dashboard y el panel de alertas siguen el layout/shell ya construido; sin cambios al manifest/service worker. |
| §2 RLS obligatorio en toda tabla | `alertas` ya tiene RLS completa desde su diseño original — sin cambios de política. La Edge Function usa `service_role` (bypassea RLS deliberadamente, como ya hace el patrón de invitación de operarios) para poder escanear todos los tenants en una sola corrida (FR-001), consistente con el uso ya aceptado de `service_role` en `server/api/` para flujos administrativos. |
| §2 `service_role` nunca al cliente | La `service_role` key vive solo en la Edge Function (variable de entorno inyectada por la plataforma Supabase) y en el endpoint interno de correo (`server/api/`, nunca en código enviado al navegador) — mismo criterio ya aplicado en el resto del proyecto. |
| §2 Bitácora de auditoría | **Hallazgo, no lo asuma resuelto**: a diferencia de lo que sugería la primera revisión de este documento, `alertas` NO tiene ningún trigger de auditoría — no estaba en las 19 tablas de `schema_13` (007-010), y Feature 011 solo agregó el trigger faltante de `usuario_permisos`, no el de `alertas` (research.md de 011 nunca la menciona). Mismo gap ya encontrado y corregido en cada feature anterior — Foundational de esta feature MUST agregar `trg_alertas_auditoria` reutilizando `private.registrar_auditoria()` (ya existente desde 011, sin necesidad de una función dedicada — `alertas` no tiene una columna de estado con transiciones especiales más allá de `insert`/`update`, ambas ya mapeadas por esa función genérica a `crear`/`editar`). La Edge Function inserta/actualiza alertas con `service_role`, que también dispara ese trigger igual que un usuario normal. |
| §3 Autenticación con captcha, roles de 3 niveles | No aplica cambio — el endpoint interno de correo usa un secreto compartido, no el modelo de roles de usuario (no es una acción que un usuario realice, es servidor-a-servidor). |
| §3 Archivos validados por tipo/tamaño | No aplica — esta feature no maneja archivos. |
| §3 Sin datos fiscales/credenciales en logs | El log de resumen de la Edge Function (`{ alertasCreadas, alertasResueltas, correosEnviados }`) MUST NOT incluir direcciones de correo ni datos personales — solo conteos. |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | Tests nuevos: operario sin `aprobar` bloqueado al intentar resolver una alerta (negativo) + con `aprobar` otorgado sí puede (positivo) — mismo patrón ya usado en cada feature anterior. |
| §4 WCAG 2.1 AA | Las 3 gráficas de pastel MUST tener alternativa textual (quickstart.md) — requisito nuevo específico de esta feature, ya que es la primera con gráficas. |
| §4 Alertas automáticas de vencimiento | Esta ES la feature que salda la excepción documentada en la constitución para Vehículos/Conductores/Mantenimiento/Servicios Obligatorios (§4, "hasta que exista una feature dedicada de Alertas/Dashboard") — una vez completa, esa excepción queda resuelta, no aplica ya como pendiente. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md` 16/16, ambas preguntas de `/speckit-clarify` resueltas). |

Sin violaciones bloqueantes — la única fila que requiere justificación explícita (§1, Edge
Function) queda documentada en la tabla misma, no en Complexity Tracking (no es una violación,
es una aclaración de por qué SÍ cumple el principio).

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/alertas-dashboard.md` no
introducen ninguna excepción a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/012-alertas-dashboard/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md              # Fase 1
├── quickstart.md              # Fase 1
├── contracts/                 # Fase 1
│   └── alertas-dashboard.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

```text
flotillas/
├── supabase/
│   ├── functions/
│   │   └── generar-alertas/
│   │       └── index.ts                     # nuevo — primera Edge Function del proyecto
│   └── migrations/
│       └── <timestamp>_alertas_cron.sql
├── server/
│   ├── api/
│   │   └── alertas/
│   │       └── notificar.post.ts            # nuevo, interno (research.md R2)
│   └── utils/
│       └── mailer.ts                        # ya existente, reutilizado sin cambios
├── app/
│   ├── components/
│   │   └── app/
│   │       └── NotificacionesAlertas.vue    # nuevo — badge en la barra superior (US-12.2)
│   ├── composables/
│   │   ├── useAlertas.ts                    # nuevo
│   │   └── useDashboard.ts                  # nuevo
│   ├── layouts/
│   │   ├── admin.vue                        # + <AppNotificacionesAlertas />
│   │   └── default.vue                      # + <AppNotificacionesAlertas /> (operario)
│   └── pages/
│       ├── admin/
│       │   ├── index.vue                    # reemplazado por el dashboard (US-12.3)
│       │   └── alertas/
│       │       └── index.vue                # nuevo — <AlertasPanel /> (US-12.2)
│       └── operario/
│           ├── index.vue                    # reemplazado por el dashboard (US-12.3)
│           └── alertas/
│               └── index.vue                # nuevo — <AlertasPanel /> (mismo componente)
├── tests/
│   └── e2e/
│       ├── alertas.spec.ts                  # nuevo — US-12.1 (Edge Function) + US-12.2
│       ├── dashboard.spec.ts                # nuevo — US-12.3
│       └── rls.spec.ts                      # + caso del módulo alertas
```

**Structure Decision**: el dashboard reutiliza las rutas ya existentes (`admin/index.vue`,
`operario/index.vue`, spec.md § Assumptions) en vez de crear rutas nuevas — ambos reemplazan su
contenido placeholder actual por el mismo dashboard, con datos que varían solo por RLS
(research.md R6), no por código distinto entre admin/operario. El panel de alertas SÍ es una
ruta nueva porque no existía ninguna pantalla previa que reemplazar — sigue el mismo patrón de
listado+filtros ya establecido en features anteriores, sin componente de detalle/expansión propio
(marcar como resuelta es una acción de fila, no requiere navegar a otra pantalla).

**Corrección encontrada durante la implementación (T026/T027)**: el plan original solo listaba
`app/pages/admin/alertas/index.vue`. `app/middleware/auth.global.ts` bloquea a un operario de
navegar a cualquier ruta bajo `/admin/**` (guard de sección por rol, redirige a `/operario`) — un
operario con permiso `ver` en `alertas` (otorgado por defecto, spec.md § Assumptions) nunca podría
llegar a esa pantalla, incumpliendo FR-007/FR-008 para ese rol. Fix, mismo criterio que el
dashboard (US-12.3): el contenido de la pantalla vive en un componente compartido
(`app/components/alertas/Panel.vue`, auto-importado como `<AlertasPanel />`), montado en DOS
rutas — `app/pages/admin/alertas/index.vue` y `app/pages/operario/alertas/index.vue` — cuyos
datos y acciones ya varían solo por RLS/permiso (`tiene_permiso('alertas','aprobar')`), sin
lógica distinta por rol escrita a mano.

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica. La fila de §1 sobre la Edge Function es
una aclaración de cumplimiento, no una excepción que justificar.*
