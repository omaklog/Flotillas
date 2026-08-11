---

description: "Task list for Feature 009 — Checklist de Aditamentos y Revisión de Seguridad"
---

# Tasks: Checklist de Aditamentos y Revisión de Seguridad

**Input**: Design documents from `/specs/009-checklist/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/checklist.md,
quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada
regla de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS por
módulo de permisos afectado — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) — US1 (Gestionar plantilla,
P1) es prerrequisito funcional de US2 (Realizar checklist, P1): sin plantilla no hay captura
posible (Clarifications, sesión 2026-08-11). US3 (Consultar, P2) depende de que ya existan
checklists capturados.

**Esquema de base de datos**: `checklists`/`checklist_items` **ya existen** completas e
inmutables desde el diseño original (`_no_update`/`_no_delete`, `using (false)` incondicional).
T002-T006 aplican una única migración nueva con lo que falta: tabla `checklist_item_plantillas`
(con su RLS), columna `conductor_id` en `checklists`, columnas `es_critico`/`plantilla_item_id`
en `checklist_items`, y 3 triggers de auditoría genéricos — ver `data-model.md` sección
"Extensiones sobre el esquema actual".

**Referencias visuales**: no existe ninguna captura de Stitch dedicada a Checklist/Aditamentos.
Se reutilizan `administracion-catalogos.png` (patrón modal-en-listado, para la pantalla de
plantilla), `gestion-vehiculo-alta-edicion.png` (estructura de formulario de captura),
`listado-flotilla-vehiculos-v2.png` (listado con filtros) y `listado-operarios-paginacion.png`
(paginación) — mismas 4 referencias de estilo que Combustible (007)/Mantenimiento (008), sin
generar mockups nuevos.

**Lecciones de features anteriores a aplicar desde el inicio, no redescubrir**:
- **Auditoría genérica desde Foundational, no como corrección posterior**: Combustible (007) y
  Mantenimiento (008) descubrieron (el segundo, ya proactivamente) que sus tablas nuevas se
  quedaban sin trigger de auditoría si no se agregaba explícitamente. Esta feature ya incluye 3
  triggers reutilizando `private.audit_catalogo()` **genérica** en T004 — ninguna de las 3 tablas
  de esta feature tiene una columna de estado que distinguir (a diferencia de
  `cargas_combustible`/`mantenimientos`), así que no hace falta ninguna función dedicada nueva
  (research.md R1).
- **El permiso real de escritura de la plantilla es `'editar'`, no `'eliminar'`** (research.md
  R2): `schema_11` agrega la acción `'eliminar'` al catálogo de `acciones_disponibles`, pero la
  única política RLS de escritura (`checklist_item_plantillas_write`, `for all`) solo verifica
  `tiene_permiso('checklist','editar')`. Gatear el botón de eliminar en la UI por `'eliminar'`
  produciría un mismatch real con RLS — usar `'editar'` para las 3 acciones (alta/edición/
  eliminación).
- **Sin líneas dinámicas en la captura** (research.md R6): a diferencia de Mantenimiento, los
  ítems de un checklist NO los agrega el usuario — el formulario renderiza automáticamente una
  fila fija por cada ítem activo de la plantilla del tipo de vehículo seleccionado. No implementar
  botones de "agregar/quitar línea" aquí.
- **Captura de checklist + ítems es un `insert` en 2 pasos, no una transacción** (research.md
  R8, mismo criterio que Mantenimiento R13): si el segundo paso (ítems) falla tras crear el
  checklist, el composable MUST devolver el error junto con el `id` del checklist ya creado para
  poder reintentar.
- **Conductor autocompletado sin función nueva** (research.md R7): `asignaciones_conductor_vehiculo`
  garantiza como máximo una asignación activa por vehículo (índice único parcial de Feature 005)
  — una simple consulta con `.maybeSingle()` basta, sin desambiguación.
- El selector de vehículo carga TODOS los vehículos de la empresa sin paginar — mismo riesgo del
  límite de 1000 filas de PostgREST ya encontrado en Combustible (research.md R10): los tests de
  captura MUST usar una empresa aislada por test (`crearEmpresaConAdmin`), no la sesión
  compartida `admin-e2e`.
- `usePermisos().tienePermiso('checklist', accion)` ya funciona sin cambios — el módulo y sus
  acciones `ver`/`crear` (por defecto) y `editar`/`eliminar` (nuevas de esta feature, no por
  defecto) están sembrados desde `schema_11` (research.md R2).
- `supabase gen types typescript --local > archivo` **nunca** con `2>&1` después del `>` —
  corrompe el archivo con el banner del CLI.
- El detalle de un checklist (`[id]/index.vue`) consulta directo con `useSupabaseClient()` en el
  propio componente de página, sin una función `obtener(id)` en el composable — mismo patrón ya
  usado en Vehículos/Combustible/Mantenimiento.
- **`/speckit-analyze` sobre esta feature encontró 2 brechas ya incorporadas desde esta versión
  de `tasks.md`** (T009, T019 abajo) — reglas de negocio explícitas en `spec.md` sin prueba
  dedicada: (1) editar un ítem de plantilla no debe reinterpretar checklists ya capturados
  (US1/AC2), y (2) intentar guardar sin resultado general debe rechazarse (FR-009, Edge Cases).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1 = Gestionar plantilla, US2 = Realizar
  checklist, US3 = Consultar, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend). Esta feature no agrega
nada a `server/api/`: toda la lectura/escritura va directo por `useSupabaseClient()`, protegida
por RLS.

---

## Phase 1: Setup

**Purpose**: Documentar la decisión de reutilizar referencias visuales existentes antes de tocar
cualquier CSS/componente.

- [X] T001 Agregar una entrada a `docs/design-references/screens.md` documentando que Checklist
      (009) no tiene captura propia de Stitch y reutiliza `administracion-catalogos.png` (patrón
      modal-en-listado para la plantilla), `gestion-vehiculo-alta-edicion.png` (formulario de
      captura), `listado-flotilla-vehiculos-v2.png` (listado con filtros) y
      `listado-operarios-paginacion.png` (paginación)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema — nada de la UI puede empezar hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna tarea de implementación de US1/US2/US3 puede empezar hasta que esta fase
esté completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new checklist_plantillas`
- [X] T003 En esa migración: aplicar el contenido literal de
      `docs/schema-reference/schema_11_checklist_plantillas.sql` — crea
      `checklist_item_plantillas` (con su RLS `_select`/`_write` e índices), agrega las acciones
      `'editar'`/`'eliminar'` al módulo `checklist`, agrega `checklists.conductor_id`, y agrega
      `checklist_items.es_critico`/`plantilla_item_id` (data-model.md, research.md R1)
- [X] T004 En esa misma migración: crear 3 triggers de auditoría reutilizando
      `private.audit_catalogo()` genérica —
      `trg_checklist_item_plantillas_auditoria`, `trg_checklists_auditoria`,
      `trg_checklist_items_auditoria`, cada uno `after insert or update or delete` sobre su
      tabla respectiva (research.md R1, data-model.md)
- [X] T005 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: un
      `insert` en `checklist_item_plantillas` genera auditoría `accion='crear'`; un `insert` en
      `checklists` seguido de `checklist_items` procede y genera auditoría; cualquier `update`/
      `delete` sobre un `checklist` o un `checklist_item` ya insertado se rechaza (RLS
      `using (false)`, incondicional); un `delete` de un ítem de plantilla con checklists ya
      capturados que lo referencian procede sin error (gracias a `on delete set null`) y no borra
      ni corrompe esos checklists — la cobertura automatizada de esto vive en Phase 3/4/5/6, no
      reemplaza esta verificación manual inicial
- [X] T006 [P] Regenerar `app/types/database.types.ts`
      (`supabase gen types typescript --local > app/types/database.types.ts`, **sin** `2>&1`)

**Checkpoint**: Fundación lista — US1 puede empezar.

---

## Phase 3: User Story 1 - Administrador gestiona la plantilla de checklist por tipo de vehículo (Priority: P1) 🎯 MVP (parte 1/3)

**Goal**: Un administrador (u operario con permiso `editar`) puede dar de alta, editar y eliminar
ítems de plantilla para cada tipo de vehículo, sin afectar checklists ya capturados.

**Independent Test**: Dar de alta varios ítems para un tipo de vehículo, confirmar que aparecen
en el orden capturado; editar uno; eliminar otro y confirmar que un checklist ya capturado
previamente con ese ítem conserva su copia intacta.

### Tests for User Story 1

- [X] T007 [P] [US1] Playwright: alta de varios ítems con nombre/orden/"es crítico" queda
      visible en el listado, ordenado como se capturó (FR-001, US1/AC1) en
      `tests/e2e/checklist.spec.ts`
- [X] T008 [P] [US1] Playwright: editar un ítem existente (nombre, orden, "es crítico") guarda
      los cambios (FR-002, US1/AC2) en `tests/e2e/checklist.spec.ts`
- [X] T009 [P] [US1] Playwright: capturar un checklist con un ítem de la plantilla, luego editar
      ese ítem en la plantilla (nombre y/o "es crítico"), y confirmar que el detalle del
      checklist ya capturado sigue mostrando los valores **originales**, no los editados
      (FR-008, US1/AC2 "sin afectar checklists ya capturados") en `tests/e2e/checklist.spec.ts`
      **Nota de implementación**: hallazgo F1 de `/speckit-analyze` sobre esta feature — T008
      solo prueba que editar guarda el cambio en la plantilla, no que un checklist ya capturado
      queda inmune a ese cambio; son dos afirmaciones distintas de la misma AC.
- [X] T010 [P] [US1] Playwright: eliminar un ítem de la plantilla ya usado en un checklist
      capturado lo quita de la plantilla (futuras capturas no lo incluyen) sin afectar la copia
      del checklist ya guardado (FR-002, FR-008, US1/AC3) en `tests/e2e/checklist.spec.ts`
- [X] T011 [P] [US1] Playwright: un operario sin el permiso `editar` (permiso por defecto, solo
      `ver`/`crear`) no ve disponibles las acciones de alta/edición/eliminación de la plantilla
      (research.md R2) en `tests/e2e/checklist.spec.ts`

### Implementation for User Story 1

- [X] T012 [P] [US1] Implementar `app/composables/useChecklistPlantillas.ts`:
      `listar(tipoVehiculoId)`, `crear`, `editar`, `eliminar` (contracts/checklist.md)
- [X] T013 [P] [US1] Implementar `app/components/checklist/FormularioItemPlantilla.vue`: nombre
      (obligatorio), orden (numérico), "es crítico" (checkbox)
- [X] T014 [US1] Implementar `app/pages/admin/checklist/plantilla.vue`: selector de tipo de
      vehículo arriba, patrón modal-en-listado (`CatalogosTablaCatalogo` +
      `FormularioItemPlantilla.vue` en `v-dialog` — sin diálogo de confirmar-eliminar con
      dependientes, ya que `on delete set null` no bloquea, research.md R2/data-model.md) debajo,
      con las acciones de escritura gateadas por `usePermisos().tienePermiso('checklist',
      'editar')`; agregar el link "Checklist" al menú lateral (`app/layouts/admin.vue`)

**Checkpoint**: Plantilla funcional y probada de forma independiente — US2 puede empezar.

---

## Phase 4: User Story 2 - Realizar un checklist (Priority: P1) 🎯 MVP (parte 2/3)

**Goal**: Un administrador u operario con permiso `crear` puede capturar la revisión de
seguridad de un vehículo, con la plantilla de su tipo cargada automáticamente, el conductor
autocompletado, y un resultado general manual.

**Independent Test**: Con una plantilla ya configurada para el tipo de vehículo, capturar un
checklist completo (marcando cada ítem, con observaciones donde no cumple, y un resultado
general) y confirmar que queda guardado con todos sus datos correctos; intentar capturar para un
vehículo cuyo tipo no tiene plantilla configurada y confirmar que se bloquea con un mensaje
claro.

### Tests for User Story 2

- [X] T015 [P] [US2] Playwright: captura completa (plantilla cargada automáticamente, todos los
      ítems marcados, resultado general elegido) queda visible en su detalle con los datos
      correctos (FR-003, FR-007, FR-008, FR-009, US2/AC1, US2/AC4) en
      `tests/e2e/checklist.spec.ts`
- [X] T016 [P] [US2] Playwright: un vehículo con una asignación de conductor activa precarga ese
      conductor en el formulario, editable antes de guardar (FR-005, US2/AC2) en
      `tests/e2e/checklist.spec.ts`
      **Nota de implementación**: Vuetify's VAutocomplete solo refleja el modelo en el `value` del
      `<input>` mientras el campo tiene foco (ver `watch(isFocused, ...)` en `VAutocomplete.js`) —
      al preseleccionar el conductor programáticamente sin que el campo reciba foco nunca, la
      etiqueta se renderiza aparte en `.v-autocomplete__selection-text`. `toHaveValue()` contra el
      input daba siempre `""` aunque el modelo (y la UI real) estuvieran correctos; se agregó el
      helper `textoSeleccionConductor()` que apunta a ese span en vez del `<input>`.
- [X] T017 [P] [US2] Playwright: un vehículo sin ninguna asignación de conductor activa deja el
      campo de conductor vacío, seleccionable manualmente (FR-005, US2/AC3) en
      `tests/e2e/checklist.spec.ts`
- [X] T018 [P] [US2] Playwright: marcar un ítem como "no cumple" sin capturar observaciones
      bloquea el envío antes de guardar (FR-007, US2/AC5, SC-003) en
      `tests/e2e/checklist.spec.ts`
- [X] T019 [P] [US2] Playwright: intentar guardar un checklist con todos los ítems marcados pero
      sin seleccionar el resultado general bloquea el envío antes de guardar (FR-009, Edge Cases)
      en `tests/e2e/checklist.spec.ts`
      **Nota de implementación**: hallazgo F2 de `/speckit-analyze` sobre esta feature — T015
      solo prueba el camino positivo (resultado ya elegido), no el rechazo cuando falta.
- [X] T020 [P] [US2] Playwright: el selector de vehículo excluye los dados de baja (FR-003,
      US2/AC7) en `tests/e2e/checklist.spec.ts`
- [X] T021 [P] [US2] Playwright: seleccionar un vehículo cuyo tipo no tiene ningún ítem de
      plantilla configurado bloquea la captura con un mensaje claro dirigiendo a configurarla
      primero (FR-004, US2/AC6, SC-002, Clarifications sesión 2026-08-11) en
      `tests/e2e/checklist.spec.ts`
- [X] T022 [P] [US2] Playwright: si el `insert` de ítems falla tras crear el checklist
      (interceptar la petición REST a `checklist_items` con `page.route()` y forzar el error), el
      formulario ofrece reintentar contra el mismo checklist ya creado, sin duplicarlo
      (research.md R8) en `tests/e2e/checklist.spec.ts`

### Implementation for User Story 2

- [X] T023 [P] [US2] Implementar `app/composables/useChecklists.ts`: `crear(valores,
      itemsRespuesta)`, `reintentarItems(checklistId, itemsRespuesta)` (contracts/checklist.md)
- [X] T024 [P] [US2] Implementar `app/components/checklist/FormularioChecklist.vue`: selector de
      vehículo (`useVehiculos().listar()`, excluye baja), al seleccionar carga la plantilla del
      tipo de vehículo (`useChecklistPlantillas().listar()`) como filas fijas (research.md R6) y
      consulta la asignación activa para precargar conductor (research.md R7, editable vía
      `useConductores().listar()`), cada fila con cumple/no cumple + observaciones (obligatorias
      si no cumple), selector de resultado general (obligatorio, F2); si la plantilla viene
      vacía, muestra el mensaje de bloqueo de FR-004 en vez del formulario
- [X] T025 [US2] Implementar `app/pages/admin/checklist/nuevo.vue`: usa `FormularioChecklist.vue`
      (T024), llama `crear()`; si falla el `insert` de ítems, ofrece "Reintentar ítems"
      (`reintentarItems()`) contra el checklist ya creado (research.md R8); redirige al detalle
      del checklist creado
- [X] T026 [US2] Implementar `app/pages/admin/checklist/[id]/index.vue`: detalle de solo lectura
      (vehículo, tipo de vehículo, conductor, responsable, fecha, resultado, todos los ítems con
      su estado y observaciones) — sin ninguna acción de edición, cancelación ni borrado
      (FR-010, a diferencia de Combustible/Mantenimiento, que sí permiten cancelar)

**Checkpoint**: Captura funcional y probada de forma independiente — US1 y US2 juntas entregan el
flujo básico completo de la feature (MVP).

---

## Phase 5: User Story 3 - Consultar checklists realizados (Priority: P2)

**Goal**: Un administrador u operario con permiso `ver` puede consultar y filtrar el historial de
checklists capturados.

**Independent Test**: Con varios checklists ya capturados (de distintos vehículos, conductores,
fechas y resultados), aplicar cada filtro por separado y confirmar que el listado muestra
exactamente los registros esperados; abrir el detalle de uno y confirmar que muestra todos sus
ítems, el usuario responsable y el conductor.

### Tests for User Story 3

- [X] T027 [P] [US3] Playwright: filtrar por vehículo, rango de fechas, resultado o conductor
      muestra únicamente los checklists que cumplen ese filtro (FR-011, US3/AC1) en
      `tests/e2e/checklist.spec.ts`
- [X] T028 [P] [US3] Playwright: el detalle de un checklist muestra todos sus ítems con su estado
      y observaciones, el usuario responsable, y el conductor (FR-012, US3/AC2) en
      `tests/e2e/checklist.spec.ts`

### Implementation for User Story 3

- [X] T029 [P] [US3] Agregar `listar(filtros?)` a `app/composables/useChecklists.ts`
      (`vehiculoId?`, `fechaDesde?`, `fechaHasta?`, `resultado?`, `conductorId?` —
      contracts/checklist.md)
- [X] T030 [US3] Implementar `app/pages/admin/checklist/index.vue`: tabla propia (no
      `TablaCatalogo.vue` — research.md R9) con fila de filtros (vehículo/rango de
      fechas/resultado/conductor), y paginación cliente 5/10/20 (default 10) con el estilo ya
      establecido en `docs/design-system.md`. También agrega el botón "Plantilla" (navega a
      `/admin/checklist/plantilla`) junto a "Nuevo checklist" en el header, dado que el link del
      menú lateral apunta al listado, no a la plantilla.

**Checkpoint**: Las 3 historias de usuario funcionan de forma independiente — feature completa.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional (constitución §2-§4).

- [X] T031 [P] Playwright, caso positivo Y negativo (RLS, constitución §2 "no basta con probar el
      camino permitido"): un operario sin el permiso `editar` (permiso por defecto) no puede
      crear/editar/eliminar un ítem de plantilla ni siquiera llamando directo al cliente
      Supabase; con `editar` otorgado explícitamente, sí puede (research.md R2) en
      `tests/e2e/rls.spec.ts`
      **Nota**: usa un operario aislado (`admin.auth.admin.createUser()`), no el `operario-e2e`
      compartido.
- [X] T032 [P] Playwright, bypass de UI (constitución §2/§4): llamando directo al cliente
      Supabase autenticado como el propio admin de una empresa (no `service_role`, que bypassea
      RLS y no demostraría nada), intentar `update`/`delete` sobre un `checklist` ya insertado y
      confirmar el rechazo por RLS (`using (false)`, incondicional incluso para un admin con
      acceso completo por rol, FR-010) en `tests/e2e/checklist.spec.ts`
- [X] T033 [P] Playwright, bypass de UI (constitución §2/§4): mismo patrón que T032 para
      `checklist_items` (FR-010) en `tests/e2e/checklist.spec.ts`
- [X] T034 Accesibilidad WCAG 2.1 AA (constitución §4): revisar
      `FormularioItemPlantilla.vue`/`FormularioChecklist.vue` y el listado con teclado real —
      mismo criterio ya aplicado en features anteriores
- [X] T035 Ejecutar `quickstart.md` completo de punta a punta (los 7 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
      **Resultado**: los 7 escenarios quedan cubiertos 1:1 por la suite automatizada
      (`tests/e2e/checklist.spec.ts` T007-T033 + `tests/e2e/rls.spec.ts` T031), sin necesidad de
      un recorrido manual aparte — mismo criterio ya aplicado en 007/008. Regresión completa
      (`npx playwright test --project=admin`, 226 tests): 224 en verde; 2 fallas **no
      relacionadas** con esta feature (`permisos.spec.ts` T056 y `proveedores.spec.ts` T007,
      ninguno de los dos archivos tocado en 009) — `proveedores` T007 pasó en aislamiento (flake
      de contaminación de la empresa compartida, patrón ya conocido); `permisos` T056 falló de
      forma consistente en aislamiento (2/2 corridas), pre-existente al inicio de esta sesión —
      no investigado más a fondo por estar fuera de alcance de esta feature.
- [X] T036 `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo de esta feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea las 3 historias de usuario.
- **User Story 1 (Phase 3)**: depende de Foundational — sin dependencias de otra historia, pero
  es prerrequisito FUNCIONAL de US2 (sin plantilla no hay captura posible, FR-004).
- **User Story 2 (Phase 4)**: depende de Foundational Y de que US1 haya dejado al menos una
  plantilla configurada para poder probarse de punta a punta — se implementa después de US1.
- **User Story 3 (Phase 5)**: depende de Foundational; su "Independent Test" asume que ya existen
  checklists capturados (de US2 o sembrados directo) — se implementa después de US2.
- **Polish (Phase 6)**: depende de que US1, US2 y US3 estén completas.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- El composable (T012/T023/T029) antes que los componentes/páginas que lo consumen.

### Parallel Opportunities

- T006 (regenerar tipos) puede correr en paralelo al resto de Foundational una vez aplicada la
  migración (T005).
- Todos los tests de una misma historia marcados [P] pueden correr en paralelo (casos
  independientes dentro del mismo archivo `checklist.spec.ts`).
- T012-T013 (composable + formulario de US1) pueden implementarse en paralelo entre sí — T014
  depende de ambos.
- T023-T024 (composable + formulario de US2) pueden implementarse en paralelo entre sí — T025/T026
  dependen de ambos.
- T032 y T033 (Polish, bypass de BD) pueden correr en paralelo entre sí y con T031.

---

## Parallel Example: User Story 2

```bash
# Lanzar todos los tests de User Story 2 juntos:
Task: "Playwright: captura completa con plantilla y resultado"
Task: "Playwright: conductor autocompletado desde asignación activa"
Task: "Playwright: vehículo sin asignación activa deja conductor vacío"
Task: "Playwright: ítem no cumple sin observaciones se rechaza"
Task: "Playwright: guardar sin resultado general se rechaza"
Task: "Playwright: selector de vehículo excluye dados de baja"
Task: "Playwright: sin plantilla configurada bloquea la captura"
Task: "Playwright: fallo del insert de ítems ofrece reintentar"
```

---

## Implementation Strategy

### MVP First (US1 + US2, ambas P1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea las 3 historias)
3. Completar Phase 3 (Plantilla) — prerrequisito funcional de la captura
4. **PARAR y VALIDAR**: probar US1 de forma independiente
5. Completar Phase 4 (Realizar checklist) — usa la plantilla ya configurada
6. **PARAR y VALIDAR**: ambas juntas son el MVP completo
7. Completar Phase 5 (Consultar) — usa los checklists ya capturados
8. Completar Phase 6: Polish
9. Deploy/demo

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Plantilla) → probar de forma independiente → prerrequisito listo
3. US2 (Realizar checklist) → probar de forma independiente → MVP completo
4. US3 (Consultar) → probar de forma independiente → feature completa
5. Cada historia agrega valor sin romper las anteriores

---

## Notes

- [P] tareas = archivos distintos o casos independientes, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en el checkpoint para validar cada historia de forma independiente antes de continuar.
