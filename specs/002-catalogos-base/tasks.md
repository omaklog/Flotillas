---

description: "Task list for Feature 002 — Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos)"
---

# Tasks: Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos)

**Input**: Design documents from `/specs/002-catalogos-base/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/catalogos.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada regla
de negocio explícita en `spec.md` y, como mínimo, un caso negativo de RLS por cada tabla —
no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md), en el mismo orden de
prioridad ahí definido (P1 → P2 → P3).

**Esquema de base de datos**: a diferencia de Feature 001, las tablas `tipos_vehiculo`,
`aseguradoras` y `permisos` **ya existen** con su RLS y sus módulos de permisos granulares
(`initial_schema.sql`, `modulos_y_permisos.sql`, `permisos_ver_y_defaults.sql`). T002–T007 aplican
una única migración nueva con lo que falta: `CHECK` de formato de clave, `updated_at`, siembra
automática de tipos de vehículo, y auditoría — ver `data-model.md` sección "Extensiones sobre el
esquema actual".

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1–US3, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 de Feature 001 (`app/` cliente + `server/` Nitro backend), según
`plan.md`. Esta feature no agrega nada a `server/api/` (research.md R5): toda la lectura/escritura
va directo por `useSupabaseClient()`, protegida por RLS.

---

## Phase 1: Setup

**Purpose**: Referencias visuales requeridas antes de tocar cualquier CSS/componente de estas 3
pantallas (regla obligatoria de `CLAUDE.md` del proyecto; research.md R8). No hay bootstrap de
proyecto pendiente — ya existe desde Feature 001.

- [X] T001 Generar/descargar en Stitch las referencias de las 3 pantallas de catálogo (listado +
      formulario de alta/edición de Tipos de Vehículo, Aseguradoras, Catálogo de Permisos) siguiendo
      el workaround de `curl` documentado en `CLAUDE.md`; guardar los PNG en
      `docs/design-references/screens/` y añadir las filas correspondientes a
      `docs/design-references/screens.md` — el usuario generó "Administración de Catálogos" y
      "Detalle de Catálogo: Marcas y Modelos" directo en Stitch; descargadas y documentadas como
      referencia de **patrón** (breadcrumb, buscador+filtros, tabla con Acciones editar/eliminar,
      paginación), no de contenido literal (ver nota en `screens.md`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Ajustes de esquema y utilidades compartidas por las 3 historias — ninguna historia
puede empezar su UI hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new catalogos_base_ajustes`
- [X] T003 En esa migración: agregar `CHECK (clave ~ '^[a-z0-9_]+$' AND char_length(clave) <= 50)`
      a `public.tipos_vehiculo.clave` y `public.permisos.clave` (data-model.md, research.md R2)
- [X] T004 En esa misma migración: agregar columna `updated_at timestamptz not null default now()`
      + trigger `set_updated_at` a `public.tipos_vehiculo` y `public.permisos` (mismo patrón ya
      usado en `public.aseguradoras`; data-model.md)
- [X] T005 En esa misma migración: crear función `private.sembrar_tipos_vehiculo_default()` +
      trigger `trg_empresas_sembrar_tipos_vehiculo AFTER INSERT ON public.empresas` que inserte los
      3 tipos predefinidos (`ligero`/"Vehículo ligero", `pesado`/"Servicio pesado (más de 3.5
      toneladas)", `mat_peligrosos`/"Transporte de materiales peligrosos") con el `empresa_id` de la
      fila recién creada — mismo patrón que `private.otorgar_permisos_default_operario()`
      (research.md R3, spec FR-011)
- [X] T006 En esa misma migración: crear función `private.audit_catalogo()` (INSERT/UPDATE/DELETE,
      sin rama `activo`, a diferencia de `private.audit_empresas_usuarios()`) + triggers
      `trg_tipos_vehiculo_auditoria`, `trg_aseguradoras_auditoria`, `trg_permisos_auditoria`
      (`AFTER INSERT OR UPDATE OR DELETE`) en las 3 tablas (research.md R4, constitución §2)
- [X] T007 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: una
      empresa nueva queda con exactamente 3 `tipos_vehiculo`; una clave con mayúsculas o espacios es
      rechazada por el `CHECK` (`23514`); editar una fila de `tipos_vehiculo` genera una fila en
      `public.auditoria` con `accion = 'editar'` — todo confirmado end-to-end vía REST con
      `service_role`. **Hallazgo no bloqueante**: un `DELETE` físico directo de `empresas` (algo que
      la app nunca hace — FR-006 de Feature 001, solo desactivar) hace cascada a los catálogos, y su
      trigger de auditoría intenta insertar en `auditoria` referenciando una `empresa_id` ya
      borrada (`23503`). Preexistente al patrón de auditoría de Feature 001 (`audit_empresas()`
      tampoco maneja `DELETE`), no específico de esta migración — no se corrige aquí por estar fuera
      de alcance de Catálogos Base.
- [X] T008 Regenerar `app/types/database.types.ts` (`supabase gen types typescript --local`) para
      reflejar las columnas y triggers nuevos
- [X] T009 [P] Implementar `app/utils/clave.ts`: función pura que normaliza un nombre a formato de
      clave (minúsculas, sin diacríticos, espacios/símbolos → `_`, colapsar `_` repetidos, recortar
      a 50 caracteres, sin `_` al inicio/fin) (research.md R7) — verificado funcionalmente con
      node (diacríticos, emoji-only → vacío, truncado a 50 y conforme al regex del `CHECK`)
- [X] T010 [P] Implementar `app/composables/useCatalogo.ts`: CRUD genérico
      (`listar(busqueda)`/`crear`/`editar`/`eliminar`) parametrizado por nombre de tabla, que
      mapea `error.code === '23505'` a "ya existe con esa clave" y `error.code === '23503'` a un
      mensaje de dependientes configurable por entidad (contracts/catalogos.md)
- [X] T011 [P] Implementar `app/components/catalogos/TablaCatalogo.vue`: tabla + campo de búsqueda
      genérico (slots `encabezados`/`fila`, componente genérico de Vue `<T extends { id: string }>`)
      + paginación cliente (mismo patrón que `admin/usuarios/index.vue`), reusado por las 3
      pantallas — `yarn typecheck` y `yarn lint` en verde

**Checkpoint**: Fundación lista — las 3 historias de usuario pueden empezar.

---

## Phase 3: User Story 1 - Administrador gestiona tipos de vehículo (Priority: P1) 🎯 MVP

**Goal**: El administrador ve el catálogo de tipos de vehículo ya sembrado al crear su empresa, y
puede buscar, crear (con clave manual o autogenerada), editar y eliminar (si no está en uso).

**Independent Test**: Dar de alta una empresa nueva, confirmar los 3 tipos sembrados, crear un
tipo adicional, editarlo, buscarlo, y eliminar uno sin vehículos asociados — todo sin depender de
que exista Vehículos (003).

### Tests for User Story 1

- [X] T012 [P] [US1] Playwright: una empresa recién creada muestra exactamente los 3 tipos de
      vehículo predefinidos (`ligero`, `pesado`, `mat_peligrosos`) en `tests/e2e/tipos-vehiculo.spec.ts`
      — usa una empresa+admin propios (`crearEmpresaConAdmin`, nuevo helper), no la compartida
- [X] T013 [P] [US1] Playwright: alta con clave autogenerada desde el nombre (botón "Autogenerar")
      en `tests/e2e/tipos-vehiculo.spec.ts`
- [X] T014 [P] [US1] Playwright: alta manual rechazada por el formulario cuando la clave tiene
      mayúsculas, espacios o excede 50 caracteres, sin llegar a enviarse, en
      `tests/e2e/tipos-vehiculo.spec.ts`
- [X] T015 [P] [US1] Playwright: alta rechazada por clave duplicada dentro de la misma empresa,
      marcada en el formulario antes de enviar, en `tests/e2e/tipos-vehiculo.spec.ts`
- [X] T016 [P] [US1] Playwright: la búsqueda por nombre filtra el listado en
      `tests/e2e/tipos-vehiculo.spec.ts`
- [X] T017 [P] [US1] Playwright: edición de un tipo existente (incluida su clave) en
      `tests/e2e/tipos-vehiculo.spec.ts`
- [X] T018 [P] [US1] Playwright: eliminar un tipo en uso muestra "No se puede eliminar: hay
      vehículos usando este tipo" y no lo elimina — el vehículo dependiente se siembra directo vía
      `service_role` (mismo patrón que `tests/e2e/usuarios.spec.ts` T073, ya que Vehículos 003 no
      existe todavía) en `tests/e2e/tipos-vehiculo.spec.ts`
- [X] T019 [P] [US1] Playwright: eliminar un tipo sin vehículos asociados lo quita del listado sin
      error en `tests/e2e/tipos-vehiculo.spec.ts`
- [X] T020 [P] [US1] Playwright (RLS negativo, constitución §4): un operario con solo permiso `ver`
      en el módulo `tipos_vehiculo` no puede crear, editar ni eliminar. **Reubicada a
      `tests/e2e/rls.spec.ts`** (no `tipos-vehiculo.spec.ts` como decía originalmente esta tarea):
      ese archivo ya es la convención establecida del proyecto para negativos de RLS contra
      PostgREST directo (ver `rls.spec.ts` líneas 1-11, y los casos ya existentes de
      `empresas`/`usuarios`/`usuario_permisos`) — no se duplica el mecanismo por feature. **Ya en
      verde sin cambios de UI**: la protección RLS venía de Feature 001, esta tarea solo le faltaba
      la prueba.

      **Estado de la fase**: T013-T019 y T012 corridos contra `--project=admin` — confirmado en
      rojo como se esperaba (la página `/admin/tipos-vehiculo` todavía no existe, T021-T023
      pendientes). T020 corrida por separado — ya en verde (no depende de la UI).

### Implementation for User Story 1

- [X] T021 [P] [US1] Implementar `app/components/catalogos/tipos-vehiculo/FormularioTipoVehiculo.vue`
      (campos clave + nombre, validación regex/50 caracteres, botón "Autogenerar" vía
      `app/utils/clave.ts`, chequeo de clave duplicada contra el listado cargado antes de enviar) —
      además se agregó `app/components/catalogos/DialogoConfirmarEliminarCatalogo.vue` (no estaba
      explícito en plan.md, pero es el mismo patrón ya usado por
      `usuarios/DialogoConfirmarEliminarOperario.vue`, factorizado como genérico para las 3
      historias)
- [X] T022 [US1] Implementar `app/pages/admin/tipos-vehiculo/index.vue` (usa `TablaCatalogo.vue` +
      `FormularioTipoVehiculo.vue` + `useCatalogo('tipos_vehiculo')`, diálogo de confirmación de
      eliminación). **Sin gating por `tienePermiso`**: el middleware global (`auth.global.ts`) ya
      bloquea a cualquier no-admin de navegar a `/admin/**` por prefijo de ruta, así que
      `tienePermiso('tipos_vehiculo','crear'|...)` sería siempre `true` para quien llega a esta
      página (devuelve `true` de inmediato para rol `admin`/`superusuario`) — agregarlo habría sido
      código muerto. El catálogo sigue siendo visible/legible para operarios vía RLS directo
      (FR-015), pero esta feature no incluye una pantalla `/operario/**` para ellos (ninguna
      historia de usuario lo pide; `spec.md` y `plan.md` solo definieron páginas bajo `admin/`).
- [X] T023 [US1] Agregar entrada "Tipos de Vehículo" a `app/layouts/admin.vue`
      (`v-list-item to="/admin/tipos-vehiculo"`)

      **Verificación**: los 8 tests de US1 (T012-T019) corren en verde contra
      `--project=admin` tras esta implementación. Hallazgos de la vuelta roja→verde: (1) Vuetify
      coloca `data-testid` en el `<div>` contenedor del `v-text-field`, no en el `<input>` real —
      el buscador se ubica por `getByLabel` (`{ exact: true }`), no por testid, igual que el resto
      del proyecto; (2) `getByLabel('Nombre')`/`getByLabel('Clave')` sin `exact: true` hacen match
      parcial contra labels más largos ("Buscar por nombre", "Clear Buscar por nombre"); (3) el
      texto del diálogo de confirmación de eliminar (`<strong>{nombre}</strong>`) puede seguir en
      el DOM durante su animación de cierre — las aserciones post-eliminación se acotaron a
      `getByTestId('tipos-vehiculo-tabla').getByText(...)` en vez de a nivel de página completa.

      **Regresión real encontrada y corregida** al correr la suite completa (`--project=admin`,
      39 tests): `tests/e2e/usuarios.spec.ts` T073 sembraba un `tipos_vehiculo` de prueba con
      clave `t073-${Date.now()}` (con guion) — válido antes de esta feature, pero rechazado por el
      `CHECK` nuevo (`chk_tipos_vehiculo_clave_formato`, T003). Corregido a `t073_${Date.now()}`
      (guion bajo). Confirmado con `usuarios.spec.ts` corrida sola: 8/8 verdes. Las otras fallas
      que solo aparecen corriendo los 39 tests juntos (T050/T070/T071 de `usuarios.spec.ts`) son
      contención de recursos contra un solo `yarn dev` bajo carga, no regresiones — ya documentado
      como comportamiento conocido en las notas de Feature 001 ("ejecutar con --project=<uno>
      durante desarrollo"); confirmado corriendo esos archivos aislados: todo en verde.

**Checkpoint**: US1 funcional y probado de forma independiente.

---

## Phase 4: User Story 2 - Administrador gestiona compañías de seguro (Priority: P2)

**Goal**: El administrador mantiene el catálogo de aseguradoras de su empresa (vacío por defecto):
buscar, crear, editar y eliminar (si no está en uso).

**Independent Test**: Dar de alta, editar, buscar y eliminar una aseguradora sin vehículos
asociados, todo sin depender de que exista Vehículos (003).

### Tests for User Story 2

- [X] T024 [P] [US2] Playwright: una empresa recién creada tiene el catálogo de aseguradoras vacío
      en `tests/e2e/aseguradoras.spec.ts`
- [X] T025 [P] [US2] Playwright: alta con razón social + RFC en `tests/e2e/aseguradoras.spec.ts`
- [X] T026 [P] [US2] Playwright: la búsqueda por nombre y por RFC filtra el listado en
      `tests/e2e/aseguradoras.spec.ts`
- [X] T027 [P] [US2] Playwright: edición de una aseguradora existente en
      `tests/e2e/aseguradoras.spec.ts`
- [X] T028 [P] [US2] Playwright: eliminar una aseguradora en uso muestra "No se puede eliminar: hay
      vehículos usando esta aseguradora" y no la elimina — vehículo dependiente sembrado vía
      `service_role` (mismo patrón que T018) en `tests/e2e/aseguradoras.spec.ts`
- [X] T029 [P] [US2] Playwright: eliminar una aseguradora sin vehículos asociados la quita del
      listado sin error en `tests/e2e/aseguradoras.spec.ts`
- [X] T030 [P] [US2] Playwright (RLS negativo, constitución §4): un operario con solo permiso `ver`
      en el módulo `aseguradoras` no puede crear, editar ni eliminar. **Reubicada a
      `tests/e2e/rls.spec.ts`** (mismo criterio que T020) — a diferencia de tipos_vehiculo, no hay
      fila sembrada por defecto (FR-013), así que el test siembra su propia aseguradora vía
      `service_role` antes de probar UPDATE/DELETE del operario. Ya en verde (no depende de la UI).

      **Estado de la fase**: T024-T029 corridas contra `--project=admin` — confirmado en rojo
      (6/6 fallan, `/admin/aseguradoras` no existe todavía). T030 corrida por separado — verde.

### Implementation for User Story 2

- [X] T031 [P] [US2] Implementar `app/components/catalogos/aseguradoras/FormularioAseguradora.vue`
      (campos razón social + RFC)
- [X] T032 [US2] Implementar `app/pages/admin/aseguradoras/index.vue` (usa `TablaCatalogo.vue` +
      `FormularioAseguradora.vue` + `useCatalogo('aseguradoras')`, mismo patrón que T022; sin
      gating por `tienePermiso` por el mismo motivo documentado en T022)
- [X] T033 [US2] Agregar entrada "Aseguradoras" a `app/layouts/admin.vue`
      (`v-list-item to="/admin/aseguradoras"`)

      **Verificación**: los 6 tests de US2 (T024-T029) pasaron en verde a la primera corrida —
      los ajustes de selectores aprendidos en US1 (labels con `exact: true`, testid en la tabla en
      vez de en el input de búsqueda) se aplicaron desde el inicio en `aseguradoras.spec.ts`.

**Checkpoint**: US1 y US2 funcionan de forma independiente.

---

## Phase 5: User Story 3 - Administrador gestiona catálogo de permisos aplicables (Priority: P3)

**Goal**: El administrador mantiene el catálogo de tipos de permiso (Estatal/Federal) de su
empresa (vacío por defecto): buscar, crear (con clave manual o autogenerada), editar y eliminar (si
no está asignado a ningún vehículo).

**Independent Test**: Dar de alta, editar, buscar y eliminar un tipo de permiso sin asignaciones
vía `vehiculo_permisos`, todo sin depender de que exista Vehículos (003).

### Tests for User Story 3

- [X] T034 [P] [US3] Playwright: una empresa recién creada tiene el catálogo de permisos vacío en
      `tests/e2e/permisos-catalogo.spec.ts`
- [X] T035 [P] [US3] Playwright: alta con clave autogenerada desde el nombre, nombre y tipo
      (Estatal o Federal) en `tests/e2e/permisos-catalogo.spec.ts`
- [X] T036 [P] [US3] Playwright: alta rechazada por clave duplicada dentro de la misma empresa,
      marcada en el formulario antes de enviar, en `tests/e2e/permisos-catalogo.spec.ts`
- [X] T037 [P] [US3] Playwright: la búsqueda por nombre y por clave filtra el listado en
      `tests/e2e/permisos-catalogo.spec.ts`
- [X] T038 [P] [US3] Playwright: edición de un permiso existente (incluidos clave y tipo) en
      `tests/e2e/permisos-catalogo.spec.ts`
- [X] T039 [P] [US3] Playwright: eliminar un permiso asignado a un vehículo muestra "No se puede
      eliminar: hay vehículos con este permiso asignado" y no lo elimina — vehículo + fila de
      `vehiculo_permisos` sembrados vía `service_role` (mismo patrón que T018) en
      `tests/e2e/permisos-catalogo.spec.ts`
- [X] T040 [P] [US3] Playwright: eliminar un permiso sin asignaciones lo quita del listado sin
      error en `tests/e2e/permisos-catalogo.spec.ts`
- [X] T041 [P] [US3] Playwright (RLS negativo, constitución §4): un operario con solo permiso `ver`
      en el módulo `permisos` no puede crear, editar ni eliminar. **Reubicada a
      `tests/e2e/rls.spec.ts`** (mismo criterio que T020/T030) — sin siembra por defecto (FR-013),
      el test siembra su propio permiso vía `service_role`. Ya en verde (no depende de la UI).

      **Estado de la fase**: T034-T040 corridas contra `--project=admin` — confirmado en rojo
      (7/7 fallan, `/admin/permisos` no existe todavía). T041 corrida por separado — verde.

### Implementation for User Story 3

- [X] T042 [P] [US3] Implementar `app/components/catalogos/permisos/FormularioTipoPermiso.vue`
      (campos clave + nombre + tipo `estatal`/`federal`, validación regex/50 caracteres, botón
      "Autogenerar", chequeo de clave duplicada antes de enviar)
- [X] T043 [US3] Implementar `app/pages/admin/tipos-permiso/index.vue` (usa `TablaCatalogo.vue` +
      `FormularioTipoPermiso.vue` + `useCatalogo('permisos')`, mismo patrón que T022). **Ruta
      renombrada** de `/admin/permisos` (como decían plan.md/tasks.md originalmente) a
      `/admin/tipos-permiso`: `app/pages/admin/permisos/[id].vue` ya existe desde Feature 001
      (asignación de permisos granulares a un operario, US-1.9) — usar `admin/permisos/index.vue`
      para el catálogo habría hecho que `/admin/permisos` significara dos cosas distintas según
      si sigue un id o no. `/admin/tipos-permiso` es paralelo a `/admin/tipos-vehiculo` y no
      choca con nada.
- [X] T044 [US3] Agregar entrada "Catálogo de Permisos" a `app/layouts/admin.vue`
      (`v-list-item to="/admin/tipos-permiso"`, ruta corregida — ver nota en T043)

      **Verificación**: 7/7 tests de US3 en verde, y los 27 tests de Feature 002
      (`tipos-vehiculo.spec.ts` + `aseguradoras.spec.ts` + `permisos-catalogo.spec.ts` +
      `rls.spec.ts`) corridos juntos también en verde, sin interferencia cruzada.

      **Bug real de Playwright+Vuetify encontrado y resuelto**: el `v-select` de "Tipo" no abría
      su menú de opciones de forma confiable justo después de abrir el diálogo de alta/edición —
      reproducible incluso con `--workers=1` (no era contención de recursos). Diagnosticado con
      `--trace=on`: el clic sí se ejecutaba sobre el `<input role="combobox">` correcto, pero el
      menú nunca se pintaba — carrera con la animación de entrada del `v-dialog` de Vuetify
      (~250ms). Se descartaron dos hipótesis antes de dar con la causa real: (1) que fuera por
      llenar "Clave" a mano en vez de con "Autogenerar" (reordenar Tipo antes de Clave no lo
      arregló); (2) que faltara un blur explícito (`Tab` tampoco lo arregló). La causa real era
      simplemente el tiempo entre abrir el diálogo e interactuar con el primer campo. Fix: helper
      `abrirDialogo(page, activador)` en `permisos-catalogo.spec.ts` que agrega una espera fija
      de 300ms tras el clic que abre cualquier diálogo — aplicado uniformemente a los 6 puntos de
      apertura del archivo. **Nota para T003 de Vehículos (003) o cualquier feature futura con
      `v-select` dentro de un diálogo**: replicar este mismo patrón de espera post-apertura en vez
      de asumir que el diálogo está listo para interactuar de inmediato.

**Checkpoint**: Las 3 historias funcionan de forma independiente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificaciones que cruzan las 3 historias.

- [X] T045 [P] Verificar accesibilidad WCAG 2.1 AA (labels asociados, foco visible, contraste) en
      los 3 listados y sus 3 formularios (constitución §4). Sin tooling automatizada de a11y en el
      proyecto (ni siquiera desde Feature 001) — verificación manual/por código: (1) los 6 campos
      de texto usan el prop `label` de Vuetify (asociación nativa vía `aria-labelledby`, ya
      confirmado indirectamente: los 21 tests de Feature 002 ubican los campos con
      `page.getByLabel(...)`, que depende del árbol de accesibilidad real); (2) los 6 botones
      ícono de editar/eliminar tienen `aria-label` explícito (`Editar {nombre}`/`Eliminar
      {nombre}`); (3) `app/assets/css/main.css` define `:focus-visible` global sin remover el
      contorno de foco por defecto — no hay overrides nuevos en esta feature; (4) los 3
      componentes reusan clases/colores del sistema de diseño ya vetado (`primary-container`,
      `error`, `text-medium-emphasis`), sin colores nuevos; (5) `TablaCatalogo.vue` usa `v-table`
      con `<th>`/`<td>` semánticos, no `<div>`.
- [X] T046 [P] Playwright: aislamiento por empresa en las 3 tablas — la misma clave en dos empresas
      distintas no choca (`UNIQUE (empresa_id, clave)`, aplica a `tipos_vehiculo` y `permisos`), y
      un administrador no ve catálogos de otra empresa en ninguna de las 3 (`tipos_vehiculo`,
      `aseguradoras`, `permisos`). **Reubicada a `tests/e2e/rls.spec.ts`** (no a los 3 archivos de
      historia como decía originalmente esta tarea) — mismo criterio que T020/T030/T041: es el
      archivo ya establecido del proyecto para este tipo de prueba, y consolidar las 3 tablas en
      un solo test (en vez de triplicarlo) evita repetir el mismo patrón de "crear empresa ajena +
      verificar que admin-e2e no la ve" ya usado para `empresas`/`usuarios` en ese archivo.
      Verificado además que la siembra automática de una segunda empresa con las mismas 3 claves
      predefinidas no genera conflicto (prueba viva de que el `UNIQUE` es por `empresa_id`, no
      global). quickstart.md Escenario 5. Cierra G1 de `/speckit-analyze`.
- [X] T047 Ejecutar `quickstart.md` de punta a punta y confirmar en `public.auditoria` una fila por
      cada alta/edición/eliminación de los 3 catálogos, con `valores_antes`/`valores_despues`
      coherentes. Los 5 escenarios de `quickstart.md` quedaron cubiertos por la suite automatizada
      (T012-T046); verificación adicional vía REST con `service_role` sobre `public.auditoria`:
      las 9 combinaciones `entidad × accion` (`tipos_vehiculo`/`aseguradoras`/`permisos` ×
      `crear`/`editar`/`eliminar`) tienen filas (197 en total, acumuladas por toda la suite de
      Feature 002), y una fila de `editar` de muestra confirma `valores_antes`/`valores_despues`
      coherentes con el cambio real (`clave`, `nombre`, `updated_at`).

      **Segunda ronda de hallazgos, al re-verificar T045-T047** (una corrida completa de la
      suite, sin `--project` único, expuso 2 problemas reales que las corridas aisladas previas
      no habían disparado):

      1. **Bug real de aplicación, no de test** — `app/composables/useCatalogo.ts` construía el
         filtro `.or()` de PostgREST interpolando el texto de búsqueda sin escapar. PostgREST usa
         `,`/`.`/`(`/`)` como sintaxis estructural en `or()`; un texto de búsqueda que contenga
         esos caracteres (p. ej. una razón social con "(Sucursal Norte)", o cualquier nombre con
         paréntesis o comas — nada exótico) rompía el parseo del filtro y devolvía 0 resultados
         **en silencio** (200 OK, sin error visible). Reproducido primero como fallo de test
         (T027 de `aseguradoras.spec.ts`, al buscar "... (editada)"), diagnosticado contra
         PostgREST directo con `curl`, y corregido envolviendo el valor en comillas dobles
         (`campo.ilike."%texto%"`) con escape de `\`/`"` propios del texto — el mismo fix que
         PostgREST documenta para filtros con caracteres especiales. Afecta a los 3 catálogos por
         igual (`useCatalogo.ts` es compartido) — un solo fix corrige los tres.
      2. **Higiene de datos de test**: el catálogo compartido `Empresa E2E` (reusado por
         `global-setup.ts` entre corridas) acumuló más de 20 registros en `tipos_vehiculo` y
         `permisos` a lo largo de esta sesión de desarrollo, superando el tamaño de página de
         `TablaCatalogo.vue` (20). Las aserciones "fila visible tras crear" que buscaban
         directamente en `tbody tr` sin filtrar antes por el buscador podían fallar si la fila
         nueva ordenaba alfabéticamente fuera de la primera página. Fix: helper `buscarFila()`
         agregado a `tipos-vehiculo.spec.ts`, `aseguradoras.spec.ts` y `permisos-catalogo.spec.ts`
         que filtra por el buscador antes de aseverar visibilidad — robusto sin importar el
         tamaño acumulado del catálogo. De paso, `T036` tenía nombres de fila sin
         `${Date.now()}` (`'Permiso Original T036'` a secas), causando un `strict mode violation`
         por filas duplicadas de corridas anteriores — corregido con sufijo único como el resto
         de los tests.

      **Verificación final**: `tipos-vehiculo.spec.ts` + `aseguradoras.spec.ts` +
      `permisos-catalogo.spec.ts` + `rls.spec.ts` corridos juntos (28 tests) — todos en verde tras
      ambos fixes. Una corrida de la suite completa del proyecto (39 tests, todos los archivos)
      mostró 4 fallos adicionales, todos con la misma firma de timeout esperando hidratación/
      `nuevo-btn` — contención de recursos de correr 39 tests × 6 workers contra un solo `yarn
      dev`, ya documentada como comportamiento conocido desde Feature 001 ("ejecutar con
      --project=<uno> durante desarrollo"). Confirmado no-regresión: los 4 tests corridos de
      nuevo junto con sus archivos hermanos (17 tests) — 17/17 en verde.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede correr en paralelo con Foundational.
- **Foundational (Phase 2)**: sin dependencias de Setup, pero BLOQUEA las 3 historias de usuario.
- **User Stories (Phase 3–5)**: todas dependen de Foundational. Pueden avanzar en paralelo entre
  sí (si hay capacidad) o en orden de prioridad P1 → P2 → P3.
- **Polish (Phase 6)**: depende de que las historias que se vayan a entregar estén completas.

### User Story Dependencies

- **US1 (P1)**: solo depende de Foundational. Ninguna dependencia de US2/US3.
- **US2 (P2)**: solo depende de Foundational. Comparte `app/layouts/admin.vue` con US1/US3 (mismo
  archivo, así que su tarea de menú T033 no puede correr en paralelo exacto con T023/T044 — resto
  independiente).
- **US3 (P3)**: mismo caso que US2.

### Within Each User Story

- Tests antes que implementación (deben fallar antes de implementar).
- Formulario (componente) antes que la página que lo usa.
- Página antes que la entrada de menú (la entrada de menú es lo último que hace la historia
  navegable de punta a punta).

### Parallel Opportunities

- T009, T010, T011 (Foundational) en paralelo entre sí — archivos distintos.
- Dentro de cada historia, todas las tareas de test marcadas [P] pueden dispararse juntas.
- Los 3 componentes `Formulario*.vue` (T021, T031, T042) son independientes entre historias y
  pueden avanzar en paralelo si hay más de un desarrollador.
- Las ediciones a `app/layouts/admin.vue` (T023, T033, T044) tocan el mismo archivo — deben
  serializarse entre sí aunque sus historias avancen en paralelo en todo lo demás.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de US1 juntos:
Task: "Playwright: siembra automática de 3 tipos de vehículo en tests/e2e/tipos-vehiculo.spec.ts"
Task: "Playwright: alta con clave autogenerada en tests/e2e/tipos-vehiculo.spec.ts"
Task: "Playwright: alta rechazada por formato de clave inválido en tests/e2e/tipos-vehiculo.spec.ts"
Task: "Playwright: alta rechazada por clave duplicada en tests/e2e/tipos-vehiculo.spec.ts"
Task: "Playwright: búsqueda por nombre en tests/e2e/tipos-vehiculo.spec.ts"
Task: "Playwright: edición de un tipo existente en tests/e2e/tipos-vehiculo.spec.ts"
Task: "Playwright: eliminación bloqueada por FK en tests/e2e/tipos-vehiculo.spec.ts"
Task: "Playwright: eliminación exitosa sin dependientes en tests/e2e/tipos-vehiculo.spec.ts"
Task: "Playwright RLS negativo: operario no puede escribir en tests/e2e/tipos-vehiculo.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Phase 1: Setup (referencias Stitch)
2. Completar Phase 2: Foundational (CRÍTICO — bloquea las 3 historias)
3. Completar Phase 3: User Story 1
4. **DETENER Y VALIDAR**: probar US1 de forma independiente (quickstart.md Escenario 1)
5. Desplegar/demo si está listo — ya establece el molde de CRUD que Vehículos (003) reutilizará

### Incremental Delivery

1. Setup + Foundational → fundación lista
2. US1 (Tipos de Vehículo) → probar independientemente → demo (MVP, incluye la siembra automática
   más compleja de las 3 historias)
3. US2 (Aseguradoras) → probar independientemente → demo (el CRUD más simple de las 3)
4. US3 (Catálogo de Permisos) → probar independientemente → demo
5. Polish: accesibilidad, aislamiento por empresa, auditoría de punta a punta

### Parallel Team Strategy

Con más de un desarrollador: completar Setup + Foundational juntos, luego una persona por
historia (US1/US2/US3) — solo coordinar al tocar `app/layouts/admin.vue` (T023/T033/T044).

---

## Notes

- [P] = archivos distintos o casos de prueba independientes en el mismo spec, sin dependencias
  pendientes entre sí.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Cada historia debe quedar completable y probable de forma independiente.
- Verificar que los tests fallan antes de implementar.
- Hacer commit después de cada tarea o grupo lógico.
- Detenerse en cada checkpoint para validar la historia de forma independiente.
- Evitar: tareas vagas, conflictos de mismo archivo sin serializar, dependencias cruzadas entre
  historias que rompan su independencia.
