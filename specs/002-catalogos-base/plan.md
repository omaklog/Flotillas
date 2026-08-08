# Implementation Plan: Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos)

**Branch**: `002-catalogos-base` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-catalogos-base/spec.md`

## Summary

Pantallas de administración (listado + búsqueda + alta + edición + eliminación protegida) para
los 3 catálogos de configuración que Vehículos (003) necesita como prerequisito: tipos de
vehículo, aseguradoras y tipos de permiso. El esquema de base de datos de las 3 tablas, su RLS y
sus módulos de permisos granulares **ya existen** desde la Feature 001 (`initial_schema.sql`,
`modulos_y_permisos.sql`, `permisos_ver_y_defaults.sql`) — este plan solo agrega lo que falta
(`CHECK` de formato de clave, siembra automática de tipos de vehículo, auditoría) y construye la
capa de aplicación encima, reutilizando el molde de listado+formulario ya sentado por
`admin/usuarios/index.vue` en Feature 001. Enfoque técnico: sin `server/api/` nuevos —
escritura directa vía `useSupabaseClient()` protegida por RLS, ya que ninguna operación de este
CRUD requiere `service_role` (research.md R5).

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4 ya bootstrapeado en Feature 001, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas y configuradas. Sin dependencias nuevas: la autogeneración de clave (research.md R7) es
una función utilitaria propia, sin librería de slugify externa.

**Storage**: PostgreSQL gestionado por Supabase. Tablas de esta feature ya existentes:
`tipos_vehiculo`, `aseguradoras`, `permisos` (ver `data-model.md`); una migración nueva agrega
`CHECK` de formato de clave, `updated_at`/`set_updated_at` en las dos que carecen de ella, el
trigger de siembra de tipos de vehículo por defecto, y triggers de auditoría en las 3 tablas.

**Testing**: Playwright, mismo patrón de sesiones pre-autenticadas por rol de Feature 001
(`tests/e2e/global-setup.ts`). Nuevo spec por catálogo (o uno combinado, ver Project Structure) más
el caso RLS negativo obligatorio (constitución §4, quickstart Escenario 4).

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios,
hereda el shell de Feature 001.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt (`app/` + `server/`) — mismo
que Feature 001; esta feature en particular no agrega nada a `server/` (research.md R5).

**Performance Goals**: sin metas de throughput específicas; objetivo cualitativo alineado a
`spec.md` SC-002/SC-005: alta completa en <1 min, localizar un registro en un catálogo de hasta 50
elementos en <10s con el buscador.

**Constraints**: WCAG 2.1 AA en los 3 formularios/listados (constitución §4); ningún dato fiscal
(RFC de aseguradora) se registra en logs de aplicación (constitución §3); toda escritura queda
auditada (constitución §2, research.md R4); las pantallas nuevas deben seguir
`docs/design-system.md` y, si no existe referencia de Stitch para ellas, generarla antes de
implementar (research.md R8, regla de `CLAUDE.md`).

**Scale/Scope**: 3 historias de usuario, 0 tablas nuevas (solo migración de ajustes sobre 3 tablas
existentes), 3 pares de pantalla (listado + formulario), sin `server/api/` nuevo, sin archivos
adjuntos ni relaciones complejas — el catálogo más simple del sistema, por diseño (spec, Resumen).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración; nuevos componentes/composables siguen el mismo `nuxt.config.ts` ya estricto. |
| §1 Monolito modular, un solo repo/deploy | Un módulo por catálogo dentro del mismo proyecto Nuxt (`components/catalogos/tipos-vehiculo`, `.../aseguradoras`, `.../permisos`), sin microservicios ni proyectos nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell PWA de Feature 001; pantallas nuevas usan los mismos layouts (`admin.vue`) y breakpoints de Vuetify. |
| §2 RLS obligatorio en toda tabla | Las 3 tablas ya tienen RLS desde `initial_schema.sql`; esta feature no agrega tablas sin RLS. |
| §2 `service_role` nunca al cliente | No aplica: esta feature no usa `service_role` en absoluto (research.md R5) — ni siquiera del lado servidor, porque no hay `server/api/` nuevo. |
| §2 Bitácora de auditoría | Gap identificado y cerrado: `tipos_vehiculo`/`aseguradoras`/`permisos` no tenían trigger de auditoría; se agrega `private.audit_catalogo()` + trigger por tabla (research.md R4, data-model.md). |
| §2 Integridad referencial de negocio en eliminaciones | Ya garantizada por las FK existentes (`vehiculos.tipo_vehiculo_id`, `vehiculos.aseguradora_id`, `vehiculo_permisos.permiso_id`, sin `ON DELETE CASCADE`); esta feature solo traduce el error `23503` a mensaje de negocio (research.md R6, contracts/catalogos.md). |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe escritura a `admin`/`superusuario` o permiso granular por módulo (`modulos_y_permisos.sql`); no hay endpoint de escritura sin ese chequeo porque no hay endpoints nuevos — el chequeo vive en RLS. |
| §3 Sin datos fiscales en logs | RFC de aseguradora nunca se loguea en cliente ni servidor (no hay servidor involucrado en esta feature). |
| §4 Playwright, RLS con caso negativo obligatorio | quickstart.md Escenario 4: operario con solo `ver` no puede escribir en ninguna de las 3 tablas; se traduce a test Playwright explícito. |
| §4 WCAG 2.1 AA | Vuetify + labels/aria explícitos en los 3 formularios, mismo patrón que Feature 001. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md`, 16/16). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y `contracts/catalogos.md` no introducen
ninguna excepción a lo anterior — de hecho cierran un gap real (auditoría faltante en 3 tablas
existentes) que no estaba cubierto antes de este plan. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/002-catalogos-base/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md               # Fase 1
├── quickstart.md               # Fase 1
├── contracts/                  # Fase 1
│   └── catalogos.md
├── checklists/
│   └── requirements.md
└── tasks.md                    # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de Feature 001 (`app/` cliente + `server/` Nitro). Esta feature no
agrega nada a `server/api/` (research.md R5) — todo el trabajo nuevo vive en `app/` y en
`supabase/migrations/`.

```text
flotillas/
├── app/
│   ├── components/
│   │   └── catalogos/
│   │       ├── TablaCatalogo.vue          # tabla + búsqueda genérica, reusada por las 3 pantallas
│   │       ├── tipos-vehiculo/
│   │       │   └── FormularioTipoVehiculo.vue
│   │       ├── aseguradoras/
│   │       │   └── FormularioAseguradora.vue
│   │       └── permisos/
│   │           └── FormularioTipoPermiso.vue
│   ├── composables/
│   │   └── useCatalogo.ts                 # CRUD genérico (list/search/create/update/delete + mapeo de error 23503/23505)
│   ├── pages/
│   │   └── admin/
│   │       ├── tipos-vehiculo/
│   │       │   └── index.vue
│   │       ├── aseguradoras/
│   │       │   └── index.vue
│   │       └── tipos-permiso/            # no admin/permisos/ — choca con permisos/[id].vue (Feature 001)
│   │           └── index.vue
│   └── utils/
│       └── clave.ts                       # normalización nombre → clave (research.md R7)
├── supabase/
│   └── migrations/
│       └── <timestamp>_catalogos_base_ajustes.sql   # CHECK clave, updated_at, siembra, auditoría (data-model.md)
├── tests/
│   └── e2e/
│       ├── tipos-vehiculo.spec.ts
│       ├── aseguradoras.spec.ts
│       └── permisos-catalogo.spec.ts
├── docs/
│   └── design-references/
│       └── screens/                       # + referencias Stitch de estas 3 pantallas (research.md R8, pendiente antes de implementar)
```

**Structure Decision**: se extiende el mismo proyecto Nuxt único de Feature 001, sin paquetes ni
repos adicionales (constitución §1). La novedad estructural respecto a Feature 001 es un
composable de CRUD genérico (`useCatalogo.ts`) compartido por las 3 pantallas — justificado porque
las 3 entidades son, por diseño del propio spec, el mismo molde de listado+alta+edición+
eliminación protegida; extraer la lógica común evita triplicar el manejo de errores `23503`/`23505`
en 3 componentes casi idénticos (no es una abstracción especulativa: las 3 historias de usuario ya
piden literalmente el mismo patrón).

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
