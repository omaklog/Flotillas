# Implementation Plan: Historial por Vehículo y Bitácora de Auditoría

**Branch**: `011-historial-auditoria` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-historial-auditoria/spec.md`

## Summary

Dos pantallas de solo lectura sobre datos que ya existen. (1) Una pestaña "Actividad" en el
detalle de vehículo con una línea de tiempo operativa, armada componiendo en el cliente las 5
consultas ya existentes de Combustible/Mantenimiento/Checklist/Servicios
Obligatorios/Asignaciones — no una consulta SQL nueva (research.md R2). (2) Una pantalla
"Bitácora de Auditoría", exclusiva de administrador/superusuario, sobre la tabla `auditoria` ya
existente, con un diff legible calculado en el cliente a partir de `valores_antes`/
`valores_despues`. El trabajo de esquema nuevo es mínimo: la descripción original de la feature
asumía que había que aplicar `schema_13_bitacora_auditoria_automatica.sql` completo para poblar
auditoría automáticamente, pero se encontró que las 19 tablas que ese script conecta **ya tienen,
cada una, su propio trigger de auditoría** desde Features 001-010 — aplicarlo tal cual duplicaría
cada fila de auditoría (research.md R1, spec.md § Assumptions). Solo falta un trigger sobre
`usuario_permisos`, la única tabla sin cobertura previa.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas (research.md R7 — el diff se calcula con una función propia,
sin librería de diffing).

**Storage**: PostgreSQL gestionado por Supabase. Una sola migración nueva, con exactamente 2
statements: `private.registrar_auditoria()` (versión simplificada, solo para `usuario_permisos`)
y su trigger (research.md R1, data-model.md). Ninguna tabla, política RLS, ni trigger de
auditoría existente se modifica.

**Testing**: Playwright, mismo patrón de sesiones/empresas aisladas por test de features
anteriores. Archivo nuevo: `tests/e2e/historial-auditoria.spec.ts`; casos de RLS en
`tests/e2e/rls.spec.ts`.

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt — esta feature no agrega
nada a `server/api/` (mismo criterio que todas las features anteriores).

**Performance Goals**: sin metas de throughput específicas. La línea de tiempo hace 5 consultas
en paralelo (`Promise.all`) por vehículo — acotadas por diseño a los eventos de un solo vehículo,
volumen naturalmente bajo incluso para una flotilla activa.

**Constraints**: WCAG 2.1 AA en ambas pantallas (constitución §4). Mismo riesgo de límite de 1000
filas de PostgREST ya documentado en features anteriores, aplicado aquí a la bitácora de
auditoría (sin filtro, puede crecer sin límite a través de toda la empresa) — research.md R6,
documentado como Assumption, no resuelto con paginación de servidor nueva.

**Scale/Scope**: 2 historias de usuario, 1 migración con 2 statements, 2 composables nuevos
(`useHistorialVehiculo.ts`, `useAuditoria.ts`), 1 util nuevo (`app/utils/auditoria.ts` — mapeo de
entidades + cálculo de diff), 1 pestaña nueva en el detalle de vehículo existente, 1 página nueva
(`/admin/auditoria`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración. |
| §1 Monolito modular, un solo repo/deploy | Sin apps ni deploys nuevos — un composable y una página más dentro del mismo proyecto. |
| §1 PWA instalable, responsivo | Hereda el shell existente; la pestaña nueva sigue el patrón de tabs ya construido en Vehículos, la página nueva sigue el layout `admin` ya construido. |
| §2 RLS obligatorio en toda tabla | No se crea ninguna tabla nueva. `usuario_permisos` ya tiene RLS completa desde su diseño original — el trigger nuevo no la modifica, solo agrega auditoría. |
| §2 `service_role` nunca al cliente | No aplica: sin `service_role`, sin RPC nueva. |
| §2 Bitácora de auditoría | Es el tema central de esta feature — se confirma (research.md R1) que las 19 tablas de negocio ya cumplen este principio desde antes; se completa la única tabla que faltaba (`usuario_permisos`). |
| §2 Eliminación valida dependientes | No aplica — esta feature no agrega ninguna operación de escritura de negocio, es de solo lectura sobre datos existentes. |
| §3 Roles de tres niveles, sin escritura sin verificar rol | No aplica de forma directa (sin escritura nueva); la bitácora de auditoría (lectura) ya está restringida a admin/superusuario por la RLS existente de `auditoria_select`, sin cambios. |
| §3 Sin datos fiscales/credenciales en logs | No aplica — la auditoría ya excluye contraseñas/credenciales por diseño original (ninguna tabla auditada las almacena en columnas planas). |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | Tests nuevos en `rls.spec.ts`: un operario (con cualquier combinación de permisos) no puede leer `auditoria` vía cliente directo (negativo); un admin sí puede (positivo, ya cubierto implícitamente por el resto de la suite, pero se confirma explícitamente aquí). |
| §4 WCAG 2.1 AA | Mismo patrón accesible ya usado en features anteriores. |
| §4 Alertas automáticas de vencimiento | No aplica — ninguna columna de esta feature es una fecha de vencimiento. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md` 16/16, `## Clarifications` con la única pregunta del brief ya resuelta vía `/speckit-clarify`). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/historial-auditoria.md` no
introducen ninguna excepción a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/011-historial-auditoria/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md              # Fase 1
├── quickstart.md              # Fase 1
├── contracts/                 # Fase 1
│   └── historial-auditoria.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores. Esta feature no agrega nada a `server/api/`.
La línea de tiempo se integra como una pestaña más dentro de la página de detalle de vehículo ya
existente (no una página nueva); la bitácora de auditoría sí es una página nueva, siguiendo el
patrón de listado+filtros+paginación cliente ya establecido (research.md R6).

```text
flotillas/
├── app/
│   ├── components/
│   │   └── vehiculos/
│   │       └── ActividadVehiculo.vue        # línea de tiempo (US-11.1), integrada como
│   │                                          # nueva pestaña en [id]/index.vue existente
│   ├── composables/
│   │   ├── useHistorialVehiculo.ts          # nuevo (research.md R2)
│   │   └── useAuditoria.ts                  # nuevo
│   ├── utils/
│   │   └── auditoria.ts                     # entidadesAuditadas, calcularDiff (research.md R6, R7)
│   └── pages/admin/
│       └── auditoria/
│           └── index.vue                    # bitácora de auditoría (US-11.2)
├── supabase/
│   └── migrations/
│       └── <timestamp>_auditoria_usuario_permisos.sql
├── tests/
│   └── e2e/
│       ├── historial-auditoria.spec.ts      # nuevo
│       └── rls.spec.ts                      # + caso del módulo auditoria
```

**Structure Decision**: sin página de detalle propia para un evento de auditoría — cada fila se
expande in-place en la misma tabla (FR-009/FR-010), no navega a otra ruta, a diferencia de los
eventos de la línea de tiempo (que sí navegan a su feature de origen). `[id]/index.vue` de
Vehículos (Feature 003) se edita para agregar la pestaña "Actividad" junto a las 3 ya existentes
(research.md R5, nombre elegido para evitar colisión con "Historial de Póliza") — no se crea una
ruta nueva para ella, vive dentro del detalle de vehículo igual que "Conductor Asignado" y
"Permisos".

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
