# Implementation Plan: Combustible

**Branch**: `007-combustible` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-combustible/spec.md`

## Summary

Permite capturar cargas de combustible por vehículo (fecha, odómetro, producto, cantidad, costo,
factura opcional), inmutables una vez guardadas salvo por una cancelación irreversible con
motivo obligatorio. Valida que el odómetro capturado no retroceda contra la última carga activa
del mismo vehículo, en dos capas (cliente + trigger de BD). El trabajo de esquema nuevo es
`schema_09_combustible_ajustes.sql` (`motivo_cancelacion`, trigger de odómetro, trigger de
inmutabilidad propio) más un trigger de auditoría dedicado que `schema_09` no incluye
(`private.audit_cargas_combustible()`, research.md R11 — `cargas_combustible` era la única tabla
de negocio del proyecto sin ninguno, hallazgo A1 de `/speckit-analyze`) — todo lo demás (tabla,
RLS granular, módulo de permisos `combustible`, bucket `documentos`, enum `tipo_archivo` con
`'factura'`) ya existe desde la migración inicial.
Enfoque técnico: páginas separadas (como Vehículos/Conductores), no modal-en-listado, porque el
formulario de captura y el detalle (historial de factura, cancelar) son demasiado ricos para un
modal.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas.

**Storage**: PostgreSQL gestionado por Supabase. Una sola migración nueva: aplica
`docs/schema-reference/schema_09_combustible_ajustes.sql` tal cual (research.md R1) — agrega
`motivo_cancelacion` a `cargas_combustible`, el trigger de validación de odómetro creciente
(respaldo de BD de FR-003), y reemplaza el trigger de inmutabilidad genérico (compartido hasta
ahora con `mantenimientos`) por uno propio que permite la transición a `cancelado` junto con su
motivo, y el cambio de `factura_archivo_id` mientras el registro siga activo — más un trigger de
auditoría dedicado, `private.audit_cargas_combustible()` (research.md R11), que `schema_09` no
incluye: `cargas_combustible` era la única tabla de negocio del proyecto sin ningún trigger de
auditoría (`/speckit-analyze`, hallazgo A1). Ninguna política de RLS se modifica — las ya
existentes (`cargas_combustible_select`/`insert`/`update_solo_cancelar`) cubren exactamente lo
que esta feature necesita.

**Testing**: Playwright, mismo patrón de sesiones pre-autenticadas por rol de features
anteriores. Archivo nuevo: `tests/e2e/combustible.spec.ts`; casos de RLS en
`tests/e2e/rls.spec.ts` (positivo: admin/operario con `cancelar` sí puede; negativo: operario sin
`cancelar` no puede — constitución §4).

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt — esta feature no agrega
nada a `server/api/` (research.md R7).

**Performance Goals**: sin metas de throughput específicas; sin criterio de tiempo propio en
`spec.md` más allá de los SC ya cubiertos por validación en el momento de guardar (SC-001,
SC-002).

**Constraints**: WCAG 2.1 AA en el formulario de captura y el listado (constitución §4); todo
aislado por empresa vía RLS ya existente.

**Scale/Scope**: 3 historias de usuario, 1 migración con 4 cambios de esquema (columna, trigger,
trigger reemplazado, trigger de auditoría nuevo — research.md R11), 1 composable dedicado, 3
páginas nuevas (sin edición — inmutable), 1 componente de formulario de captura + 1 de
cancelación.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración. |
| §1 Monolito modular, un solo repo/deploy | 1 módulo nuevo (`combustible`) dentro del mismo proyecto, sin apps ni deploys nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell existente; páginas nuevas siguen el layout `admin` ya construido. |
| §2 RLS obligatorio en toda tabla | `cargas_combustible` ya tiene RLS granular por permiso desde la migración inicial — sin tablas nuevas, sin cambios de política necesarios. |
| §2 `service_role` nunca al cliente | No aplica: sin `service_role` (research.md R7). |
| §2 Bitácora de auditoría | **Corregido tras `/speckit-analyze` (hallazgo A1)**: `cargas_combustible` no tenía ningún trigger de auditoría en ninguna migración previa — a diferencia de toda otra tabla de negocio del proyecto. Esta feature agrega `private.audit_cargas_combustible()` dedicada + su trigger como parte de la migración de esta feature (research.md R11, data-model.md). |
| §2 Inmutabilidad de cargas de combustible | Es el núcleo de la feature: FR-008/FR-014, trigger `private.solo_permite_cancelar_combustible()` (research.md R1). |
| §4 Prueba automatizada por cada regla de negocio explícita | **Reforzado tras `/speckit-analyze` (hallazgos A2/A3)**: además de la prueba de UI de FR-003 (odómetro decreciente rechazado antes de guardar), se agrega una prueba que ataca el respaldo de BD directo (bypaseando el formulario) para confirmar que el trigger `private.validar_odometro_creciente()` también rechaza por sí solo; y una prueba dedicada que confirma que un intento directo de editar un campo operativo/financiero de una carga **activa** es rechazado por `private.solo_permite_cancelar_combustible()` (FR-008) — ninguna de las dos dependía solo de la verificación manual única de Foundational. |
| §2 Eliminación valida dependientes | No aplica — esta feature no elimina cargas de combustible (`cargas_combustible_no_delete` ya bloquea `DELETE` para todo rol); la eliminación de vehículos/proveedores con cargas dependientes ya está cubierta por esas features. |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe `insert`/`update` a `tiene_permiso('combustible','crear'\|'cancelar')` (o admin/superusuario) — sin endpoints nuevos que verificar. |
| §3 Archivos validados por tipo/tamaño | `validarArchivo()` (PDF/JPG/PNG, ≤10MB, `app/utils/archivos.ts`) ya cubre exactamente lo que pide FR-007 — reutilizado tal cual (research.md R3). |
| §3 Sin datos fiscales/credenciales en logs | No aplica — ningún campo de esta feature es credencial. |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | Tests nuevos en `rls.spec.ts`: operario sin `cancelar` bloqueado (negativo) + con `cancelar` otorgado sí puede (positivo), mismo patrón ya establecido. |
| §4 WCAG 2.1 AA | Mismo patrón accesible ya usado en Vehículos/Conductores (labels de Vuetify, tablas con encabezados). |
| §4 Alertas automáticas de vencimiento | No aplica — ninguna columna de esta feature es una fecha de vencimiento. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md`, `## Clarifications` con 3 preguntas ya resueltas en sesión 2026-08-10). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/cargas-combustible.md` no
introducen ninguna excepción a lo anterior. Se confirma el gate.*

*(Re-chequeo post-`/speckit-analyze`): 3 hallazgos (A1 CRITICAL, A2 CRITICAL, A3 HIGH) resueltos
actualizando `research.md` (R11), `data-model.md` (auditoría, extensiones de esquema) y `tasks.md`
(trigger de auditoría en Foundational, prueba de `accion='cancelar'` en US3, 2 pruebas de
bypass-de-BD en Polish). Gate reconfirmado con las correcciones aplicadas.*

## Project Structure

### Documentation (this feature)

```text
specs/007-combustible/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md               # Fase 1
├── quickstart.md               # Fase 1
├── contracts/                  # Fase 1
│   └── cargas-combustible.md
├── checklists/
│   └── requirements.md
└── tasks.md                    # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores. Esta feature no agrega nada a `server/api/`
(research.md R7) — reutiliza el patrón de páginas separadas de Vehículos/Conductores
(research.md R2), sin `[id]/editar.vue` porque no existe ninguna edición posible sobre una carga
ya guardada.

```text
flotillas/
├── app/
│   ├── components/
│   │   └── combustible/
│   │       ├── FormularioCarga.vue        # captura (US1) — selectores, autocálculo de costo total, adjunto de factura
│   │       └── DialogoCancelar.vue         # modal de cancelación con motivo obligatorio (US3)
│   ├── composables/
│   │   └── useCargasCombustible.ts         # dedicado (contracts/cargas-combustible.md)
│   └── pages/admin/
│       └── combustible/
│           ├── index.vue                   # listado + filtros (US2)
│           ├── nuevo.vue                   # captura (US1)
│           └── [id]/index.vue              # detalle, historial de factura, cancelar (US1/US3)
├── supabase/
│   └── migrations/
│       └── <timestamp>_combustible_ajustes.sql
├── tests/
│   └── e2e/
│       ├── combustible.spec.ts             # nuevo
│       └── rls.spec.ts                     # + casos del módulo combustible
```

**Structure Decision**: páginas separadas, sin modal-en-listado (research.md R2) — el formulario
de captura (7 campos + selectores filtrados + validación cruzada de odómetro + adjunto opcional)
y el detalle (historial de factura, acción de cancelar) son más ricos que lo que un modal sobre
el listado puede absorber con claridad, mismo criterio ya aplicado en Vehículos/Conductores. Sin
`useCatalogo.ts` ni reutilización de `TablaCatalogo.vue` (research.md R10): el listado necesita 4
filtros combinables, no un único buscador de texto — sí replica el patrón visual de paginación
cliente (5/10/20, default 10) para consistencia con el resto de la app
(`docs/design-system.md`).

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
