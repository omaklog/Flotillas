# Implementation Plan: Conductores

**Branch**: `004-conductores` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-conductores/spec.md`

## Summary

CRUD de conductores con alta en dos pasos (el conductor primero, la licencia adjunta después, por
la dependencia circular archivo↔conductor), listado con búsqueda e indicador visual de vigencia
de licencia, detalle de solo lectura con edición explícita y reemplazo de licencia con historial
completo de versiones (tabla con "Ver"/"Descargar"/"Subir Nueva Licencia"), desactivación/
reactivación como acción separada de la edición, y eliminación física bloqueada por dependientes.
Reutiliza directamente el patrón ya construido y validado en Vehículos (003): mismo bucket
`documentos`, mismo composable-por-entidad (no genérico), mismo molde de detalle de solo lectura +
historial en tabla. La tabla `conductores`, su RLS granular (`tiene_permiso('conductores', ...)`)
y el módulo de permisos **ya existen** desde Feature 001 — este plan agrega lo puntual que falta
(`motivo_baja`, unicidad de licencia, trigger de auditoría reutilizando una función ya genérica,
generalización de las políticas de Storage que Vehículos dejó hardcodeadas a su propio módulo) y
construye la capa de aplicación. Como decisión tomada en `/speckit-clarify` (sesión 2026-08-09),
también crea la tabla `asignaciones_conductor_vehiculo` (sin ninguna UI — eso es Feature 005) para
que la eliminación bloqueada por dependientes sea probable de punta a punta desde ahora. Enfoque
técnico: sin `server/api/` nuevos, igual que Vehículos y Catálogos Base — todas las operaciones se
resuelven client-side vía RLS.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas: la subida/descarga de archivos reutiliza el mismo mecanismo
de `@supabase/supabase-js`'s `storage` API que Vehículos.

**Storage**: PostgreSQL gestionado por Supabase. Tabla `conductores` ya existente (ver
`data-model.md`); una migración nueva agrega `motivo_baja` +
`UNIQUE(empresa_id, numero_licencia)`, auditoría (reutilizando una función ya existente, sin
código nuevo), generaliza las 4 políticas de `storage.objects` del bucket `documentos` (ya creado
por Vehículos) para que también acepten el permiso `conductores`, ajusta `archivos_delete` para
el mismo permiso, y crea `asignaciones_conductor_vehiculo` tal cual su diseño pre-existente.
Supabase Storage (bucket `documentos`, ya creado) para los archivos de licencia en sí.

**Testing**: Playwright, mismo patrón de sesiones pre-autenticadas por rol de features anteriores
(`tests/e2e/global-setup.ts`, helpers en `tests/e2e/helpers.ts`). Nuevo spec de feature
(`conductores.spec.ts`) más los casos RLS negativos obligatorios (constitución §4, quickstart
Escenarios 7) consolidados en `rls.spec.ts` — mismo criterio que Vehículos y Catálogos Base.

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios,
hereda el shell existente.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt (`app/` + `server/`) — esta
feature no agrega nada a `server/api/` (research.md R7), igual que Vehículos y Catálogos Base.

**Performance Goals**: sin metas de throughput específicas; objetivo cualitativo alineado a
`spec.md` SC-001/SC-005: alta completa (con licencia) en <3 min, localizar un conductor en un
listado de hasta 100 en <10s con el buscador.

**Constraints**: WCAG 2.1 AA en el formulario (incluida la zona de subida de archivo) y el
listado (constitución §4); ningún dato de la licencia se registra en logs de aplicación
(constitución §3); toda escritura queda auditada, incluidas desactivación/reactivación como
acciones distintas de "editar" (constitución §2, research.md R3); el bucket `documentos` (ya
privado) sigue aislado por empresa para archivos de licencia (FR-017); tipos de archivo
restringidos a PDF/JPG/PNG, máximo 10 MB (Decisiones Confirmadas de `spec.md`, mismos límites que
Vehículos); las pantallas nuevas deben seguir `docs/design-system.md` y los patrones de layout ya
construidos en Vehículos — no existe todavía una referencia de Stitch propia para Conductores
(research.md R10, Assumptions de `spec.md`).

**Scale/Scope**: 6 historias de usuario, 1 tabla nueva (`asignaciones_conductor_vehiculo`, sin UI
propia en esta feature) + ajustes puntuales de esquema sobre `conductores`/`archivos`/
`storage.objects`, 1 listado + 1 formulario de alta/edición + 1 detalle de solo lectura con
historial de licencia, sin `server/api/` nuevo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración; nuevos componentes/composables siguen el mismo `nuxt.config.ts` ya estricto. |
| §1 Monolito modular, un solo repo/deploy | Módulo `conductores` dentro del mismo proyecto Nuxt (`components/conductores/`), sin microservicios ni proyectos nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell PWA existente; pantallas nuevas usan el layout `admin.vue` y breakpoints de Vuetify ya establecidos. |
| §2 RLS obligatorio en toda tabla | `conductores` ya tiene RLS desde `initial_schema.sql`/`permisos_ver_y_defaults.sql`; `asignaciones_conductor_vehiculo` (nueva) trae su propia RLS ya definida en su migración pre-diseñada; `storage.objects` del bucket `documentos` recibe políticas generalizadas — ninguna tabla ni bucket queda sin RLS. |
| §2 `service_role` nunca al cliente | No aplica: esta feature no usa `service_role` en absoluto (research.md R7), incluida la limpieza de archivos al eliminar — todo vía RLS del usuario autenticado. |
| §2 Bitácora de auditoría | `conductores` no tenía trigger de auditoría; se agrega reutilizando `private.audit_empresas_usuarios()` ya existente, sin función nueva (research.md R3) — más simple que el caso de Vehículos, que sí necesitó una función propia por la semántica invertida de `baja`. |
| §2 Integridad referencial de negocio en eliminaciones | Garantizada por la FK de `asignaciones_conductor_vehiculo` hacia `conductores` (sin `ON DELETE CASCADE`, creada en esta misma feature por decisión de `/speckit-clarify` — research.md R6); esta feature traduce el error `23503` a mensaje de negocio y además limpia explícitamente lo que la BD no puede limpiar sola (`archivos`, sin FK real — FR-016a, research.md R7). |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe escritura a `admin`/`superusuario` o `tiene_permiso('conductores','editar')`; no hay endpoint nuevo que verificar porque no hay endpoints nuevos — el chequeo vive en RLS, incluidas las políticas generalizadas de `storage.objects`. |
| §3 Archivos adjuntos validados, nunca servidos como HTML | Tipo (PDF/JPG/PNG) y tamaño (10 MB) validados antes de subir (FR-004, reutilizando `validarArchivo()` de Vehículos — research.md R8); bucket privado, descarga vía URL firmada de corta duración, nunca servido directo como recurso público. |
| §3 Sin datos fiscales/credenciales en logs | Ningún campo de esta feature es fiscal ni credencial; no hay `console.log` de payloads completos en el código nuevo. |
| §4 Playwright, RLS con caso negativo obligatorio | quickstart.md Escenario 7: operario con solo `'ver'` no puede escribir en `conductores` ni subir a `documentos/licencia/...`, **ni tampoco** a `documentos/poliza/...` (valida que la generalización de research.md R4 no sobre-concede acceso cruzado); se traduce a test Playwright explícito en `rls.spec.ts`. |
| §4 WCAG 2.1 AA | Vuetify + labels/aria explícitos, incluida la zona de subida de archivo (mismo patrón accesible ya usado en Vehículos). |
| §4 Alertas automáticas de vencimiento | **Resuelto vía excepción documentada en la constitución** (`/speckit-analyze` de esta feature, 2026-08-09, hallazgo D1): §4 ahora declara explícitamente que ninguna feature individual con fecha de vencimiento implementa su propia alerta hasta que exista una feature dedicada de Alertas/Dashboard, y exige que cada `spec.md` lo declare en su "Fuera de Alcance" — ya hecho en `spec.md` de esta feature. Deja de ser un MUST silenciosamente incumplido; es una excepción rastreable a nivel de proyecto. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado y clarificado (`checklists/requirements.md` 16/16, `## Clarifications` con 1 pregunta resuelta). |

Sin violaciones que requieran Complexity Tracking — la desviación de §4 (alertas) quedó resuelta
como excepción documentada a nivel de constitución tras `/speckit-analyze` (ver fila arriba), no
queda como una violación abierta de esta feature.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/conductores.md` no introducen
ninguna excepción a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/004-conductores/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md              # Fase 1
├── quickstart.md              # Fase 1
├── contracts/                 # Fase 1
│   └── conductores.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores (`app/` cliente + `server/` Nitro). Esta
feature no agrega nada a `server/api/` (research.md R7) — todo el trabajo nuevo vive en `app/` y
en `supabase/migrations/`.

```text
flotillas/
├── app/
│   ├── components/
│   │   └── conductores/
│   │       ├── FormularioConductor.vue          # campos + zona de adjuntar/reemplazar licencia
│   │       ├── DialogoDesactivar.vue             # motivo obligatorio, ≤150 caracteres
│   │       └── HistorialLicencia.vue             # sección de detalle: tabla de versiones, Ver/Descargar/Subir Nueva Licencia
│   ├── composables/
│   │   └── useConductores.ts                    # CRUD + alta en 2 pasos + desactivar/reactivar + eliminar-con-limpieza (research.md R9)
│   ├── pages/
│   │   └── admin/
│   │       └── conductores/
│   │           ├── index.vue                     # listado + búsqueda + toggle "mostrar inactivos"
│   │           ├── nuevo.vue                      # alta (formulario completo en una sola pantalla)
│   │           └── [id]/
│   │               ├── index.vue                  # detalle de solo lectura + historial de licencia (carpeta desde el inicio, evita el bug de anidación de Nuxt que Vehículos tuvo que corregir después)
│   │               └── editar.vue                 # formulario editable
│   └── utils/
│       └── archivos.ts                            # SIN cambios — validarArchivo()/nombreArchivoUnico() ya genéricos (research.md R8)
├── supabase/
│   └── migrations/
│       └── <timestamp>_conductores_ajustes.sql    # motivo_baja + UNIQUE, auditoría, storage.objects generalizado, archivos_delete, asignaciones_conductor_vehiculo
├── tests/
│   └── e2e/
│       └── conductores.spec.ts
├── app/layouts/admin.vue                          # + v-list-item "Conductores" en el nav drawer
```

**Structure Decision**: se extiende el mismo proyecto Nuxt único, sin paquetes ni repos
adicionales (constitución §1). Mismo criterio estructural que Vehículos: el formulario de alta
vive en su propia página (`nuevo.vue`, no un diálogo — suficientes campos + zona de archivo para
justificarlo) y el detalle es su propia carpeta de rutas (`[id]/index.vue` + `[id]/editar.vue`)
**desde el inicio** — a diferencia de Vehículos, que empezó con `[id].vue` como archivo suelto y
tuvo que renombrarlo a `[id]/index.vue` tras chocar con el bug de anidación de rutas de Nuxt
(`NUXT_E4016`) al coexistir con `[id]/editar.vue`; esta feature aplica la lección desde el primer
commit. No se reutiliza `useVehiculos.ts` ni `useCatalogo.ts` (research.md R9); no se reutiliza
`FormularioVehiculo.vue`/`HistorialPoliza.vue` como componentes (son específicos de la tabla
`vehiculos`), pero sí se replica su estructura interna y su marcado como plantilla de referencia.

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*

## Actualización posterior (2026-08-10): Foto del Conductor

Planeada originalmente como Feature 006 independiente, doblada aquí (ver spec.md/research.md/
data-model.md para el detalle). Sin cambios de Project Structure más allá de: 1 migración nueva
(`20260810154825_conductores_foto.sql`), y modificaciones a `FormularioConductor.vue`,
`useConductores.ts`, `nuevo.vue`, `[id]/editar.vue`, `[id]/index.vue` — mismos archivos ya
listados arriba, sin páginas ni componentes nuevos.
