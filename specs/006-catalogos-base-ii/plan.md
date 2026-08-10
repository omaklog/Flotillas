# Implementation Plan: Catálogos Base II (Proveedores + Productos)

**Branch**: `006-catalogos-base-ii` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-catalogos-base-ii/spec.md`

## Summary

Administra 2 catálogos por empresa — proveedores (con activo/inactivo) y productos (clasificados
por tipo) — que Combustible (007) y Mantenimiento (futura) necesitan como prerrequisito duro
(ambos son FK `not null` en `cargas_combustible`, y `mantenimientos`/`mantenimiento_detalles`
según el caso). Ambas tablas y su RLS granular ya existen desde la migración inicial del
proyecto; el único trabajo de esquema nuevo es `proveedores.activo`/`motivo_baja`
(`schema_08_proveedores_activo.sql`) más 2 triggers de auditoría reutilizando funciones genéricas
ya existentes — sin funciones PL/pgSQL nuevas. Enfoque técnico: reutiliza el patrón "modal en
listado" ya construido en Catálogos Base (002, aseguradoras/tipos_vehiculo) para ambos catálogos,
no el patrón de páginas separadas de Vehículos/Conductores — ninguno de los 2 necesita una vista
de detalle rica.

## Technical Context

**Language/Version**: TypeScript estricto (constitución §1) sobre Node.js LTS — mismo proyecto
Nuxt 4, sin cambios de versión.

**Primary Dependencies**: Nuxt 4, Vue 3, `vuetify-nuxt-module`, `@nuxtjs/supabase` — todas ya
instaladas. Sin dependencias nuevas.

**Storage**: PostgreSQL gestionado por Supabase. Una sola migración nueva: aplica
`docs/schema-reference/schema_08_proveedores_activo.sql` tal cual (agrega `activo`/`motivo_baja`
a `proveedores`) y agrega 2 triggers de auditoría reutilizando funciones ya existentes —
`private.audit_empresas_usuarios()` en `proveedores` (mismo criterio no invertido que
`conductores`/`empresas`/`usuarios`) y `private.audit_catalogo()` en `productos` (tabla sin
columna `activo`, mismo criterio que `tipos_vehiculo`/`aseguradoras`/`permisos`). Ninguna política
de RLS se modifica — las ya existentes (`proveedores_select`/`write`, `productos_select`/`write`)
cubren las columnas nuevas automáticamente vía `select *`/`update {...}`.

**Testing**: Playwright, mismo patrón de sesiones pre-autenticadas por rol de features anteriores.
Archivos nuevos: `tests/e2e/proveedores.spec.ts`, `tests/e2e/productos.spec.ts`; casos de RLS en
`tests/e2e/rls.spec.ts`.

**Target Platform**: Web responsivo (escritorio/tablet/celular), PWA instalable — sin cambios.

**Project Type**: Aplicación web full-stack de un solo proyecto Nuxt — esta feature no agrega
nada a `server/api/` (research.md R7).

**Performance Goals**: sin metas de throughput específicas; sin criterio de tiempo propio en
`spec.md` más allá de SC-003 ("localizar un registro... sin recorrer el listado completo" — ya
resuelto por el buscador + paginación de `TablaCatalogo.vue`, patrón ya construido).

**Constraints**: WCAG 2.1 AA en los formularios y tablas de captura (constitución §4); ambos
catálogos aislados por empresa vía RLS ya existente.

**Scale/Scope**: 2 historias de usuario, 1 migración con 3 cambios de esquema (columna, columna,
2 triggers), 2 composables dedicados, 2 páginas (patrón modal-en-listado, sin páginas nuevas de
alta/edición/detalle separadas), 3 componentes nuevos.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio (constitución) | Cómo lo cumple este plan |
|---|---|
| §1 TypeScript estricto | Sin cambios de configuración. |
| §1 Monolito modular, un solo repo/deploy | 2 módulos nuevos (`proveedores`, `productos`) dentro del mismo proyecto, sin apps ni deploys nuevos. |
| §1 PWA instalable, responsivo | Hereda el shell existente; páginas nuevas siguen el layout `admin` ya construido. |
| §2 RLS obligatorio en toda tabla | Ambas tablas ya tienen RLS habilitado y granular por permiso — sin tablas nuevas, sin cambios de política necesarios. |
| §2 `service_role` nunca al cliente | No aplica: sin `service_role` (research.md R7). |
| §2 Bitácora de auditoría | `productos` audita vía `private.audit_catalogo()` (trigger nuevo, función ya existente); `proveedores` vía `private.audit_empresas_usuarios()` (trigger nuevo, función ya existente) — ninguna función PL/pgSQL nueva. |
| §2 Eliminación valida dependientes | FR-006/FR-010: ya protegido por las FKs de `cargas_combustible`/`mantenimientos`/`mantenimiento_detalles` (sin `ON DELETE CASCADE`) — la app solo traduce el error 23503 a un mensaje claro, mismo patrón que Catálogos Base (002). |
| §3 Roles de tres niveles, sin escritura sin verificar rol | RLS ya restringe escritura a `admin` o `tiene_permiso('proveedores'\|'productos', 'editar')` — sin endpoints nuevos que verificar. |
| §3 Sin datos fiscales/credenciales en logs | No aplica — ningún campo de esta feature es credencial (RFC no se considera dato fiscal sensible en este contexto, es un identificador público de negocio). |
| §4 Playwright, RLS con caso positivo Y negativo obligatorio | Tests nuevos en `rls.spec.ts`: operario sin permiso bloqueado en ambos módulos (negativo) + operario con permiso explícito sí puede (positivo), mismo patrón ya establecido. |
| §4 WCAG 2.1 AA | Mismo patrón accesible ya usado en Catálogos Base (labels de Vuetify, `TablaCatalogo.vue` ya validado) + `DialogoDesactivar.vue` (ya validado en Conductores). |
| §4 Alertas automáticas de vencimiento | No aplica — ninguna columna de esta feature es una fecha de vencimiento. |
| §5 Proceso spec→plan→tasks | Este documento es resultado de `/speckit-plan` sobre `spec.md` ya validado (`checklists/requirements.md` 16/16, sin `## Clarifications` porque el usuario indicó explícitamente que no había preguntas abiertas). |

Sin violaciones — no aplica Complexity Tracking.

*(Re-chequeo post-diseño, Fase 1): `data-model.md` y los contratos no introducen ninguna
excepción a lo anterior. Se confirma el gate.*

## Project Structure

### Documentation (this feature)

```text
specs/006-catalogos-base-ii/
├── plan.md                    # Este archivo
├── research.md                # Fase 0
├── data-model.md              # Fase 1
├── quickstart.md              # Fase 1
├── contracts/                 # Fase 1
│   ├── proveedores.md
│   └── productos.md
├── checklists/
│   └── requirements.md
└── tasks.md                   # Fase 2 (/speckit-tasks, no generado por este comando)
```

### Source Code (repository root)

Mismo proyecto Nuxt 4 único de features anteriores. Esta feature no agrega nada a `server/api/`
(research.md R7) — reutiliza el patrón "modal en listado" de Catálogos Base (002, research.md R3)
para ambos catálogos, sin páginas de alta/edición/detalle separadas (a diferencia de
Vehículos/Conductores).

```text
flotillas/
├── app/
│   ├── components/
│   │   ├── proveedores/
│   │   │   ├── FormularioProveedor.vue    # modal de alta/edición
│   │   │   └── DialogoDesactivar.vue      # copia propia, texto de proveedor (research.md R3)
│   │   └── productos/
│   │       └── FormularioProducto.vue     # modal de alta/edición, tipo bloqueado condicionalmente
│   ├── composables/
│   │   ├── useProveedores.ts              # dedicado — no extiende useCatalogo.ts (research.md R4)
│   │   └── useProductos.ts                # dedicado — incluye tieneRegistrosAsociados()
│   └── pages/admin/
│       ├── proveedores/index.vue
│       └── productos/index.vue
├── supabase/
│   └── migrations/
│       └── <timestamp>_proveedores_productos_activo_auditoria.sql
├── tests/
│   └── e2e/
│       ├── proveedores.spec.ts             # nuevo
│       ├── productos.spec.ts               # nuevo
│       └── rls.spec.ts                     # + casos de ambos módulos
```

**Structure Decision**: sin páginas de alta/edición/detalle separadas — ambos catálogos reutilizan
`TablaCatalogo.vue` + `DialogoConfirmarEliminarCatalogo.vue` (ya genéricos, sin cambios) dentro de
una sola página por catálogo con formularios en modal, igual que `aseguradoras`/`tipos-vehiculo`
(research.md R3). Proveedores extiende ese patrón con el toggle "Mostrar inactivos" + el diálogo
de motivo ya validado en Conductores (copia propia, no componente compartido — mismo criterio de
"cada módulo su propio texto" ya establecido). Ninguno de los 2 composables extiende
`useCatalogo.ts`: Productos necesita `tieneRegistrosAsociados()` (verificación de dependientes
antes de habilitar el campo tipo) y Proveedores necesita `desactivar`/`reactivar` — ninguno de los
2 casos está cubierto por el CRUD genérico, y solo 2 casos de uso no justifican extenderlo
todavía (mismo criterio ya aplicado repetidas veces en este proyecto).

## Complexity Tracking

*Sin violaciones al Constitution Check — tabla no aplica.*
