# Implementation Plan: Checklist de Aditamentos y Revisión de Seguridad

**Branch**: `009-checklist` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-checklist/spec.md`

## Summary

Permite al administrador definir una plantilla de ítems de revisión de seguridad por tipo de
vehículo, y capturar checklists individuales antes de cada salida: cada ítem de la plantilla se
marca cumple/no cumple con observaciones, el conductor se autocompleta desde la asignación
activa (editable), y se elige un resultado general manual. Inmutable desde el diseño original de
la base de datos — sin ninguna acción de edición, cancelación ni borrado, a diferencia de
Combustible/Mantenimiento. El trabajo de esquema nuevo es
`schema_11_checklist_plantillas.sql` (tabla `checklist_item_plantillas`, columna `conductor_id`
en `checklists`, columnas de copia en `checklist_items`) más 3 triggers de auditoría genéricos
que `schema_11` no incluye (research.md R1 — aplicando desde el inicio la lección de
Combustible/Mantenimiento) — todo lo demás (tablas base, RLS, módulo de permisos `checklist`,
enum `resultado_checklist`) ya existe desde la migración inicial.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas.

**Storage**: PostgreSQL gestionado por Supabase. Una sola migración nueva: aplica
`docs/schema-reference/schema_11_checklist_plantillas.sql` tal cual (research.md R1) — agrega
`checklist_item_plantillas` (con su RLS), `checklists.conductor_id`, y
`checklist_items.es_critico`/`plantilla_item_id` — más 3 triggers de auditoría reutilizando
`private.audit_catalogo()` genérica (ninguna de las 3 tablas tiene una columna de estado que
distinguir, a diferencia de `cargas_combustible`/`mantenimientos`). Ninguna política de RLS
existente se modifica.

**Testing**: Playwright, mismo patrón de sesiones/empresas aisladas por test de
Combustible/Mantenimiento. Archivo nuevo: `tests/e2e/checklist.spec.ts`; casos de RLS en
`tests/e2e/rls.spec.ts`.

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt — esta feature no agrega
nada a `server/api/` (mismo criterio que todas las features anteriores).

**Performance Goals**: sin metas de throughput específicas.

**Constraints**: WCAG 2.1 AA en los formularios y tablas de captura (constitución §4); todo
aislado por empresa vía RLS ya existente. Mismo riesgo de límite de 1000 filas de PostgREST sobre
selectores de vehículo sin paginar ya documentado en Combustible/Mantenimiento (research.md R10)
— tests de captura MUST usar empresas aisladas.

**Scale/Scope**: 3 historias de usuario, 1 migración con 7 cambios de esquema (1 tabla nueva + su
RLS, 2 acciones de permiso, 3 columnas nuevas, 3 triggers de auditoría), 2 composables dedicados,
4 páginas nuevas (plantilla, listado, captura, detalle — sin edición, inmutable).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración. |
| §1 Monolito modular, un solo repo/deploy | 1 módulo nuevo (`checklist`) dentro del mismo proyecto, sin apps ni deploys nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell existente; páginas nuevas siguen el layout `admin` ya construido. |
| §2 RLS obligatorio en toda tabla | `checklists`/`checklist_items` ya tienen RLS desde la migración inicial; `checklist_item_plantillas` trae la suya en `schema_11` — sin cambios de política necesarios. |
| §2 `service_role` nunca al cliente | No aplica: sin `service_role`, sin RPC nueva. |
| §2 Bitácora de auditoría | 3 triggers reutilizando `private.audit_catalogo()` genérica, construidos desde Foundational (research.md R1) — no como corrección posterior. |
| §2 Inmutabilidad de checklists | Ya garantizada por el diseño original de `schema.sql` (`checklists_no_update`/`_no_delete`, `checklist_items_no_update`/`_no_delete`, `using (false)` incondicional) — esta feature no la introduce, solo la respeta (FR-010). |
| §2 Eliminación valida dependientes | No aplica a `checklists`/`checklist_items` (`no_delete` ya bloquea `DELETE` para todo rol). Eliminar un ítem de plantilla MUST NOT bloquearse por dependientes — usa `on delete set null` deliberadamente (FR-002, data-model.md), no la regla de integridad referencial general de otros catálogos. |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe `insert`/`update`/`delete` a `tiene_permiso('checklist','crear'\|'editar')` (o admin/superusuario) — sin endpoints nuevos que verificar. |
| §3 Sin datos fiscales/credenciales en logs | No aplica — ningún campo de esta feature es credencial. |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | Tests nuevos en `rls.spec.ts`: operario sin `editar` bloqueado en la plantilla (negativo) + con `editar` otorgado sí puede (positivo); además, verificación de que ningún rol (ni admin) puede editar/borrar un checklist ya creado. |
| §4 WCAG 2.1 AA | Mismo patrón accesible ya usado en Combustible/Mantenimiento. |
| §4 Alertas automáticas de vencimiento | No aplica — ninguna columna de esta feature es una fecha de vencimiento. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md` 16/16, `## Clarifications` con la única pregunta del brief ya resuelta vía `AskUserQuestion`). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/checklist.md` no introducen
ninguna excepción a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/009-checklist/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md              # Fase 1
├── quickstart.md              # Fase 1
├── contracts/                 # Fase 1
│   └── checklist.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores. Esta feature no agrega nada a `server/api/`
— reutiliza el patrón de páginas separadas de Combustible/Mantenimiento para captura/listado
(research.md R5), y el patrón "modal en listado" de Catálogos Base para la plantilla
(research.md R3), en una página propia (no una pestaña de Tipos de Vehículo).

```text
flotillas/
├── app/
│   ├── components/
│   │   └── checklist/
│   │       ├── FormularioItemPlantilla.vue  # modal de alta/edición de ítem de plantilla
│   │       └── FormularioChecklist.vue      # captura (US2) — vehículo, conductor, N ítems fijos, resultado
│   ├── composables/
│   │   ├── useChecklistPlantillas.ts        # dedicado (research.md R4)
│   │   └── useChecklists.ts                 # dedicado
│   └── pages/admin/
│       └── checklist/
│           ├── index.vue                    # listado + filtros (US3)
│           ├── nuevo.vue                    # captura (US2)
│           ├── [id]/index.vue                # detalle (US3)
│           └── plantilla.vue                # gestión de plantilla por tipo de vehículo (US1)
├── supabase/
│   └── migrations/
│       └── <timestamp>_checklist_plantillas.sql
├── tests/
│   └── e2e/
│       ├── checklist.spec.ts                # nuevo
│       └── rls.spec.ts                      # + casos del módulo checklist
```

**Structure Decision**: sin `[id]/editar.vue` — no existe ninguna edición posible sobre un
checklist ya guardado (FR-010), ni siquiera una cancelación (a diferencia de
Combustible/Mantenimiento, que sí permiten cancelar). La captura renderiza una fila fija por cada
ítem de la plantilla (research.md R6) — no hay UI de "agregar/quitar línea" como en Mantenimiento,
porque los ítems no los define el usuario en el momento, los define la plantilla.

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
