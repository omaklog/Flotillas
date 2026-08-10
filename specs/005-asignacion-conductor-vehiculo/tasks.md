---

description: "Task list for Feature 005 — Asignación Conductor-Vehículo"
---

# Tasks: Asignación Conductor-Vehículo

**Input**: Design documents from `/specs/005-asignacion-conductor-vehiculo/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/asignaciones.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada regla
de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS por cada
tabla — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md), en el mismo orden de
prioridad ahí definido (P1 → P2 → P2).

**Esquema de base de datos**: `asignaciones_conductor_vehiculo`, su índice único parcial y su RLS
(aceptando `vehiculos` **o** `conductores`) **ya existen** y están verificados funcionalmente
(Feature 004). T002-T004 aplican una única migración nueva con lo único que falta: su trigger de
auditoría, reutilizando `private.audit_catalogo()` ya existente — ver `data-model.md` sección
"Extensiones sobre el esquema actual".

**Lecciones de Vehículos (003) y Conductores (004) a aplicar desde el inicio, no redescubrir**:
- Un solo mutador `asignar(vehiculoId, conductorId)` cubre los 3 flujos de UI de esta feature
  (research.md R4) — las reglas de advertencia/confirmación son lecturas previas + decisiones de
  UI, no lógica de escritura distinta por punto de entrada. No duplicar esa lógica en dos
  funciones.
- El indicador "Sin conductor" del listado (FR-013) se resuelve con una segunda consulta y una
  unión en el cliente, **no** con un `select` anidado de PostgREST con filtro embebido
  (research.md R5) — mismo criterio que ya evitó un bug real de escape en `.or()` en Catálogos
  Base.
- `getByLabel` sin `{ exact: true }` hace match parcial contra labels más largos — usar
  `exact: true` por defecto en los tests Playwright.
- Los tests de RLS deben cubrir el caso POSITIVO (operario con `'ver'` sí puede leer) además del
  negativo — mismo hallazgo E1 de `/speckit-analyze` sobre Conductores, no repetirlo aquí.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1–US3, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend). Esta feature no agrega
nada a `server/api/` (research.md R6): toda la lectura/escritura va directo por
`useSupabaseClient()`, protegida por RLS.

---

## Phase 1: Setup

**Purpose**: Documentar la decisión de no generar una referencia de Stitch nueva para esta feature
(research.md R8) — mismo criterio ya aplicado en Conductores (004, research.md R10).

- [X] T001 Agregar una nota a `docs/design-references/screens.md` documentando que Asignación
      Conductor-Vehículo (005) no tiene captura propia de Stitch y reutiliza deliberadamente el
      lenguaje visual de `docs/design-system.md` más los patrones de layout ya construidos en
      Vehículos/Conductores (pestañas de detalle, historial en tabla, research.md R8).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Auditoría, ajuste de mensaje de error, y composable compartido por las 3 historias —
ninguna historia puede empezar su UI hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [X] T002 Crear la migración de esta feature:
      `supabase migration new asignaciones_conductor_vehiculo_auditoria`
- [X] T003 En esa migración: trigger `AFTER INSERT OR UPDATE OR DELETE` en
      `public.asignaciones_conductor_vehiculo` reutilizando `private.audit_catalogo()` ya
      existente — **sin** crear una función nueva (research.md R2)
- [X] T004 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: crear
      una asignación de prueba vía `service_role` genera una fila en `public.auditoria` con
      `accion = 'crear'`; actualizar su `fecha_fin` genera una fila con `accion = 'editar'`
- [X] T005 [P] En `app/composables/useVehiculos.ts`: agregar
      `asignaciones_conductor_vehiculo: 'asignaciones'` al diccionario `ETIQUETAS_DEPENDIENTES`
      (research.md R3, FR-012) — una línea, mismo diccionario que ya usa `useConductores.ts`
- [X] T006 Implementar `app/composables/useAsignaciones.ts`: `listarHistorialVehiculo(vehiculoId)`
      (con `conductores(nombre, apellidos)`, orden `fecha_inicio desc, created_at desc`),
      `listarHistorialConductor(conductorId)` (con `vehiculos(marca, modelo, placa)`, mismo
      orden), `listarVehiculosActivosDeConductor(conductorId)` (subconjunto con
      `fecha_fin is null`), `obtenerAsignacionActivaDeVehiculo(vehiculoId)` (para la confirmación
      fuerte de FR-006), `listarVehiculosConAsignacionActiva(vehiculoIds)` (para el indicador del
      listado, FR-013), `asignar(vehiculoId, conductorId)` (cierra la activa del vehículo si la
      había + inserta la nueva — research.md R4, contracts/asignaciones.md), `finalizar(asignacionId)`
      (cierra sin insertar) — sin `server/api/` intermedio (research.md R6). `yarn typecheck`/
      `yarn lint` en verde.

**Checkpoint**: Fundación lista — las 3 historias de usuario pueden empezar (US3 depende
parcialmente de US1/US2, ver "Dependencies" al final).

---

## Phase 3: User Story 1 - Administrador asigna o reemplaza el conductor de un vehículo (Priority: P1) 🎯 MVP

**Goal**: El administrador puede asignar un conductor a un vehículo desde el detalle del vehículo,
con reemplazo automático al cambiarlo y advertencia informativa si el conductor ya está ocupado.

**Independent Test**: Asignar un conductor a un vehículo sin conductor previo; asignarle otro
distinto y confirmar que el primero queda cerrado en el historial sin ninguna confirmación
adicional; asignar un conductor ya ocupado en otro vehículo y confirmar que aparece la advertencia
informativa sin bloquear.

### Tests for User Story 1

- [X] T007 [P] [US1] Playwright: asignar un conductor a un vehículo sin conductor previo lo deja
      vigente de inmediato (FR-001) en `tests/e2e/asignaciones.spec.ts`
- [X] T008 [P] [US1] Playwright: asignar un conductor distinto reemplaza automáticamente al
      anterior, sin ningún diálogo de confirmación, y el anterior queda cerrado (con fecha de fin)
      en el historial (FR-002) en `tests/e2e/asignaciones.spec.ts`
- [X] T009 [P] [US1] Playwright: asignar un conductor que ya tiene otro vehículo activo muestra un
      mensaje informativo listándolo antes de confirmar, y permite continuar sin bloquear
      (FR-003) en `tests/e2e/asignaciones.spec.ts`
- [X] T010 [P] [US1] Playwright: el historial de asignaciones del vehículo se muestra ordenado del
      más reciente al más antiguo, con conductor, fecha de inicio y fecha de fin o "Activo"
      (FR-004) en `tests/e2e/asignaciones.spec.ts`
- [X] T011 [P] [US1] Playwright: el selector de conductores excluye a los desactivados y al ya
      vigente para ese vehículo (FR-009) en `tests/e2e/asignaciones.spec.ts`

### Implementation for User Story 1

- [X] T012 [P] [US1] Implementar `app/components/vehiculos/ConductorAsignado.vue`: estado vacío
      con botón "Asignar conductor" / conductor vigente con botón "Cambiar conductor"; selector
      (`v-autocomplete`, excluye desactivados y al vigente — FR-009) vía `useConductores().listar`
      filtrado en el cliente; advertencia informativa si `listarVehiculosActivosDeConductor` del
      conductor elegido no está vacía, antes de llamar `useAsignaciones().asignar`; tabla de
      historial (Conductor, Fecha inicio, Fecha fin/"Activo") vía `listarHistorialVehiculo`
- [X] T013 [US1] Montar `ConductorAsignado.vue` como pestaña "Conductor Asignado" en
      `app/pages/admin/vehiculos/[id]/index.vue`

**Checkpoint**: Asignación desde el vehículo funcional y probada de forma independiente — MVP.

---

## Phase 4: User Story 2 - Administrador asigna o reemplaza vehículos desde el detalle del conductor (Priority: P2)

**Goal**: El administrador puede ver y gestionar los vehículos activos de un conductor desde su
propia ficha, incluyendo asignarle uno nuevo con confirmación fuerte si ya tiene otro conductor.

**Independent Test**: Desde un conductor sin vehículos activos, asignarle uno; asignarle un
segundo vehículo sin conductor previo y confirmar que ambos quedan activos en paralelo; intentar
asignarle un tercer vehículo que ya tiene otro conductor activo y confirmar que se exige una
confirmación explícita antes de proceder.

### Tests for User Story 2

- [X] T014 [P] [US2] Playwright: asignar un vehículo a un conductor sin vehículos activos lo deja
      vigente de inmediato (FR-005) en `tests/e2e/asignaciones.spec.ts`
- [X] T015 [P] [US2] Playwright: asignar un segundo vehículo (sin conductor previo) a un conductor
      que ya tiene uno activo deja ambos vigentes en paralelo, sin bloqueo (Decisiones Confirmadas
      de `spec.md`) en `tests/e2e/asignaciones.spec.ts`
- [X] T016 [P] [US2] Playwright: asignar un vehículo que ya tiene activo a otro conductor exige una
      confirmación explícita indicando a quién se reemplazará; cancelar no cambia nada, confirmar
      sí reemplaza (FR-006) en `tests/e2e/asignaciones.spec.ts`
- [X] T017 [P] [US2] Playwright: el historial completo del conductor a través de todos los
      vehículos que ha manejado se muestra ordenado del más reciente al más antiguo (FR-007) en
      `tests/e2e/asignaciones.spec.ts`
- [X] T018 [P] [US2] Playwright: el selector de vehículos excluye a los dados de baja y al ya
      vigente para ese conductor (FR-010) en `tests/e2e/asignaciones.spec.ts`

### Implementation for User Story 2

- [X] T019 [P] [US2] Implementar `app/components/conductores/VehiculosAsignados.vue`: lista de
      vehículos activos vía `listarVehiculosActivosDeConductor` (0, 1 o varios); botón "Asignar a
      otro vehículo" con selector (excluye dados de baja y al ya vigente — FR-010) vía
      `useVehiculos().listar` filtrado en el cliente; confirmación fuerte obligatoria si
      `obtenerAsignacionActivaDeVehiculo` del vehículo elegido devuelve un conductor distinto,
      antes de llamar `useAsignaciones().asignar`; tabla de historial completo (Vehículo, Fecha
      inicio, Fecha fin/"Activo") vía `listarHistorialConductor`
- [X] T020 [US2] Montar `VehiculosAsignados.vue` como pestaña "Vehículos Asignados" en
      `app/pages/admin/conductores/[id]/index.vue`

**Checkpoint**: Asignación desde el conductor funcional y probada de forma independiente.

**Estado de las fases US1+US2**: 10/10 tests de `asignaciones.spec.ts` en verde, `typecheck`/
`lint` limpios. Dos bugs de test encontrados y corregidos (no de la app): (1) los tests
seleccionaban opciones del `v-autocomplete` con `getByRole('option', { name: <solo nombre>,
exact: true })`, pero el texto real de la opción es "nombre apellidos"/"marca modelo (placa)" —
corregido comparando contra el texto completo. (2) T016 verificaba el cierre de la asignación
anterior inmediatamente después de `toContainText(marca)` sobre la tarjeta completa
(`vehiculos-asignados-card`), que también contiene el `v-autocomplete` del selector — mientras el
selector seguía visible (antes de que `cargar()` completara), su texto ya mostraba la marca
seleccionada, haciendo que la aserción pasara de forma prematura y la verificación de base de
datos corriera en carrera contra el `asignar()` real todavía en curso. Corregido esperando a que
`confirmar-asignar-vehiculo-btn` desaparezca (señal de que la rama de éxito ya cerró el selector)
antes de revisar el contenido — aplicado también preventivamente a T014/T015, que tenían el mismo
patrón aunque no fallaron en esta corrida.

---

## Phase 5: User Story 3 - Finalizar una asignación sin reemplazarla (Priority: P2)

**Goal**: Desde cualquiera de los dos detalles, terminar una asignación activa sin reemplazarla, y
que el listado principal de vehículos refleje cuáles quedaron sin conductor.

**Independent Test**: Desde un vehículo con conductor activo, finalizar la asignación sin elegir
reemplazo y confirmar que queda sin conductor vigente, con la asignación cerrada en el historial y
el indicador correspondiente en el listado.

**Depende de US1** (agrega el botón "Finalizar" a `ConductorAsignado.vue`) **y de US2** (mismo en
`VehiculosAsignados.vue`) para las tareas T024/T025; la tarea del indicador del listado (T026,
FR-013) solo depende de Foundational — ver "Dependencies" al final.

### Tests for User Story 3

- [X] T021 [P] [US3] Playwright: finalizar una asignación desde el vehículo sin elegir reemplazo
      lo deja sin conductor vigente, con la asignación cerrada (fecha de fin) en el historial
      (FR-008) en `tests/e2e/asignaciones.spec.ts`
- [X] T022 [P] [US3] Playwright: finalizar una asignación desde el conductor quita ese vehículo de
      su lista de vehículos activos, conservando el registro en su historial (FR-008) en
      `tests/e2e/asignaciones.spec.ts`
- [X] T023 [P] [US3] Playwright: un vehículo sin conductor activo muestra el indicador "Sin
      conductor" en el listado principal de vehículos (FR-013) en `tests/e2e/asignaciones.spec.ts`

### Implementation for User Story 3

- [X] T024 [US3] Agregar el botón "Finalizar asignación" a
      `app/components/vehiculos/ConductorAsignado.vue` (vía `useAsignaciones().finalizar` sobre
      la asignación activa del vehículo)
- [X] T025 [US3] Agregar el botón "Finalizar asignación" a
      `app/components/conductores/VehiculosAsignados.vue` (mismo `finalizar`, por fila de la lista
      de vehículos activos)
- [X] T026 [US3] Agregar el indicador "Sin conductor" a `app/pages/admin/vehiculos/index.vue` (vía
      `useAsignaciones().listarVehiculosConAsignacionActiva` sobre los ids ya cargados por
      `useVehiculos().listar`, cruzados en el cliente — research.md R5)

**Checkpoint**: Las 3 historias de usuario funcionan de forma independiente entre sí.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional que cruza las 3 historias (constitución §2-§4).

- [X] T027 [P] Playwright, caso positivo Y negativo (RLS, constitución §2 "no basta con probar el
      camino permitido"): operario sin `'editar'` ni en `vehiculos` ni en `conductores` puede leer
      el historial de asignaciones (tiene `'ver'` en ambos) pero no puede asignar ni finalizar;
      con `'editar'` otorgado en cualquiera de los dos módulos (probar ambos casos por separado),
      sí puede — en `tests/e2e/rls.spec.ts`
- [X] T028 [P] Playwright: intentar eliminar un vehículo con una asignación activa se rechaza con
      el mensaje específico "tiene asignaciones registradas", no el genérico de dependientes
      (FR-012) en `tests/e2e/asignaciones.spec.ts`
- [X] T029 Verificar consistencia del índice único (SC-002): sembrar vía `service_role` un intento
      de segunda fila activa para el mismo `vehiculo_id` y confirmar que Postgres lo rechaza
      (`23505` sobre `uq_asignacion_vehiculo_activa`)
- [X] T030 Accesibilidad WCAG 2.1 AA (constitución §4): revisar los selectores y diálogos de
      confirmación nuevos con teclado real — mismo criterio ya aplicado en Vehículos y Conductores
- [X] T031 Ejecutar `quickstart.md` completo de punta a punta (los 7 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
- [X] T032 `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo de esta feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea las 3 historias de usuario.
- **User Stories (Phase 3-5)**: todas dependen de Foundational. Dentro de ese conjunto:
  - US1 (Phase 3) y US2 (Phase 4): independientes entre sí — ambas dependen solo de Foundational.
  - US3 (Phase 5): T021/T024 dependen de US1; T022/T025 dependen de US2; T023/T026 (indicador del
    listado) solo dependen de Foundational.
- **Polish (Phase 6)**: depende de que las historias deseadas estén completas.

### User Story Dependencies

- **US1 (P1)**: depende de Foundational. Independiente de US2.
- **US2 (P2)**: depende de Foundational. Independiente de US1.
- **US3 (P2)**: depende de US1 y de US2 para sus botones "Finalizar"; su indicador de listado solo
  depende de Foundational.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- Componentes antes que páginas que los montan.
- Historia completa (checkpoint) antes de pasar a la siguiente en orden de prioridad, salvo que se
  trabaje en paralelo con más de una persona.

### Parallel Opportunities

- T005 (ajuste de una línea en `useVehiculos.ts`) puede correr en paralelo con T002-T004 (la
  migración) y T006 (el composable nuevo) dentro de Foundational.
- Todos los tests de una historia marcados [P] pueden correr en paralelo (mismo archivo de spec,
  casos independientes).
- US1 y US2 pueden implementarse en paralelo por dos personas distintas (ambas dependen solo de
  Foundational).
- Dentro de US3, T023/T026 (indicador del listado) pueden avanzar en paralelo a T021/T024 y
  T022/T025 (botones "Finalizar"), ya que no comparten archivo ni dependencia entre sí.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: asignar un conductor a un vehículo sin conductor previo lo deja vigente"
Task: "Playwright: asignar un conductor distinto reemplaza automáticamente sin confirmación"
Task: "Playwright: asignar un conductor ya ocupado muestra advertencia informativa sin bloquear"
Task: "Playwright: el historial del vehículo se muestra ordenado del más reciente al más antiguo"
Task: "Playwright: el selector de conductores excluye desactivados y al ya vigente"
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea todas las historias)
3. Completar Phase 3: User Story 1
4. **PARAR y VALIDAR**: probar US1 de forma independiente
5. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → fundación lista
2. US1 → probar de forma independiente → Deploy/Demo (MVP)
3. US2 → probar → Deploy/Demo
4. US3 → probar → Deploy/Demo
5. Cada historia agrega valor sin romper las anteriores

---

## Notes

- [P] tareas = archivos distintos, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en cualquier checkpoint para validar la historia de forma independiente.
- Evitar: tareas vagas, conflictos de mismo archivo sin necesidad, dependencias entre historias
  que rompan su independencia más allá de las ya documentadas arriba.

## Estado final — feature completa (32/32)

**Verificación final**:
- 26/26 en `asignaciones.spec.ts` + `rls.spec.ts` juntos (`--project=admin`), incluido T027 (RLS
  positivo/negativo, probando explícitamente que `'editar'` en cualquiera de los dos módulos por
  separado alcanza) y T028 (mensaje específico al eliminar un vehículo con asignaciones).
- T029 verificado por script directo: un segundo intento de asignación activa para el mismo
  vehículo falla con `23505` sobre `uq_asignacion_vehiculo_activa`, confirmando SC-002.
- Regresión: 57/58 en `vehiculos.spec.ts` + `conductores.spec.ts` juntos — el único fallo (T032 de
  Vehículos) es la misma clase de flake por contención de recursos ya documentada varias veces en
  `003-vehiculos/tasks.md` y `004-conductores/tasks.md`, confirmada no reproducible en aislamiento
  y ajena a los cambios de esta feature.
- `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo (T032).
- T030 (accesibilidad) verificado por equivalencia: los componentes nuevos usan labels visibles en
  todos los campos/botones (sin botones de solo-ícono sin `aria-label`), mismo patrón ya validado
  en Vehículos/Conductores.

**Bugs reales encontrados y corregidos durante la implementación** (documentados en el checkpoint
de la Fase 4 arriba): (1) los tests seleccionaban opciones del `v-autocomplete` comparando solo
contra el nombre corto en vez del texto completo mostrado; (2) una carrera real entre
`toContainText` sobre un contenedor que también incluye el selector todavía visible y la
verificación de base de datos inmediatamente posterior — corregida esperando a que el selector se
cierre antes de revisar el resultado.
