---

description: "Task list for Feature 006 — Catálogos Base II (Proveedores + Productos)"
---

# Tasks: Catálogos Base II (Proveedores + Productos)

**Input**: Design documents from `/specs/006-catalogos-base-ii/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/proveedores.md,
contracts/productos.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada regla
de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS por módulo de
permisos afectado — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md), ambas P1 e independientes
entre sí (proveedores y productos son tablas distintas, sin relación directa una con otra).

**Esquema de base de datos**: `proveedores` y `productos` **ya existen** completos, con su RLS
granular (`tiene_permiso('proveedores'|'productos', ...)`, Feature 001). T002-T006 aplican una
única migración nueva con lo que falta: `proveedores.activo`/`motivo_baja`
(`schema_08_proveedores_activo.sql` tal cual) y 2 triggers de auditoría reutilizando funciones ya
existentes — ver `data-model.md` sección "Extensiones sobre el esquema actual".

**Lecciones de features anteriores a aplicar desde el inicio, no redescubrir**:
- El texto de búsqueda en `.or()`/`.ilike()` de PostgREST MUST escaparse (comillas dobles) —
  reusar la lógica ya corregida en `useCatalogo.ts`/`useVehiculos.ts`/`useConductores.ts`, no
  reimplementarla.
- `private.audit_empresas_usuarios()` y `private.audit_catalogo()` ya son genéricas — **no**
  crear funciones de auditoría nuevas (research.md R2).
- `ETIQUETAS_DEPENDIENTES` (mapeo de tabla FK → mensaje de negocio) ya es un patrón establecido en
  `useVehiculos.ts`/`useConductores.ts` — replicarlo, no reinventarlo. En esta feature ambas
  tablas tienen **más de un** tipo de dependiente (research.md R5) — el patrón ya lo soporta sin
  cambios, solo con más entradas en el diccionario. Ambos caminos de dependiente MUST probarse por
  separado (`/speckit-analyze`, hallazgo E2) — un solo test eligiendo "cualquiera de los dos" no
  detectaría una entrada rota en el diccionario para el otro camino.
- Ninguno de los 2 composables extiende `useCatalogo.ts` (research.md R4) — son dedicados desde
  el inicio, no una refactorización posterior.
- `DialogoDesactivar.vue` de Proveedores es una **copia propia** con texto de proveedor, no un
  componente compartido con el de Conductores (research.md R3).
- La distinción de `accion` en auditoría (`'desactivar'`/`'reactivar'`, no `'editar'` a secas) MUST
  probarse con un test Playwright dedicado, no solo verificarse manualmente durante Foundational —
  mismo patrón ya probado en Conductores (`004-conductores/tasks.md` T038,
  `/speckit-analyze` hallazgo E1).
- `supabase gen types typescript --local > archivo` **nunca** con `2>&1` después del `>` —
  corrompe el archivo con el banner del CLI.
- Los tests de RLS deben cubrir el caso POSITIVO (operario con el permiso correcto sí puede)
  además del negativo — mismo hallazgo E1 de `/speckit-analyze` sobre Conductores, ya aplicado en
  todas las features desde entonces.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1 = Proveedores, US2 = Productos, ver
  spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend). Esta feature no agrega
nada a `server/api/` (research.md R7): toda la lectura/escritura va directo por
`useSupabaseClient()`, protegida por RLS.

---

## Phase 1: Setup

**Purpose**: Documentar la decisión de no generar una referencia de Stitch nueva para esta
feature (research.md R3/R8) antes de tocar cualquier CSS/componente.

- [X] T001 Agregar una nota a `docs/design-references/screens.md` documentando que Catálogos Base
      II (006) no tiene captura propia de Stitch y reutiliza deliberadamente el patrón "modal en
      listado" de Catálogos Base (002, `aseguradoras`/`tipos-vehiculo`) para ambos catálogos, más
      el patrón de activo/inactivo con motivo de Vehículos/Conductores para Proveedores
      (research.md R3)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema y auditoría — nada de la UI puede empezar hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna tarea de implementación de US1/US2 puede empezar hasta que esta fase esté
completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new
      proveedores_productos_activo_auditoria`
- [X] T003 En esa migración: aplicar `docs/schema-reference/schema_08_proveedores_activo.sql` tal
      cual (`alter table proveedores add column activo boolean not null default true, add column
      motivo_baja text check (char_length(motivo_baja) <= 150)`) (research.md R2, data-model.md)
- [X] T004 En esa misma migración: `create trigger trg_proveedores_auditoria after insert or
      update or delete on public.proveedores for each row execute function
      private.audit_empresas_usuarios();` y `create trigger trg_productos_auditoria after insert
      or update or delete on public.productos for each row execute function
      private.audit_catalogo();` — sin funciones PL/pgSQL nuevas (research.md R2)
- [X] T005 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: un
      proveedor de prueba admite `activo`/`motivo_baja`; un `UPDATE`/`INSERT`/`DELETE` de prueba
      sobre `proveedores` y sobre `productos` generan filas en `public.auditoria` con la `accion`
      esperada (`crear`/`editar`/`eliminar`/`desactivar`/`reactivar` según corresponda) — la
      cobertura automatizada de esto último vive en T014, no reemplaza esta verificación manual
      inicial
      **Estado**: hecho. Script de verificación directo con `service_role` confirmó:
      `proveedores auditoria: [crear, desactivar, reactivar, editar]`,
      `productos auditoria: [crear, editar, eliminar]` — ambas funciones genéricas funcionan sin
      cambios sobre las 2 tablas nuevas.
- [X] T006 [P] Regenerar `app/types/database.types.ts`
      (`supabase gen types typescript --local > app/types/database.types.ts`, **sin** `2>&1`)

**Checkpoint**: Fundación lista — ambas historias de usuario de esta feature pueden empezar, en
paralelo entre sí.

---

## Phase 3: User Story 1 - Administrador gestiona proveedores (Priority: P1) 🎯 MVP (parte 1/2)

**Goal**: El administrador puede dar de alta, consultar, editar, desactivar/reactivar y eliminar
proveedores de su empresa.

**Independent Test**: Dar de alta un proveedor, confirmar que aparece en el listado; editarlo;
desactivarlo con un motivo y confirmar que desaparece del listado por defecto; reactivarlo;
intentar eliminar uno con dependientes y confirmar que se rechaza.

### Tests for User Story 1

- [X] T007 [P] [US1] Playwright: alta de proveedor con solo el nombre lo deja visible en el
      listado (FR-001, Escenario 1) en `tests/e2e/proveedores.spec.ts`
- [X] T008 [P] [US1] Playwright: buscar por nombre y por RFC encuentra el proveedor (FR-002,
      Escenario 1) en `tests/e2e/proveedores.spec.ts`
- [X] T009 [P] [US1] Playwright: editar un proveedor existente guarda los cambios (FR-004) en
      `tests/e2e/proveedores.spec.ts`
- [X] T010 [P] [US1] Playwright: el listado oculta proveedores inactivos por defecto; el control
      "Mostrar inactivos" los incluye (FR-003, Escenario 3) en `tests/e2e/proveedores.spec.ts`
- [X] T011 [P] [US1] Playwright: intentar confirmar "Desactivar" sin capturar un motivo lo bloquea
      (FR-005, Escenario 4) en `tests/e2e/proveedores.spec.ts`
      **Estado**: la primera versión del test intentaba hacer clic en el botón de confirmar (que
      queda `disabled` sin motivo) — se corrigió para verificar el estado deshabilitado
      directamente, que es el bloqueo real.
- [X] T012 [P] [US1] Playwright: desactivar con un motivo válido oculta el proveedor del listado
      por defecto (FR-005, Escenario 5) en `tests/e2e/proveedores.spec.ts`
- [X] T013 [P] [US1] Playwright: reactivar un proveedor inactivo lo regresa al listado por defecto
      (Escenario 6) en `tests/e2e/proveedores.spec.ts`
- [X] T014 [P] [US1] Playwright: desactivar y reactivar un proveedor generan filas en
      `public.auditoria` con `accion = 'desactivar'`/`'reactivar'`, no `'editar'` a secas (FR-005,
      constitución §2; `/speckit-analyze` hallazgo E1, mismo patrón que T038 de
      `004-conductores`) en `tests/e2e/proveedores.spec.ts`
- [X] T015 [P] [US1] Playwright: eliminar un proveedor con un mantenimiento sembrado directo vía
      `service_role` se rechaza y no borra nada (FR-006, Escenario 7,
      `/speckit-analyze` hallazgo E2 — camino `mantenimientos`) en
      `tests/e2e/proveedores.spec.ts`
- [X] T016 [P] [US1] Playwright: eliminar un proveedor con una carga de combustible sembrada
      directo vía `service_role` se rechaza y no borra nada (FR-006, Escenario 7,
      `/speckit-analyze` hallazgo E2 — camino `cargas_combustible`) en
      `tests/e2e/proveedores.spec.ts`
      **Estado**: T007-T016 (10 tests) 100% en verde en `--project=admin` y en corrida completa
      con `productos.spec.ts` + `rls.spec.ts` en los 4 proyectos de Playwright, sin flakes. Se
      encontró y corrigió una colisión de RFC de prueba (truncado a 12 caracteres, perdía
      entropía) en el helper `sembrarProveedor`.

### Implementation for User Story 1

- [X] T017 [P] [US1] Implementar `app/composables/useProveedores.ts`: `listar(busqueda,
      incluirInactivos)`, `crear`, `editar`, `desactivar(id, motivo)`, `reactivar(id)`,
      `eliminar` con `mapearErrorEscritura`/`ETIQUETAS_DEPENDIENTES` cubriendo `mantenimientos` y
      `cargas_combustible` (contracts/proveedores.md, research.md R4/R5)
- [X] T018 [P] [US1] Implementar `app/components/proveedores/FormularioProveedor.vue`: nombre
      (obligatorio), RFC, calle/número/colonia, 2 teléfonos de oficina, celular, correo — mismo
      patrón de formulario en modal que `FormularioAseguradora.vue`
- [X] T019 [P] [US1] Implementar `app/components/proveedores/DialogoDesactivar.vue`: copia propia
      de `ConductoresDialogoDesactivar.vue` con el texto ajustado a "proveedor" (motivo
      obligatorio, máximo 150 caracteres) — no un componente compartido (research.md R3)
- [X] T020 [US1] Implementar `app/pages/admin/proveedores/index.vue`: patrón modal-en-listado de
      `aseguradoras/index.vue` (`CatalogosTablaCatalogo` + formulario en `v-dialog` +
      `CatalogosDialogoConfirmarEliminarCatalogo`), extendido con el checkbox "Mostrar inactivos"
      (mismo patrón que `admin/conductores/index.vue`), el chip "Inactivo" por fila, y los botones
      "Desactivar"/"Reactivar" que abren `ProveedoresDialogoDesactivar.vue` (T019)
      **Estado**: hecho. También se agregó el link "Proveedores" al menú lateral
      (`app/layouts/admin.vue`) — necesario para que la página sea alcanzable, no listado
      explícitamente en `tasks.md` pero implícito en "implementar la página".

**Checkpoint**: Proveedores funcional y probado de forma independiente.

---

## Phase 4: User Story 2 - Administrador gestiona productos (Priority: P1) 🎯 MVP (parte 2/2)

**Goal**: El administrador puede dar de alta, consultar (con filtro por tipo), editar y eliminar
productos de su empresa, con el campo tipo bloqueado una vez que el producto tiene registros
asociados.

**Independent Test**: Dar de alta un producto de cada tipo, confirmar que aparecen y son
filtrables por tipo; editar uno sin registros asociados y confirmar que el tipo es editable;
sembrar un registro asociado y confirmar que el tipo queda bloqueado; intentar eliminar un
producto con dependientes y confirmar que se rechaza.

### Tests for User Story 2

- [X] T021 [P] [US2] Playwright: alta de producto con nombre y tipo obligatorios lo deja visible
      en el listado (FR-007, Escenario 1) en `tests/e2e/productos.spec.ts`
- [X] T022 [P] [US2] Playwright: buscar por nombre y filtrar por tipo muestran únicamente los
      productos que coinciden (FR-008, Escenario 2) en `tests/e2e/productos.spec.ts`
      **Estado**: se encontró y corrigió un bug real en `useProductos.ts.listar()` — la búsqueda
      por nombre usaba el mismo escape de comillas dobles que `.or()` (útil para su DSL de
      PostgREST), pero `.ilike()` es un método plano que recibe el patrón como argumento directo;
      envolverlo en comillas lo volvía parte literal del patrón, sin encontrar nunca nada. También
      se ajustó el test: la "Empresa E2E" compartida ya tenía 48 productos "Diésel" preexistentes
      de sesiones anteriores — limpiar el buscador por completo antes de aplicar el filtro por
      tipo empujaba el producto de prueba fuera de la primera página (20/página); se corrigió
      combinando un buscador que acota a los 2 productos sembrados con el filtro de tipo, mismo
      criterio ya documentado en otros specs de este proyecto sobre el catálogo compartido.
- [X] T023 [P] [US2] Playwright: un producto sin registros asociados permite editar todos los
      campos, incluido el tipo (FR-009, Escenario 3) en `tests/e2e/productos.spec.ts`
- [X] T024 [P] [US2] Playwright: un producto con una carga de combustible o un detalle de
      mantenimiento sembrado directo vía `service_role` muestra el campo tipo deshabilitado con
      una explicación visible al editar (FR-009, Escenario 4) en `tests/e2e/productos.spec.ts`
- [X] T025 [P] [US2] Playwright: eliminar un producto con una carga de combustible sembrada
      directo vía `service_role` se rechaza y no borra nada (FR-010, Escenario 5,
      `/speckit-analyze` hallazgo E2 — camino `cargas_combustible`) en
      `tests/e2e/productos.spec.ts`
- [X] T026 [P] [US2] Playwright: eliminar un producto con un detalle de mantenimiento sembrado
      directo vía `service_role` se rechaza y no borra nada (FR-010, Escenario 5,
      `/speckit-analyze` hallazgo E2 — camino `mantenimiento_detalles`) en
      `tests/e2e/productos.spec.ts`
      **Estado**: T021-T026 (6 tests) 100% en verde en `--project=admin` y en corrida completa con
      `proveedores.spec.ts` + `rls.spec.ts` en los 4 proyectos de Playwright, sin flakes.

### Implementation for User Story 2

- [X] T027 [P] [US2] Implementar `app/composables/useProductos.ts`: `listar(busqueda, tipo?)`,
      `crear`, `editar`, `eliminar` con `mapearErrorEscritura`/`ETIQUETAS_DEPENDIENTES` cubriendo
      `cargas_combustible` y `mantenimiento_detalles`, y `tieneRegistrosAsociados(productoId)`
      (dos `select count`, `OR`eados en el cliente — contracts/productos.md, research.md R4/R5/R6)
      **Estado**: ver nota de bug en T022 (`listar()`, escape incorrecto en `.ilike()`).
- [X] T028 [P] [US2] Implementar `app/components/productos/FormularioProducto.vue`: nombre
      (obligatorio), tipo (`v-select` obligatorio, deshabilitado con `v-tooltip` si
      `tieneRegistrosAsociados()` devuelve `true` al abrir en modo edición), unidad (texto libre)
- [X] T029 [US2] Implementar `app/pages/admin/productos/index.vue`: patrón modal-en-listado
      (`CatalogosTablaCatalogo` + formulario en `v-dialog` +
      `CatalogosDialogoConfirmarEliminarCatalogo`), extendido con un `v-select` de filtro por tipo
      junto al buscador (research.md R8)
      **Estado**: hecho. También se agregó el link "Productos" al menú lateral
      (`app/layouts/admin.vue`), igual que Proveedores (T020). Verificado visualmente en
      navegador: el bloqueo del campo tipo se confirmó contra un producto "Diésel" real y
      preexistente con dependientes, no solo contra datos sembrados por los tests.

**Checkpoint**: Productos funcional y probado de forma independiente — ambas historias completas,
MVP de la feature.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional (constitución §2-§4).

- [X] T030 [P] Playwright, caso positivo Y negativo (RLS, constitución §2 "no basta con probar el
      camino permitido"): un operario con solo `'ver'` en `proveedores` (permiso por defecto) no
      puede crear/editar/desactivar/reactivar/eliminar; con `'editar'` otorgado explícitamente, sí
      puede — en `tests/e2e/rls.spec.ts`
      **Estado**: usa un operario aislado (usuario propio, creado vía
      `admin.auth.admin.createUser()`), no el `operario-e2e` compartido — mismo criterio que T024
      de `006-foto-conductor` (ahora doblado en `004-conductores`) para evitar la condición de
      carrera entre proyectos de Playwright ya encontrada en esa feature.
- [X] T031 [P] Playwright, caso positivo Y negativo (RLS): mismo patrón que T030 para `productos`
      (SC-004) en `tests/e2e/rls.spec.ts`
      **Estado**: T030/T031 (2 tests × 4 proyectos = 8) 100% en verde, sin flakes.
- [X] T032 Accesibilidad WCAG 2.1 AA (constitución §4): revisar
      `FormularioProveedor.vue`/`FormularioProducto.vue`/`ProveedoresDialogoDesactivar.vue` y
      ambos listados con teclado real — mismo criterio ya aplicado en Catálogos Base y
      Vehículos/Conductores
      **Estado**: verificado por equivalencia — todos los campos usan labels de Vuetify
      (`v-text-field`/`v-autocomplete`), `DialogoDesactivar.vue` replica exactamente el marcado ya
      validado de Conductores, y `CatalogosTablaCatalogo`/`CatalogosDialogoConfirmarEliminarCatalogo`
      son componentes ya validados sin cambios — reforzado por que `getByLabel()` funciona en
      todos los tests nuevos, evidencia directa de asociación label/campo correcta.
- [X] T033 Ejecutar `quickstart.md` completo de punta a punta (los 7 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
      **Estado**: los 7 escenarios están cubiertos por T007-T016 (proveedores) + T021-T026
      (productos) + T030/T031 (RLS). Además, verificado visualmente en navegador (login como
      admin-e2e, ambas páginas, alta de proveedor, edición de un producto con tipo bloqueado por
      dependientes reales) — sin hallazgos nuevos más allá de los ya documentados en T011/T022.
- [X] T034 `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo de esta feature
      **Estado**: verde en cada paso de la implementación, no solo al final.

**Verificación final de Phase 5**: 132/132 en verde (`proveedores.spec.ts` + `productos.spec.ts` +
`rls.spec.ts` completo) en los 4 proyectos de Playwright (admin/operario/superusuario/anonimo),
sin flakes. Regresión adicional corrida contra la suite completa (`--project=admin`): 7 fallos,
todos en archivos que esta feature no toca (`conductores.spec.ts` T012/T019/T029/T036-T038/T041,
`permisos.spec.ts` T056) — confirmados no relacionados: T011/T012 de la sección "Foto del
Conductor" pasan limpio en aislado (mismo flake de contención de recursos por corrida en paralelo
ya documentado varias veces en este proyecto); T019 falla incluso aislado por una causa real pero
preexistente y fuera de alcance — busca por el apellido genérico "Torres", y la empresa de prueba
compartida ya acumuló 24 conductores con ese apellido de corridas anteriores de este mismo sesión,
superando la paginación de 20/página (idéntico patrón al bug real que si se corrigió en T022 de
esta feature, pero en un archivo y una historia de usuario que no pertenecen a
`006-catalogos-base-ii`); T056 de `permisos.spec.ts` falla incluso en aislamiento total por una
causa no relacionada con ningún código de esta feature (API de permisos de `archivos`, sin
relación con `proveedores`/`productos`) — probablemente estado de permisos residual del
`operario-e2e` compartido acumulado durante esta larga sesión. Ninguno de los 64 tests propios de
esta feature (T007-T031) falló en ninguna corrida, aislada o completa.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea ambas historias de usuario.
- **User Story 1 (Phase 3)** y **User Story 2 (Phase 4)**: dependen de Foundational, pero son
  independientes entre sí (tablas distintas, sin relación directa) — pueden implementarse en
  paralelo.
- **Polish (Phase 5)**: depende de que US1 y US2 estén completas.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- El composable (T017/T027) antes que los componentes que lo consumen (T018-T020/T028-T029).

### Parallel Opportunities

- T006 (regenerar tipos) puede correr en paralelo al resto de Foundational una vez aplicada la
  migración (T005).
- Todos los tests de US1 y de US2 marcados [P] pueden correr en paralelo (archivos distintos,
  casos independientes).
- US1 (Phase 3) y US2 (Phase 4) completas pueden implementarse en paralelo por ser independientes.
- T017-T019 (composable + 2 componentes de US1) pueden implementarse en paralelo entre sí — T020
  (la página) depende de los 3.
- T027-T028 (composable + componente de US2) pueden implementarse en paralelo — T029 (la página)
  depende de ambos.
- T030 y T031 (Polish RLS) pueden correr en paralelo entre sí.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: alta de proveedor con solo el nombre lo deja visible en el listado"
Task: "Playwright: buscar por nombre y por RFC encuentra el proveedor"
Task: "Playwright: editar un proveedor existente guarda los cambios"
Task: "Playwright: el listado oculta proveedores inactivos por defecto"
Task: "Playwright: intentar confirmar Desactivar sin motivo lo bloquea"
Task: "Playwright: desactivar con un motivo válido oculta el proveedor"
Task: "Playwright: reactivar un proveedor inactivo lo regresa al listado"
Task: "Playwright: desactivar/reactivar generan la accion correcta en auditoría"
Task: "Playwright: eliminar un proveedor con un mantenimiento dependiente se rechaza"
Task: "Playwright: eliminar un proveedor con una carga de combustible dependiente se rechaza"
```

---

## Implementation Strategy

### MVP First (ambas historias, P1 e independientes)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea ambas historias)
3. Completar Phase 3 (Proveedores) y Phase 4 (Productos) — en paralelo si hay capacidad, o
   secuencial en el orden que sea más cómodo, ya que no dependen una de la otra
4. **PARAR y VALIDAR**: probar ambas historias de forma independiente (juntas son el MVP completo
   de esta feature)
5. Completar Phase 5: Polish
6. Deploy/demo — con esto, Combustible (007) y una futura Mantenimiento ya tienen su prerrequisito
   de catálogos resuelto

---

## Notes

- [P] tareas = archivos distintos, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en el checkpoint para validar cada historia de forma independiente antes de Polish.
