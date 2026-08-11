# Implementation Plan: Mantenimiento (Correctivo y Preventivo)

**Branch**: `008-mantenimiento` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-mantenimiento/spec.md`

## Summary

Permite capturar órdenes de mantenimiento correctivo/preventivo por vehículo, cada una con una o
más líneas (refacción, llanta, servicio o producto/consumible), costo total a nivel de orden
(sin autocálculo), inmutables salvo cancelación irreversible con motivo — mismo patrón que
Combustible (007), extendido a un modelo padre/hijo de una-orden-con-varias-líneas. El trabajo de
esquema nuevo es `schema_10_mantenimiento_ajustes.sql` (`cantidad` en detalles,
`motivo_cancelacion`, trigger de inmutabilidad propio) más un trigger de auditoría dedicado que
`schema_10` no incluye (`private.audit_mantenimientos()`, research.md R1/R11 — aplicando desde el
inicio la lección aprendida en Combustible vía `/speckit-analyze`, hallazgo A1) — todo lo demás
(tablas, RLS granular, módulo de permisos `mantenimiento`, bucket `documentos`, enums
`tipo_mantenimiento`/`condicion_llanta`) ya existe desde la migración inicial.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas.

**Storage**: PostgreSQL gestionado por Supabase. Una sola migración nueva: aplica
`docs/schema-reference/schema_10_mantenimiento_ajustes.sql` tal cual (research.md R1) — agrega
`mantenimiento_detalles.cantidad`, `mantenimientos.motivo_cancelacion`, y reemplaza el trigger de
inmutabilidad genérico (compartido hasta ahora con `cargas_combustible`) por uno propio — más 2
triggers de auditoría (`private.audit_mantenimientos()` dedicada, `private.audit_catalogo()`
reutilizada para `mantenimiento_detalles`, research.md R11). Ninguna política de RLS se modifica.
**Orden de aplicación**: si la migración de Combustible (007) todavía no se ha aplicado en el
mismo entorno, MUST aplicarse antes que la de esta feature (data-model.md, nota al final).

**Testing**: Playwright, mismo patrón de sesiones pre-autenticadas por rol de features
anteriores. Archivo nuevo: `tests/e2e/mantenimiento.spec.ts`; casos de RLS en
`tests/e2e/rls.spec.ts` (positivo: admin/operario con `cancelar` sí puede; negativo: operario sin
`cancelar` no puede — constitución §4).

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt — esta feature no agrega
nada a `server/api/` (research.md R7) ni funciones RPC de Postgres nuevas (research.md R13).

**Performance Goals**: sin metas de throughput específicas.

**Constraints**: WCAG 2.1 AA en el formulario de captura multi-línea y el listado (constitución
§4); todo aislado por empresa vía RLS ya existente. Dependencia de orden de migraciones con
Combustible (007) — ver Storage arriba.

**Scale/Scope**: 3 historias de usuario, 1 migración con 6 cambios de esquema (2 columnas, 1
trigger reemplazado, 1 función vieja eliminada, 2 triggers de auditoría nuevos), 1 composable
dedicado, 3 páginas nuevas (sin edición — inmutable), 1 componente de formulario de captura
multi-línea + 1 de cancelación.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración. |
| §1 Monolito modular, un solo repo/deploy | 1 módulo nuevo (`mantenimiento`) dentro del mismo proyecto, sin apps ni deploys nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell existente; páginas nuevas siguen el layout `admin` ya construido. |
| §2 RLS obligatorio en toda tabla | `mantenimientos`/`mantenimiento_detalles` ya tienen RLS granular desde la migración inicial — sin tablas nuevas, sin cambios de política necesarios. |
| §2 `service_role` nunca al cliente | No aplica: sin `service_role`, sin RPC nueva (research.md R7, R13). |
| §2 Bitácora de auditoría | `private.audit_mantenimientos()` dedicada (crear/cancelar/editar) + `private.audit_catalogo()` reutilizada para las líneas (research.md R11) — construido desde el inicio, no como corrección posterior (a diferencia de Combustible, 007). |
| §2 Inmutabilidad de mantenimientos | Es el núcleo de la feature: FR-010/FR-017, trigger `private.solo_permite_cancelar_mantenimiento()` (research.md R1); las líneas heredan inmutabilidad vía RLS `using (false)` en `UPDATE`/`DELETE` (data-model.md). |
| §2 Eliminación valida dependientes | No aplica — esta feature no elimina órdenes (`mantenimientos_no_delete` ya bloquea `DELETE` para todo rol); la eliminación de vehículos/proveedores/productos con órdenes dependientes ya está cubierta por esas features. |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe `insert`/`update` a `tiene_permiso('mantenimiento','crear'\|'cancelar')` (o admin/superusuario) — sin endpoints nuevos que verificar. |
| §3 Archivos validados por tipo/tamaño | `validarArchivo()` (PDF/JPG/PNG, ≤10MB) ya cubre exactamente lo que pide FR-009 — reutilizado tal cual (research.md R3, mismo patrón que Combustible). |
| §3 Sin datos fiscales/credenciales en logs | No aplica — ningún campo de esta feature es credencial. |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | Tests nuevos en `rls.spec.ts`: operario sin `cancelar` bloqueado (negativo) + con `cancelar` otorgado sí puede (positivo), mismo patrón ya establecido. |
| §4 Prueba automatizada por cada regla de negocio explícita | Incluye, siguiendo la lección de Combustible (hallazgos A2/A3 de `/speckit-analyze`), pruebas de bypass de UI contra el trigger de inmutabilidad y contra el bloqueo de `UPDATE`/`DELETE` de `mantenimiento_detalles` — no solo verificación manual en Foundational (a documentar en `tasks.md`). |
| §4 WCAG 2.1 AA | Mismo patrón accesible ya usado en Combustible/Vehículos/Conductores. |
| §4 Alertas automáticas de vencimiento | Explícitamente fuera de alcance (spec.md, "Fuera de Alcance") — mismo criterio documentado ya para Vehículos/Conductores (constitución §4, excepción registrada). |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md` 16/16, sin `## Clarifications` porque el spec no generó ningún `[NEEDS CLARIFICATION]`). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/mantenimiento.md` no introducen
ninguna excepción a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/008-mantenimiento/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md              # Fase 1
├── quickstart.md              # Fase 1
├── contracts/                 # Fase 1
│   └── mantenimiento.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores. Esta feature no agrega nada a `server/api/`
(research.md R7) — reutiliza el patrón de páginas separadas de Combustible/Vehículos/Conductores
(research.md R2), sin `[id]/editar.vue`.

```text
flotillas/
├── app/
│   ├── components/
│   │   └── mantenimiento/
│   │       ├── FormularioOrden.vue         # captura (US1) — datos de orden + lista dinámica de líneas condicionales
│   │       └── DialogoCancelarOrden.vue    # modal de cancelación con motivo obligatorio (US3)
│   ├── composables/
│   │   └── useMantenimientos.ts            # dedicado (contracts/mantenimiento.md)
│   └── pages/admin/
│       └── mantenimiento/
│           ├── index.vue                   # listado + filtros (US2)
│           ├── nuevo.vue                   # captura (US1)
│           └── [id]/index.vue              # detalle, líneas, historial de factura, cancelar (US1/US2/US3)
├── supabase/
│   └── migrations/
│       └── <timestamp>_mantenimiento_ajustes.sql
├── tests/
│   └── e2e/
│       ├── mantenimiento.spec.ts           # nuevo
│       └── rls.spec.ts                     # + casos del módulo mantenimiento
```

**Structure Decision**: páginas separadas, sin modal-en-listado (research.md R2) — mismo criterio
que Combustible, reforzado aquí porque la captura es más compleja todavía (líneas dinámicas con
campos condicionales por tipo de producto). Sin `useCatalogo.ts` ni reutilización de
`TablaCatalogo.vue` (research.md R10): el listado necesita 5 filtros combinables. La captura
multi-línea usa un array reactivo en el propio `FormularioOrden.vue` (estado de UI, no
persistido hasta el envío) — sin componente de "línea" reutilizable fuera de este formulario, ya
que sus campos condicionales son específicos de esta feature.

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
