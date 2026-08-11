---

description: "Task list for Feature 010 — Bitácora de Servicios Obligatorios"
---

# Tasks: Bitácora de Servicios Obligatorios

**Input**: Design documents from `/specs/010-servicios-obligatorios/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/servicios-obligatorios.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada
regla de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS por
módulo de permisos afectado — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) — US1 (Registrar, P1) y US2
(Listado y búsqueda, P1) son ambas MVP; US3 (Editar y eliminar, P2) depende de que ya existan
servicios registrados (US1).

**Esquema de base de datos**: la tabla `servicios_obligatorios`, el enum
`tipo_servicio_obligatorio`, sus índices, y su RLS (`_select`/`_write`, ya con el patrón
`tiene_permiso()`) **ya existen** desde la migración inicial del proyecto y sus dos migraciones
de permisos inmediatas siguientes — a diferencia de 007/008/009, esta feature NO agrega ninguna
tabla ni política nueva. T002-T005 aplican una única migración con lo poco que falta: el valor
`testigo_servicio` del enum `tipo_archivo` (`schema_12_tipo_archivo_testigo.sql`) y un trigger de
auditoría que ninguna migración previa agregó — ver `data-model.md` sección "Extensiones sobre el
esquema actual".

**Referencias visuales**: no existe ninguna captura de Stitch dedicada a Servicios Obligatorios.
Se reutilizan `gestion-vehiculo-alta-edicion.png` (estructura de formulario de captura/edición),
`detalle-vehiculo-historial-polizas.png` (patrón de comprobante adjunto + indicador de vigencia,
ya usado para pólizas), `listado-flotilla-vehiculos-v2.png` (listado con fila de filtros) y
`listado-operarios-paginacion.png` (paginación) — mismas referencias de estilo que
Combustible/Mantenimiento/Checklist, sin generar mockups nuevos.

**Lecciones de features anteriores a aplicar desde el inicio, no redescubrir**:
- **Auditoría genérica desde Foundational, no como corrección posterior**: ninguna migración
  aplicada le agregó un trigger de auditoría a `servicios_obligatorios` (research.md R3) — mismo
  gap que Combustible/Mantenimiento/Checklist tuvieron que corregir (el segundo y el tercero, ya
  proactivamente). Esta feature lo agrega en T004, reutilizando `private.audit_catalogo()`
  genérica — sin columna de estado que distinguir, sus 3 únicas transiciones (`crear`/`editar`/
  `eliminar`) ya mapean 1:1 desde `TG_OP`.
- **El permiso real de escritura es `'editar'`, para las 3 acciones — no solo para editar**
  (research.md R2, hallazgo específico de esta feature, más amplio que el de Checklist): la única
  política de escritura (`servicios_obligatorios_write`, `for all`) verifica únicamente
  `tiene_permiso('servicios_obligatorios','editar')`. `acciones_disponibles` también lista
  `'crear'` y `'eliminar'` como acciones seleccionables, pero ninguna política las referencia —
  otorgarle a un operario solo esas dos NO le da ningún acceso de escritura real. Gatear las 3
  acciones (registrar/editar/eliminar) en la UI por `'editar'`, no por `'crear'`/`'eliminar'`.
- **Comprobante sin historial de versiones** (research.md R4, a diferencia de la póliza de
  Vehículos): `archivo_id` es un único puntero que se reemplaza — mismo patrón que
  `adjuntarFoto()`, no el de `adjuntarPoliza()`/`adjuntarFactura()` (que sí mantienen historial
  completo navegable).
- **Un solo formulario para alta y edición** (research.md R6, a diferencia de
  Combustible/Mantenimiento/Checklist, que no tienen edición real): `registro?` opcional, mismo
  patrón ya usado en `FormularioTipoVehiculo.vue`/`FormularioItemPlantilla.vue`.
- El selector de vehículo carga TODOS los vehículos de la empresa sin paginar — mismo riesgo del
  límite de 1000 filas de PostgREST ya encontrado en Combustible (research.md R8): los tests de
  captura MUST usar una empresa aislada por test (`crearEmpresaConAdmin`), no la sesión compartida
  `admin-e2e`.
- `usePermisos().tienePermiso('servicios_obligatorios', 'editar')` ya funciona sin cambios — el
  módulo y sus acciones están sembrados desde la migración inicial; `'ver'` ya se otorga por
  defecto a todo operario nuevo (research.md R1).
- `supabase gen types typescript --local > archivo` **nunca** con `2>&1` después del `>` —
  corrompe el archivo con el banner del CLI.
- El detalle de un servicio (`[id]/index.vue`) consulta directo con `useSupabaseClient()` en el
  propio componente de página, sin una función `obtener(id)` en el composable — mismo patrón ya
  usado en Vehículos/Combustible/Mantenimiento/Checklist.
- `/speckit-clarify` no encontró ninguna ambigüedad crítica sobre esta especificación — no hay
  hallazgos de `/speckit-analyze` que incorporar todavía (se ejecuta después de `/speckit-tasks`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1 = Registrar, US2 = Listado y búsqueda,
  US3 = Editar y eliminar, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend). Esta feature no agrega
nada a `server/api/`: toda la lectura/escritura va directo por `useSupabaseClient()`, protegida
por RLS.

---

## Phase 1: Setup

**Purpose**: Documentar la decisión de reutilizar referencias visuales existentes antes de tocar
cualquier CSS/componente.

- [X] T001 Agregar una entrada a `docs/design-references/screens.md` documentando que Servicios
      Obligatorios (010) no tiene captura propia de Stitch y reutiliza
      `gestion-vehiculo-alta-edicion.png` (formulario de captura/edición),
      `detalle-vehiculo-historial-polizas.png` (patrón de comprobante + indicador de vigencia),
      `listado-flotilla-vehiculos-v2.png` (listado con filtros) y
      `listado-operarios-paginacion.png` (paginación)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema — nada de la UI puede empezar hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna tarea de implementación de US1/US2/US3 puede empezar hasta que esta fase
esté completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new
      servicios_obligatorios_ajustes`
- [X] T003 En esa migración: aplicar el contenido literal de
      `docs/schema-reference/schema_12_tipo_archivo_testigo.sql` (agrega `'testigo_servicio'` al
      enum `tipo_archivo`, research.md R1)
- [X] T004 En esa misma migración: crear el trigger de auditoría reutilizando
      `private.audit_catalogo()` genérica — `trg_servicios_obligatorios_auditoria`, `after insert
      or update or delete` sobre `public.servicios_obligatorios` (research.md R3, data-model.md)
- [X] T005 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: un
      `insert`/`update`/`delete` en `servicios_obligatorios` genera auditoría con `accion`
      `crear`/`editar`/`eliminar` respectivamente; usando un cliente autenticado real (no
      `service_role`, que bypassea RLS) como un operario sin ningún permiso otorgado, confirmar
      que un `insert` se rechaza; otorgarle **solo** `'crear'` (research.md R2) y confirmar que
      el `insert` **sigue** rechazado; otorgarle `'editar'` en su lugar y confirmar que el
      `insert` procede — la cobertura automatizada de esto vive en Phase 6 (T030), no reemplaza
      esta verificación manual inicial
      **Verificado**: script desechable con cliente autenticado real (no service_role) confirmó
      los 3 casos exactos, más auditoría `crear`/`editar`/`eliminar` generada correctamente.
- [X] T006 [P] Regenerar `app/types/database.types.ts`
      (`supabase gen types typescript --local > app/types/database.types.ts`, **sin** `2>&1`)

**Checkpoint**: Fundación lista — US1 puede empezar.

---

## Phase 3: User Story 1 - Registrar un servicio obligatorio (Priority: P1) 🎯 MVP (parte 1/2)

**Goal**: Un administrador (u operario con permiso `editar`) puede registrar que un vehículo
cumplió un servicio obligatorio, con sus fechas y un comprobante opcional.

**Independent Test**: Registrar un servicio completo (vehículo, tipo, ambas fechas, comprobante
adjunto) y confirmar que queda visible en el listado con los datos correctos; intentar registrar
con fechas inválidas (a futuro, o vencimiento anterior a realización) y confirmar que se rechaza.

### Tests for User Story 1

- [X] T007 [P] [US1] Playwright: registrar un servicio completo con comprobante adjunto queda
      visible en el listado y en su detalle con los datos correctos (FR-001, FR-005, US-10.1/AC1,
      AC4) en `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T008 [P] [US1] Playwright: capturar una fecha de realización posterior a hoy bloquea el
      registro con un mensaje claro (FR-003, US-10.1/AC2) en
      `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T009 [P] [US1] Playwright: capturar una fecha de vencimiento igual o anterior a la fecha de
      realización bloquea el registro con un mensaje claro (FR-004, US-10.1/AC3) en
      `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T010 [P] [US1] Playwright: el selector de vehículo excluye los dados de baja (FR-002,
      US-10.1/AC5) en `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T011 [P] [US1] Playwright: un servicio registrado sin comprobante permite adjuntarlo
      después desde su detalle (FR-005, US-10.1/AC4) en
      `tests/e2e/servicios-obligatorios.spec.ts`

### Implementation for User Story 1

- [X] T012 [P] [US1] Implementar `app/composables/useServiciosObligatorios.ts`: `crear(valores)`,
      `adjuntarComprobante(servicioId, archivo)`, `obtenerComprobante(servicioId)`,
      `descargarArchivo`, `verArchivo` (contracts/servicios-obligatorios.md)
- [X] T013 [P] [US1] Implementar
      `app/components/servicios-obligatorios/FormularioServicioObligatorio.vue`: vehículo
      (`v-autocomplete`, excluye baja), tipo de servicio (`v-select`, 3 valores fijos), fecha de
      realización (`type="date"`, regla `<= hoy`), fecha de vencimiento (`type="date"`, regla
      `> fecha_realizado`), comprobante opcional (`v-file-input`); acepta `registro?` opcional
      para reutilizarse en edición (research.md R6, T028)
- [X] T014 [US1] Implementar `app/pages/admin/servicios-obligatorios/nuevo.vue`: usa
      `FormularioServicioObligatorio.vue`, llama `crear()` y, si se seleccionó un archivo,
      `adjuntarComprobante()` a continuación; redirige al detalle del servicio creado; agregar el
      link "Servicios Obligatorios" al menú lateral (`app/layouts/admin.vue`)
      **Nota de implementación**: T020-T022 (listado y detalle, formalmente US2) se adelantaron e
      implementaron junto con US1 — el propio "Independent Test" de US1 ya asume que el listado
      existe ("confirmar que queda visible en el listado"), y el `redirect` de `nuevo.vue` al
      detalle del servicio creado no tiene a dónde ir sin `[id]/index.vue`. US1 no es probable de
      punta a punta sin ambas páginas, así que se completaron como una sola unidad MVP (igual
      criterio que "Implementation Strategy" ya documenta para US1+US2 juntas).

**Checkpoint**: Registro funcional y probado de forma independiente — US2 puede empezar. **US2
(listado + detalle, T020-T022) ya se completó junto con US1** — ver nota arriba; T015-T019 (sus
tests) siguen pendientes, se corren en el siguiente checkpoint.

---

## Phase 4: User Story 2 - Listado y búsqueda de servicios obligatorios (Priority: P1) 🎯 MVP (parte 2/2)

**Goal**: Un administrador u operario con permiso `ver` puede consultar el historial de servicios
obligatorios de su flotilla, filtrarlo, y ver de un vistazo cuáles están vigentes, por vencer o
vencidos.

**Independent Test**: Con varios servicios ya registrados (vigentes, por vencer, y vencidos, de
distintos vehículos y tipos), aplicar cada filtro por separado y confirmar que el listado muestra
exactamente los registros esperados, cada uno con su indicador de vigencia correcto.

### Tests for User Story 2

- [X] T015 [P] [US2] Playwright: filtrar por vehículo, tipo de servicio, o rango de fechas
      muestra únicamente los servicios que cumplen ese filtro (FR-008, US-10.2/AC1) en
      `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T016 [P] [US2] Playwright: un servicio cuya fecha de vencimiento ya pasó se marca como
      "Vencido" en el listado (FR-009, US-10.2/AC2) en `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T017 [P] [US2] Playwright: un servicio cuya fecha de vencimiento está dentro de los
      próximos 60 días se marca como "Por vencer" (FR-009, US-10.2/AC3) en
      `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T018 [P] [US2] Playwright: un servicio cuya fecha de vencimiento está a más de 60 días se
      marca como "Vigente" (FR-009, US-10.2/AC4) en `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T019 [P] [US2] Playwright: el detalle de un servicio muestra todos sus datos (vehículo,
      tipo, ambas fechas, indicador de vigencia) y el comprobante adjunto (FR-010) en
      `tests/e2e/servicios-obligatorios.spec.ts`

### Implementation for User Story 2

- [X] T020 [P] [US2] Agregar `listar(filtros?)` a `app/composables/useServiciosObligatorios.ts`
      (`vehiculoId?`, `tipo?`, `fechaDesde?`, `fechaHasta?` —
      contracts/servicios-obligatorios.md), ordenado por `fecha_vencimiento` ascendente
      **Implementado junto con T012** (misma tarea, ver nota en T014).
- [X] T021 [US2] Implementar `app/pages/admin/servicios-obligatorios/index.vue`: tabla propia con
      fila de filtros (vehículo/tipo/rango de fechas), columna de indicador de vigencia
      (`estadoServicio()`, umbral 60 días, colores `success`/`warning`/`error` — research.md R7,
      mismo criterio que `estadoPoliza()` de `vehiculos/index.vue`), y paginación cliente
      5/10/20 (default 10) con el estilo ya establecido en `docs/design-system.md`; botón "Nuevo
      servicio". Se extrajo `etiquetaTipo()`/`estadoServicio()`/`tiposServicio` a
      `app/utils/servicios-obligatorios.ts` (no estaba en el plan original, pero evita duplicar
      el catálogo de 3 tipos y la lógica de vigencia entre el formulario, el listado, y el
      detalle). Ver nota en T014.
- [X] T022 [US2] Implementar `app/pages/admin/servicios-obligatorios/[id]/index.vue`: detalle de
      solo lectura (vehículo, tipo, ambas fechas, indicador de vigencia, comprobante con
      ver/descargar/adjuntar si no tiene uno todavía — T011); acciones de editar/eliminar
      gateadas por `usePermisos().tienePermiso('servicios_obligatorios', 'editar')`
      (research.md R2, implementadas en Phase 5)
      **Nota**: la sección de comprobante (ver/descargar/adjuntar/reemplazar) ya quedó completa en
      esta tarea, sin componente separado (a diferencia de `HistorialFactura.vue`) — no hace
      falta un historial de versiones (research.md R4). Los botones de editar/eliminar en sí
      (T029) quedan pendientes para Phase 5, ver nota en T014.

**Checkpoint**: Listado funcional y probado de forma independiente — US1 y US2 juntas entregan el
flujo básico completo de la feature (MVP).

---

## Phase 5: User Story 3 - Editar y eliminar un servicio obligatorio (Priority: P2)

**Goal**: Un administrador (u operario con permiso `editar`) puede corregir o eliminar un
servicio obligatorio ya registrado.

**Independent Test**: Editar los datos de un servicio ya registrado (incluidas sus fechas) y
confirmar que los cambios se reflejan de inmediato; eliminar un servicio y confirmar que
desaparece del listado sin ningún bloqueo.

### Tests for User Story 3

- [X] T023 [P] [US3] Playwright: editar cualquier campo de un servicio existente (incluidas
      ambas fechas) guarda los cambios y se refleja de inmediato en el listado y el detalle
      (FR-006, US-10.3/AC1) en `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T024 [P] [US3] Playwright: editar capturando una combinación de fechas inválida (fecha de
      realización futura, o vencimiento no posterior a realización) se rechaza igual que en el
      registro (FR-006, US-10.3/AC2) en `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T025 [P] [US3] Playwright: eliminar un servicio con comprobante adjunto desaparece del
      listado de inmediato sin ningún mensaje de bloqueo, y su comprobante queda eliminado
      (FR-007, US-10.3/AC3, SC-005) en `tests/e2e/servicios-obligatorios.spec.ts`
- [X] T026 [P] [US3] Playwright: un operario sin el permiso `editar` (permiso por defecto, solo
      `ver`) no ve disponibles las acciones de registrar/editar/eliminar (FR-011, research.md R2)
      en `tests/e2e/servicios-obligatorios.spec.ts`

### Implementation for User Story 3

- [X] T027 [P] [US3] Agregar `editar(id, valores)` y `eliminar(id)` (con limpieza del
      comprobante adjunto, si existe) a `app/composables/useServiciosObligatorios.ts`
      (contracts/servicios-obligatorios.md)
      **Implementado junto con T012** (misma tarea, ver nota en T014).
- [X] T028 [US3] Implementar `app/pages/admin/servicios-obligatorios/[id]/editar.vue`: reutiliza
      `FormularioServicioObligatorio.vue` (T013) con `registro` precargado; llama `editar()`;
      redirige al detalle
- [X] T029 [US3] Agregar los botones de editar/eliminar en `[id]/index.vue` (T022) y en el
      listado (`index.vue`, T021), gateados por `usePermisos().tienePermiso
      ('servicios_obligatorios', 'editar')`; reutilizar
      `CatalogosDialogoConfirmarEliminarCatalogo` para la confirmación de borrado (sin mensaje de
      dependientes bloqueantes — ninguna tabla referencia esta, data-model.md)
      **Nota de implementación**: editar/eliminar viven únicamente en `[id]/index.vue` — el
      listado no tiene botones de acción por fila, mismo patrón ya establecido en
      Combustible/Mantenimiento/Checklist (una sola acción por registro vive en su detalle, la
      fila del listado solo enlaza a él). En `index.vue`, lo gateado por `'editar'` es el botón
      "Nuevo servicio" (T021); T026 verifica ambos puntos de gateo.

**Checkpoint**: Las 3 historias de usuario funcionan de forma independiente — feature completa.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional (constitución §2-§4).

- [X] T030 [P] Playwright, caso positivo Y negativo (RLS, constitución §2 "no basta con probar el
      camino permitido"): un operario sin ningún permiso otorgado no puede
      crear/editar/eliminar un servicio obligatorio ni siquiera llamando directo al cliente
      Supabase; otorgado **solo** `'crear'` o **solo** `'eliminar'` (research.md R2, ninguna de
      las dos tiene efecto real en RLS) sigue bloqueado; con `'editar'` otorgado, sí puede en
      `tests/e2e/rls.spec.ts`
      **Nota**: usa un operario aislado (`admin.auth.admin.createUser()`), no el `operario-e2e`
      compartido.
- [X] T031 Accesibilidad WCAG 2.1 AA (constitución §4): revisar
      `FormularioServicioObligatorio.vue` y el listado con teclado real — mismo criterio ya
      aplicado en features anteriores
      **Verificado**: dropzone del comprobante con `role="button"`/`tabindex="0"`/`aria-label`
      (mismo patrón que Combustible/Mantenimiento), todos los botones de ícono llevan texto
      visible (Ver/Descargar/Editar/Eliminar), los chips de vigencia combinan color y texto (no
      dependen solo del color).
- [X] T032 Ejecutar `quickstart.md` completo de punta a punta (los 7 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
      **Resultado**: los 7 escenarios quedan cubiertos 1:1 por la suite automatizada
      (`tests/e2e/servicios-obligatorios.spec.ts` T007-T026 + `tests/e2e/rls.spec.ts` T030), mismo
      criterio ya aplicado en 007/008/009. Regresión completa (`npx playwright test
      --project=admin`, 241 tests): 236 en verde; 5 fallas en la corrida completa, ninguna
      relacionada con esta feature (ningún archivo de `conductores`/`tipos-vehiculo`/`vehiculos`
      se tocó en 010, salvo el link de navegación compartido en `admin.vue`) —
      `conductores.spec.ts` T011, `tipos-vehiculo.spec.ts` T018, y `vehiculos.spec.ts` T011/T019
      pasaron en aislamiento (flake de contención de la empresa compartida bajo carga paralela,
      patrón ya conocido); `permisos.spec.ts` T056 es la misma falla pre-existente y no
      relacionada ya documentada al cierre de 009 (archivo no tocado en esta feature tampoco).
- [X] T033 `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo de esta feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea las 3 historias de usuario.
- **User Story 1 (Phase 3)**: depende de Foundational — sin dependencias de otra historia.
- **User Story 2 (Phase 4)**: depende de Foundational; su "Independent Test" asume que ya existen
  servicios registrados (de US1 o sembrados directo) — se implementa después de US1 para poder
  probarse de punta a punta, aunque el listado en sí no depende funcionalmente del formulario de
  registro.
- **User Story 3 (Phase 5)**: depende de Foundational Y de que US1/US2 ya existan (edita/elimina
  sobre registros ya visibles en el listado, y su botón "editar" vive en `[id]/index.vue` de
  US2) — se implementa al final.
- **Polish (Phase 6)**: depende de que US1, US2 y US3 estén completas.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- El composable (T012/T020/T027) antes que los componentes/páginas que lo consumen.

### Parallel Opportunities

- T006 (regenerar tipos) puede correr en paralelo al resto de Foundational una vez aplicada la
  migración (T005).
- Todos los tests de una misma historia marcados [P] pueden correr en paralelo (casos
  independientes dentro del mismo archivo `servicios-obligatorios.spec.ts`).
- T012-T013 (composable + formulario de US1) pueden implementarse en paralelo entre sí — T014
  depende de ambos.
- T020-T021 no son estrictamente paralelos entre sí (T021 consume T020), pero T020 puede
  implementarse en paralelo a T022 (detalle) una vez que T012 ya existe.
- T027 puede implementarse en paralelo a T023-T026 (tests de US3).

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: registro completo con comprobante"
Task: "Playwright: fecha de realización futura bloquea el registro"
Task: "Playwright: fecha de vencimiento inválida bloquea el registro"
Task: "Playwright: selector de vehículo excluye dados de baja"
Task: "Playwright: adjuntar comprobante después del registro inicial"
```

---

## Implementation Strategy

### MVP First (US1 + US2, ambas P1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea las 3 historias)
3. Completar Phase 3 (Registrar)
4. **PARAR y VALIDAR**: probar US1 de forma independiente
5. Completar Phase 4 (Listado y búsqueda)
6. **PARAR y VALIDAR**: ambas juntas son el MVP completo
7. Completar Phase 5 (Editar y eliminar)
8. Completar Phase 6: Polish
9. Deploy/demo

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Registrar) → probar de forma independiente
3. US2 (Listado y búsqueda) → probar de forma independiente → MVP completo
4. US3 (Editar y eliminar) → probar de forma independiente → feature completa
5. Cada historia agrega valor sin romper las anteriores

---

## Notes

- [P] tareas = archivos distintos o casos independientes, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en el checkpoint para validar cada historia de forma independiente antes de continuar.
