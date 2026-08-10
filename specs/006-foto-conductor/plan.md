# Implementation Plan: Foto del Conductor

**Branch**: `006-foto-conductor` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-foto-conductor/spec.md`

## Summary

Extiende Conductores (004) con la capacidad de adjuntar y reemplazar una foto, replicando el
patrón ya construido y validado en Vehículos ("foto del vehículo", 003, US-3.7): opcional,
JPG/PNG hasta 10 MB, sin historial (reemplazo elimina la anterior en el mismo momento). La única
decisión técnica propia de esta feature (no una copia directa) es que la foto del conductor usa
su propio valor de enum (`foto_conductor`) y su propio segmento de carpeta en Storage, en vez de
reutilizar el `foto` ya usado por Vehículos — necesario para que las políticas de `storage.objects`
(generalizadas por módulo en Conductores 004) enruten correctamente el permiso a `conductores`, no
a `vehiculos`. Enfoque técnico: sin `server/api/` nuevos, igual que el resto del proyecto.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas.

**Storage**: PostgreSQL gestionado por Supabase. Una migración nueva agrega el valor de enum
`foto_conductor`, la columna `conductores.foto_archivo_id`, y regenera las 4 políticas de
`storage.objects` del bucket `documentos` (ya existente) con la rama nueva — ver `data-model.md`.

**Testing**: Playwright, mismo patrón de sesiones pre-autenticadas por rol de features anteriores.
Se extiende `tests/e2e/conductores.spec.ts` (mismo archivo donde ya viven los tests de US1-US6 de
Conductores) más un caso de aislamiento de Storage en `rls.spec.ts`.

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt — esta feature no agrega
nada a `server/api/` (research.md R5).

**Performance Goals**: sin metas de throughput específicas; sin criterio de tiempo propio en
`spec.md` más allá de "visible de inmediato" (SC-001).

**Constraints**: WCAG 2.1 AA en la zona de adjuntar foto (constitución §4); el bucket `documentos`
(ya privado) sigue aislado por empresa también para `foto_conductor` (research.md R2); tipo de
archivo restringido a JPG/PNG, máximo 10 MB (spec.md, mismos límites que Vehículos); no existe
todavía una referencia de Stitch propia — se sigue el patrón visual ya construido en la foto del
vehículo (research.md R4).

**Scale/Scope**: 1 historia de usuario, 1 columna nueva + 1 valor de enum nuevo + regeneración de
4 políticas de Storage sobre esquema existente, 1 dropzone nuevo en un formulario ya existente +
1 imagen nueva en un detalle ya existente, sin páginas ni `server/api/` nuevos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración. |
| §1 Monolito modular, un solo repo/deploy | Extiende el módulo `conductores` ya existente, sin proyectos nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell existente; la foto se agrega a pantallas ya construidas. |
| §2 RLS obligatorio en toda tabla | Sin tablas nuevas; la columna nueva de `conductores` queda cubierta por la RLS ya existente de esa tabla; `storage.objects` recibe la rama nueva dentro de sus políticas ya existentes. |
| §2 `service_role` nunca al cliente | No aplica: sin `service_role` (research.md R5). |
| §2 Bitácora de auditoría | `conductores` ya audita todos sus `UPDATE` (incluido `foto_archivo_id`) vía el trigger de Feature 004 — sin cambios necesarios. |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe escritura a `admin`/`superusuario` o `tiene_permiso('conductores','editar')` — sin endpoints nuevos que verificar. |
| §3 Archivos adjuntos validados, nunca servidos como HTML | Tipo (JPG/PNG) y tamaño (10 MB) validados antes de subir (FR-002); bucket privado, descarga vía URL firmada. |
| §3 Sin datos fiscales/credenciales en logs | No aplica — ningún campo de esta feature es fiscal ni credencial. |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | quickstart.md Escenario 5 (positivo: operario con permiso solo en `conductores` sí puede) y Notas de validación no funcional (negativo: aislamiento cross-empresa) — se traducen a tests explícitos. |
| §4 WCAG 2.1 AA | Mismo patrón accesible ya usado en la zona de adjuntar archivo de Vehículos/Conductores (`role="button"`, `tabindex`, `aria-label`). |
| §4 Alertas automáticas de vencimiento | No aplica — esta feature no introduce ningún campo de fecha de vencimiento. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md` 16/16, sin `## Clarifications` porque no hubo preguntas pendientes). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/foto-conductor.md` no introducen
ninguna excepción a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/006-foto-conductor/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md              # Fase 1
├── quickstart.md              # Fase 1
├── contracts/                 # Fase 1
│   └── foto-conductor.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores. Esta feature no agrega nada a `server/api/`
(research.md R5) ni páginas nuevas — solo modifica archivos ya existentes.

```text
flotillas/
├── app/
│   ├── components/conductores/FormularioConductor.vue   # + dropzone de foto (mismo patrón que FormularioVehiculo.vue)
│   ├── composables/useConductores.ts                     # + adjuntarFoto(conductorId, archivo)
│   └── pages/admin/conductores/
│       ├── nuevo.vue                                      # + llamar adjuntarFoto tras crear (best-effort, FR-005)
│       └── [id]/
│           ├── editar.vue                                 # + llamar adjuntarFoto tras editar
│           └── index.vue                                  # + mostrar la foto vigente (FR-006)
├── supabase/
│   └── migrations/
│       └── <timestamp>_conductores_foto.sql               # enum foto_conductor + columna + políticas de storage.objects (data-model.md)
├── tests/
│   └── e2e/
│       ├── conductores.spec.ts                             # + tests de esta feature
│       └── rls.spec.ts                                     # + aislamiento de Storage para foto_conductor
```

**Structure Decision**: sin páginas ni componentes nuevos aparte del dropzone dentro de
`FormularioConductor.vue` — feature aditiva sobre archivos ya existentes, reflejando su alcance
acotado (spec.md: 1 sola historia de usuario). Mismo criterio de "no server/api/" y "no
duplicar composables" ya establecido en Vehículos/Conductores.

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
