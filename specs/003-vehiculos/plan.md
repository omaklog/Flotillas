# Implementation Plan: Vehículos

**Branch**: `003-vehiculos` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-vehiculos/spec.md`

## Summary

CRUD de vehículos con alta en dos pasos (el vehículo primero, la póliza adjunta después, por la
dependencia circular archivo↔vehículo), listado con búsqueda e indicador visual de vigencia de
póliza, edición con reemplazo de póliza e historial completo de versiones, baja/reactivación como
acción separada de la edición, eliminación física bloqueada por dependientes (y que además limpia
el historial de archivos del vehículo cuando sí procede), y una pestaña de asignación de permisos
por vehículo con vigencia propia. Primera feature que sube archivos de negocio (no el logo de
empresa) a Supabase Storage — establece el bucket `documentos` y su convención de carpetas que
reutilizarán Conductores, Combustible y Mantenimiento. El esquema de `vehiculos`,
`vehiculo_permisos` y `archivos`, su RLS y el módulo de permisos granulares **ya existen** desde
Feature 001 (`initial_schema.sql`, `modulos_y_permisos.sql`, `permisos_ver_y_defaults.sql`); este
plan agrega el bucket de Storage, la auditoría faltante, y construye la capa de aplicación.
Enfoque técnico: sin `server/api/` nuevos, igual que Catálogos Base — todas las operaciones,
incluida la limpieza de archivos al eliminar, se resuelven client-side vía RLS.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas: la subida/descarga de archivos usa
`@supabase/supabase-js`'s `storage` API, ya incluida en el cliente existente (mismo mecanismo que
`logos-empresas` en Feature 001, solo que privado en vez de público).

**Storage**: PostgreSQL gestionado por Supabase. Tablas de esta feature ya existentes:
`vehiculos`, `vehiculo_permisos`, `archivos` (ver `data-model.md`); una migración nueva agrega el
bucket `documentos` (privado, 10 MB, PDF/JPG/PNG) con su RLS, auditoría en las 3 tablas, y un
ajuste a la política `archivos_delete` para aceptar `tiene_permiso('vehiculos','editar')`.
Supabase Storage (bucket `documentos`) para los archivos de póliza en sí.

**Testing**: Playwright, mismo patrón de sesiones pre-autenticadas por rol de features anteriores
(`tests/e2e/global-setup.ts`, helpers en `tests/e2e/helpers.ts`). Nuevo spec de feature más los
casos RLS negativos obligatorios (constitución §4, quickstart Escenario 7) consolidados en
`rls.spec.ts` — mismo criterio que Catálogos Base.

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios,
hereda el shell existente.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt (`app/` + `server/`) — esta
feature no agrega nada a `server/api/` (research.md R5), igual que Catálogos Base.

**Performance Goals**: sin metas de throughput específicas; objetivo cualitativo alineado a
`spec.md` SC-001/SC-005: alta completa (con póliza) en <3 min, localizar un vehículo en un
listado de hasta 100 en <10s con el buscador.

**Constraints**: WCAG 2.1 AA en el formulario (incluida la zona de subida de archivo) y el
listado (constitución §4); ningún dato del archivo de póliza se registra en logs de aplicación
(constitución §3); toda escritura queda auditada, incluidas baja/reactivación como acciones
distintas de "editar" (constitución §2, research.md R4); el bucket `documentos` MUST ser privado
y aislado por empresa (FR-020); tipos de archivo restringidos a PDF/JPG/PNG, máximo 10 MB
(Decisiones Confirmadas de `spec.md`); las pantallas nuevas deben seguir `docs/design-system.md`
y sus referencias de Stitch — 3 piezas de esta feature (formulario de alta/edición, pestaña de
historial de póliza, pestaña de permisos) no tienen referencia todavía y deben generarse antes de
implementarlas (research.md R8, regla de `CLAUDE.md`).

**Scale/Scope**: 6 historias de usuario, 0 tablas nuevas (solo 1 bucket de Storage + ajustes de
auditoría/RLS sobre 3 tablas existentes), 1 listado + 1 formulario de alta/edición + 2 pestañas
nuevas en el detalle del vehículo (historial de póliza, permisos asignados), sin `server/api/`
nuevo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración; nuevos componentes/composables siguen el mismo `nuxt.config.ts` ya estricto. |
| §1 Monolito modular, un solo repo/deploy | Módulo `vehiculos` dentro del mismo proyecto Nuxt (`components/vehiculos/`), sin microservicios ni proyectos nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell PWA existente; pantallas nuevas usan el layout `admin.vue` y breakpoints de Vuetify ya establecidos. |
| §2 RLS obligatorio en toda tabla | `vehiculos`/`vehiculo_permisos`/`archivos` ya tienen RLS desde `initial_schema.sql`; `storage.objects` del bucket `documentos` recibe políticas nuevas en la misma migración — ninguna tabla ni bucket queda sin RLS. |
| §2 `service_role` nunca al cliente | No aplica: esta feature no usa `service_role` en absoluto (research.md R5), incluida la limpieza de archivos al eliminar — todo vía RLS del usuario autenticado. |
| §2 Bitácora de auditoría | Gap identificado y cerrado: `vehiculos`/`vehiculo_permisos`/`archivos` no tenían trigger de auditoría; se agrega `private.audit_vehiculos()` (nueva, interpreta `baja`) + se reutiliza `private.audit_catalogo()` (ya existente desde Catálogos Base) para las otras dos (research.md R4). |
| §2 Integridad referencial de negocio en eliminaciones | Ya garantizada por las FK existentes de `cargas_combustible`/`mantenimientos`/`checklists`/`servicios_obligatorios` hacia `vehiculos` (sin `ON DELETE CASCADE`); esta feature traduce el error `23503` a mensaje de negocio y además limpia explícitamente lo que la BD no puede limpiar sola (`archivos`, sin FK real — FR-016a, research.md R5). |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe escritura a `admin`/`superusuario` o `tiene_permiso('vehiculos','editar')`; no hay endpoint nuevo que verificar porque no hay endpoints nuevos — el chequeo vive en RLS, incluida la política nueva de `storage.objects`. |
| §3 Archivos adjuntos validados, nunca servidos como HTML | Tipo (PDF/JPG/PNG) y tamaño (10 MB) validados antes de subir (FR-004); bucket privado, descarga vía URL firmada de corta duración (research.md R6), nunca servido directo como recurso público. |
| §3 Sin datos fiscales/credenciales en logs | Ningún campo de esta feature es fiscal ni credencial; no hay `console.log` de payloads completos en el código nuevo. |
| §4 Playwright, RLS con caso negativo obligatorio | quickstart.md Escenario 7: operario con solo `'ver'` no puede escribir en `vehiculos`/`vehiculo_permisos` ni subir a `documentos`; se traduce a test Playwright explícito en `rls.spec.ts`. |
| §4 WCAG 2.1 AA | Vuetify + labels/aria explícitos, incluida la zona de subida de archivo (mismo patrón accesible que `logo-dropzone` de Feature 001: `role="button"`, navegable por teclado). |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado y clarificado (`checklists/requirements.md` 16/16, `## Clarifications` con 2 preguntas resueltas). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/vehiculos.md` no introducen
ninguna excepción a lo anterior. Un ajuste identificado durante el diseño (no una violación): la
política `archivos_delete` heredada de Feature 001 exige `rol = 'admin'` a secas, más estricta que
el resto de las políticas de escritura de esta feature (que aceptan `tiene_permiso('vehiculos',
'editar')`); se corrige como parte de la misma migración para mantener consistencia de acceso
entre "editar el vehículo" y "limpiar su historial de archivos" — ver Nota en `data-model.md`,
sección `archivos`. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/003-vehiculos/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md               # Fase 1
├── quickstart.md               # Fase 1
├── contracts/                  # Fase 1
│   └── vehiculos.md
├── checklists/
│   └── requirements.md
└── tasks.md                    # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores (`app/` cliente + `server/` Nitro). Esta
feature no agrega nada a `server/api/` (research.md R5) — todo el trabajo nuevo vive en `app/` y
en `supabase/migrations/`.

```text
flotillas/
├── app/
│   ├── components/
│   │   └── vehiculos/
│   │       ├── FormularioVehiculo.vue          # campos + zona de adjuntar/reemplazar póliza
│   │       ├── DialogoDarDeBaja.vue             # motivo obligatorio, ≤150 caracteres
│   │       ├── HistorialPoliza.vue              # pestaña de detalle: versiones + descarga
│   │       └── PermisosVehiculo.vue             # pestaña de detalle: asignar/editar/quitar
│   ├── composables/
│   │   └── useVehiculos.ts                     # CRUD + alta en 2 pasos + baja/reactivar + eliminar-con-limpieza (research.md R7)
│   ├── pages/
│   │   └── admin/
│   │       └── vehiculos/
│   │           ├── index.vue                   # listado + búsqueda + toggle "mostrar dados de baja"
│   │           ├── nuevo.vue                    # alta (formulario completo en una sola pantalla, no diálogo — más campos que Catálogos Base)
│   │           └── [id].vue                     # detalle: datos + pestañas Historial de Póliza / Permisos
│   └── utils/
│       └── archivos.ts                          # validar tipo/tamaño antes de subir, helper de nombre de archivo único
├── supabase/
│   └── migrations/
│       └── <timestamp>_vehiculos_storage_auditoria.sql   # bucket documentos + RLS, audit_vehiculos(), triggers en vehiculo_permisos/archivos, ajuste archivos_delete
├── tests/
│   └── e2e/
│       └── vehiculos.spec.ts
├── docs/
│   └── design-references/
│       └── screens/                            # + referencias Stitch pendientes: formulario, historial de póliza, permisos del vehículo (research.md R8)
```

**Structure Decision**: se extiende el mismo proyecto Nuxt único, sin paquetes ni repos
adicionales (constitución §1). A diferencia de Catálogos Base, el formulario de alta vive en su
propia página (`nuevo.vue`) en vez de un diálogo — justificado porque tiene bastantes más campos
(11) más la zona de archivo, y un diálogo quedaría apretado; el detalle del vehículo también es
su propia página con pestañas (`[id].vue`) en vez de expandirse inline en el listado, porque
aloja 2 secciones sustanciales (historial de versiones, permisos asignados) que no caben
razonablemente en una fila de tabla expandida. `TablaCatalogo.vue` y
`DialogoConfirmarEliminarCatalogo.vue` de Catálogos Base sí se reutilizan tal cual para el
listado y la confirmación de eliminación (research.md R7) — no se duplican.

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
