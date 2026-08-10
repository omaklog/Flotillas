# Implementation Plan: Asignación Conductor-Vehículo

**Branch**: `005-asignacion-conductor-vehiculo` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-asignacion-conductor-vehiculo/spec.md`

## Summary

Construye la capa de aplicación sobre `asignaciones_conductor_vehiculo` (tabla y RLS ya creadas y
verificadas por Feature 004): dos pestañas nuevas — "Conductor Asignado" en el detalle del
vehículo y "Vehículos Asignados" en el detalle del conductor —, un único mutador de escritura
(`asignar`, que cierra la asignación activa del vehículo elegido si la había y abre la nueva) con
tres flujos de UI distintos según las reglas ya confirmadas en `spec.md` (reemplazo automático sin
fricción desde el vehículo, advertencia informativa desde el vehículo si el conductor ya está
ocupado en otro lado, confirmación fuerte y obligatoria desde el conductor si el vehículo elegido
ya tiene otro conductor activo), la capacidad de finalizar una asignación sin reemplazarla, y un
indicador de "sin conductor" en el listado de vehículos. De paso corrige dos gaps reales
encontrados al revisar el código actual: la tabla no tenía trigger de auditoría, y
`useVehiculos.ts` no traducía su error de eliminación bloqueada a un mensaje específico para esta
tabla. Enfoque técnico: sin `server/api/` nuevos, igual que Vehículos y Conductores.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas: esta feature no sube archivos, no necesita nada del área de
Storage.

**Storage**: PostgreSQL gestionado por Supabase. Tabla `asignaciones_conductor_vehiculo` ya
existente (ver `data-model.md`); una migración nueva solo agrega su trigger de auditoría
(reutilizando `private.audit_catalogo()`, sin función nueva).

**Testing**: Playwright, mismo patrón de sesiones pre-autenticadas por rol de features anteriores.
Nuevo spec de feature (`asignaciones.spec.ts`) más el caso RLS positivo/negativo obligatorio
(constitución §4) en `rls.spec.ts` — mismo criterio que Vehículos y Conductores.

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt — esta feature no agrega
nada a `server/api/` (research.md R6).

**Performance Goals**: sin metas de throughput específicas; objetivo cualitativo alineado a
`spec.md` SC-001: reasignar el conductor de un vehículo en menos de 1 minuto.

**Constraints**: WCAG 2.1 AA en selectores y diálogos de confirmación (constitución §4); toda
escritura queda auditada (constitución §2, research.md R2); las pantallas nuevas siguen
`docs/design-system.md` y los patrones de layout ya construidos en Vehículos/Conductores — no
existe todavía una referencia de Stitch propia para esta feature (research.md R8).

**Scale/Scope**: 3 historias de usuario, 0 tablas nuevas (solo 1 trigger de auditoría sobre una
tabla existente + 1 ajuste de una línea en `useVehiculos.ts`), 2 pestañas nuevas + 2 componentes
nuevos + 1 composable nuevo + 1 badge nuevo en el listado de vehículos ya existente, sin
`server/api/` nuevo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración; nuevos componentes/composables siguen el mismo `nuxt.config.ts` ya estricto. |
| §1 Monolito modular, un solo repo/deploy | Módulo dentro del mismo proyecto Nuxt (`components/vehiculos/`, `components/conductores/`), sin microservicios ni proyectos nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell PWA existente; pantallas nuevas viven dentro de los detalles ya construidos, mismo layout `admin.vue`. |
| §2 RLS obligatorio en toda tabla | `asignaciones_conductor_vehiculo` ya tiene RLS completa (research.md R1) — ninguna tabla nueva que cubrir. |
| §2 `service_role` nunca al cliente | No aplica: esta feature no usa `service_role` en absoluto (research.md R6). |
| §2 Bitácora de auditoría | Gap identificado y cerrado: la tabla no tenía trigger; se agrega reutilizando `private.audit_catalogo()` ya existente, sin función nueva (research.md R2). |
| §2 Integridad referencial de negocio en eliminaciones | Ya garantizada por las FK existentes de `asignaciones_conductor_vehiculo` hacia `vehiculos`/`conductores` (sin `ON DELETE CASCADE`, desde Feature 004); esta feature cierra un segundo gap encontrado: el mensaje de error al eliminar un vehículo no reconocía esta tabla como dependiente (research.md R3, FR-012) — Conductores ya lo tenía resuelto para su propio lado. |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe escritura a `admin`/`superusuario` o `tiene_permiso('vehiculos'\|'conductores','editar')`; no hay endpoint nuevo que verificar porque no hay endpoints nuevos. |
| §3 Sin datos fiscales/credenciales en logs | Ningún campo de esta feature es fiscal ni credencial. |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | quickstart.md Escenario 7: operario con solo `'ver'` en ambos módulos puede leer pero no escribir; con `'editar'` otorgado en cualquiera de los dos módulos, sí puede — se traduce a test Playwright explícito en `rls.spec.ts`, cubriendo ambas direcciones (mismo criterio reforzado tras el hallazgo E1 de `/speckit-analyze` tras Conductores). |
| §4 WCAG 2.1 AA | Vuetify + labels/aria explícitos en los nuevos selectores y diálogos de confirmación, mismo patrón ya usado en Vehículos/Conductores. |
| §4 Alertas automáticas de vencimiento | No aplica — esta feature no introduce ningún campo de fecha de vencimiento; la excepción documentada en la constitución §4 (Feature 004) es para módulos con vencimiento, no para este. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado y clarificado (`checklists/requirements.md` 16/16, `## Clarifications` con 1 pregunta resuelta). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/asignaciones.md` no introducen
ninguna excepción a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/005-asignacion-conductor-vehiculo/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md              # Fase 1
├── quickstart.md              # Fase 1
├── contracts/                 # Fase 1
│   └── asignaciones.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores. Esta feature no agrega nada a `server/api/`
(research.md R6) — todo el trabajo nuevo vive en `app/` y en `supabase/migrations/`.

```text
flotillas/
├── app/
│   ├── components/
│   │   ├── vehiculos/
│   │   │   └── ConductorAsignado.vue          # pestaña "Conductor Asignado" del detalle del vehículo
│   │   └── conductores/
│   │       └── VehiculosAsignados.vue         # pestaña "Vehículos Asignados" del detalle del conductor
│   ├── composables/
│   │   └── useAsignaciones.ts                 # asignar/finalizar + lecturas de historial y conflictos (research.md R4, R7)
│   └── pages/
│       └── admin/
│           ├── vehiculos/
│           │   ├── index.vue                   # + indicador "Sin conductor" (FR-013)
│           │   └── [id]/index.vue               # + pestaña "Conductor Asignado"
│           └── conductores/
│               └── [id]/index.vue               # + pestaña "Vehículos Asignados"
├── supabase/
│   └── migrations/
│       └── <timestamp>_asignaciones_conductor_vehiculo_auditoria.sql   # trigger de auditoría (research.md R2)
├── tests/
│   └── e2e/
│       └── asignaciones.spec.ts
```

**Structure Decision**: se extiende el mismo proyecto Nuxt único, sin paquetes ni repos
adicionales (constitución §1). No se crea ninguna página nueva bajo `admin/` — a diferencia de
Vehículos/Conductores (que sí tuvieron listado/alta/detalle propios), esta feature vive
enteramente como pestañas nuevas dentro de detalles ya existentes, reflejando la decisión
confirmada de `spec.md` ("se asigna desde ambos lados", no una pantalla dedicada). `useAsignaciones.ts`
es un composable propio (research.md R7), no una extensión de `useVehiculos.ts`/`useConductores.ts`.

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
