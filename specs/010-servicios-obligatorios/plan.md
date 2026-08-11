# Implementation Plan: Bitácora de Servicios Obligatorios

**Branch**: `010-servicios-obligatorios` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-servicios-obligatorios/spec.md`

## Summary

Registro editable (no inmutable) de los 3 servicios obligatorios de cumplimiento normativo por
vehículo, cada uno con fecha de realización, fecha de vencimiento, y un comprobante opcional.
A diferencia de Combustible/Mantenimiento/Checklist, el esquema base para esta feature ya está
casi completo desde la migración inicial del proyecto — tabla, enum de tipos, RLS granular con
`tiene_permiso()`, y el módulo de permisos ya sembrado (research.md R1). El único trabajo de
esquema nuevo es aplicar `schema_12_tipo_archivo_testigo.sql` (nuevo valor de enum para el
comprobante) más un trigger de auditoría que ninguna migración le agregó todavía (research.md R3,
mismo tipo de gap ya encontrado y corregido en 007/008/009). Un hallazgo importante de esta fase
de planeación (research.md R2): la política RLS de escritura solo verifica el permiso `'editar'`
para las 3 acciones (crear/editar/eliminar) — la UI debe gatearlas todas por `'editar'`, no por
`'crear'`/`'eliminar'` como sus nombres en el catálogo de permisos sugerirían.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas.

**Storage**: PostgreSQL gestionado por Supabase. Una sola migración nueva: aplica
`docs/schema-reference/schema_12_tipo_archivo_testigo.sql` tal cual (agrega `'testigo_servicio'`
al enum `tipo_archivo`) más un trigger de auditoría nuevo reutilizando
`private.audit_catalogo()` genérica (research.md R1, R3, data-model.md). Ninguna política RLS
existente se modifica — `servicios_obligatorios_select`/`_write` ya usan `tiene_permiso()` desde
`20260806044220_modulos_y_permisos.sql`/`20260806044221_permisos_ver_y_defaults.sql`.

**Testing**: Playwright, mismo patrón de sesiones/empresas aisladas por test de
Combustible/Mantenimiento/Checklist. Archivo nuevo: `tests/e2e/servicios-obligatorios.spec.ts`;
casos de RLS en `tests/e2e/rls.spec.ts`.

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt — esta feature no agrega
nada a `server/api/` (mismo criterio que todas las features anteriores).

**Performance Goals**: sin metas de throughput específicas.

**Constraints**: WCAG 2.1 AA en los formularios y tablas de captura (constitución §4); todo
aislado por empresa vía RLS ya existente. Mismo riesgo de límite de 1000 filas de PostgREST sobre
el selector de vehículo sin paginar ya documentado en Combustible (research.md R8) — tests de
captura MUST usar empresas aisladas.

**Scale/Scope**: 3 historias de usuario, 1 migración con 2 cambios de esquema (1 valor de enum +
1 trigger de auditoría — el esquema base, RLS y catálogo de permisos ya existen), 1 composable
dedicado, 4 páginas nuevas (listado, captura, edición, detalle) compartiendo 1 formulario
(research.md R6).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración. |
| §1 Monolito modular, un solo repo/deploy | 1 módulo nuevo (`servicios_obligatorios`) dentro del mismo proyecto, sin apps ni deploys nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell existente; páginas nuevas siguen el layout `admin` ya construido. |
| §2 RLS obligatorio en toda tabla | `servicios_obligatorios` ya tiene RLS completa (`_select`/`_write` con `tiene_permiso()`) desde las migraciones de permisos iniciales — sin cambios de política necesarios (research.md R1). |
| §2 `service_role` nunca al cliente | No aplica: sin `service_role`, sin RPC nueva. |
| §2 Bitácora de auditoría | 1 trigger reutilizando `private.audit_catalogo()` genérica, agregado en esta migración porque ninguna migración previa lo hizo (research.md R3) — aplicando la lección de 007/008/009 en cuanto se detecta, no después. |
| §2 Inmutabilidad de combustible/mantenimiento | No aplica a esta feature — `spec.md` § Decisiones confirma explícitamente que `servicios_obligatorios` NO es inmutable; es un registro administrativo editable/eliminable libremente por diseño original del esquema (FR-006, FR-007). |
| §2 Eliminación valida dependientes | No aplica — ninguna tabla referencia `servicios_obligatorios.id` (data-model.md); eliminar nunca se bloquea (FR-007). |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe `insert`/`update`/`delete` a `tiene_permiso('servicios_obligatorios','editar')` (o admin/superusuario) — sin endpoints nuevos que verificar. La UI gatea las 3 acciones por ese mismo permiso (research.md R2). |
| §3 Archivos validados por tipo/tamaño | El comprobante reutiliza `validarArchivo()` ya existente (PDF/JPG/PNG, 10 MB) — sin validación nueva que escribir. |
| §3 Sin datos fiscales/credenciales en logs | No aplica — ningún campo de esta feature es credencial. |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | Tests nuevos en `rls.spec.ts`: operario sin `editar` bloqueado en crear/editar/eliminar (negativo) + con `editar` otorgado sí puede (positivo) — incluyendo el caso específico de que otorgar solo `crear` o solo `eliminar` NO basta (research.md R2), un caso negativo que las demás features no tuvieron que probar. |
| §4 WCAG 2.1 AA | Mismo patrón accesible ya usado en Combustible/Mantenimiento/Checklist. |
| §4 Alertas automáticas de vencimiento | Fuera de alcance de esta feature (spec.md) — pertenece a una futura feature de Alertas/Dashboard que consumirá `fecha_vencimiento` como fuente de datos. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md` 16/16, sin `/speckit-clarify` necesario — el usuario no dejó preguntas abiertas y `/speckit-clarify` confirmó cero ambigüedades críticas). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/servicios-obligatorios.md` no
introducen ninguna excepción a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/010-servicios-obligatorios/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md              # Fase 1
├── quickstart.md              # Fase 1
├── contracts/                 # Fase 1
│   └── servicios-obligatorios.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores. Esta feature no agrega nada a `server/api/`
— reutiliza el patrón de páginas separadas de Combustible/Mantenimiento/Checklist para captura/
listado/detalle (research.md R5), con un único formulario compartido entre alta y edición
(research.md R6, a diferencia de esas 3 features anteriores, que no tienen edición real).

```text
flotillas/
├── app/
│   ├── components/
│   │   └── servicios-obligatorios/
│   │       └── FormularioServicioObligatorio.vue  # alta Y edición (research.md R6)
│   ├── composables/
│   │   └── useServiciosObligatorios.ts
│   └── pages/admin/
│       └── servicios-obligatorios/
│           ├── index.vue                    # listado + filtros (US-10.2)
│           ├── nuevo.vue                    # registro (US-10.1)
│           └── [id]/
│               ├── index.vue                # detalle de solo lectura (US-10.2)
│               └── editar.vue                # edición (US-10.3)
├── supabase/
│   └── migrations/
│       └── <timestamp>_servicios_obligatorios_ajustes.sql
├── tests/
│   └── e2e/
│       ├── servicios-obligatorios.spec.ts   # nuevo
│       └── rls.spec.ts                      # + casos del módulo servicios_obligatorios
```

**Structure Decision**: `[id]/editar.vue` separado del detalle de solo lectura (a diferencia de
Checklist, que no tiene ninguna edición) — mismo patrón ya usado en Vehículos/Conductores/Tipos de
Vehículo para catálogos editables. El formulario en sí (`FormularioServicioObligatorio.vue`) es
uno solo, reutilizado por `nuevo.vue` y `[id]/editar.vue` con un `registro?` opcional
(research.md R6).

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
