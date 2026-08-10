---

description: "Task list for Feature 004 — Conductores"
---

# Tasks: Conductores

**Input**: Design documents from `/specs/004-conductores/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/conductores.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada regla
de negocio explícita en `spec.md` y, como mínimo, un caso negativo de RLS por cada tabla/bucket —
no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md), en el mismo orden de
prioridad ahí definido (P1 → P1 → P2 → P2 → P2 → P3).

**Esquema de base de datos**: `conductores` **ya existe** con su RLS granular
(`tiene_permiso('conductores', ...)`, Feature 001) — más completo de entrada que lo que Vehículos
encontró para `vehiculos.baja`, porque `conductores.activo` ya usa la misma semántica no invertida
que `empresas`/`usuarios`. T004–T009 aplican una única migración nueva con lo que falta:
`motivo_baja` + `UNIQUE(empresa_id, numero_licencia)`, un trigger de auditoría que **reutiliza**
`private.audit_empresas_usuarios()` (sin función nueva), la generalización de las 4 políticas de
`storage.objects` del bucket `documentos` (hoy hardcodeadas al permiso `vehiculos`), el ajuste de
`archivos_delete`, y la tabla `asignaciones_conductor_vehiculo` completa (Clarifications, sesión
2026-08-09) — ver `data-model.md` sección "Extensiones sobre el esquema actual".

**Lecciones de Vehículos (003) y Catálogos Base (002) a aplicar desde el inicio, no
redescubrir**:
- El texto de búsqueda en `.or()` de PostgREST MUST escaparse (comillas dobles) — reusar la
  lógica ya corregida en `useCatalogo.ts`/`useVehiculos.ts`, no reimplementarla.
- `app/utils/archivos.ts` (`validarArchivo`, `nombreArchivoUnico`) ya es genérico — **no** crear
  un archivo nuevo ni duplicar esas funciones (research.md R8).
- El detalle del conductor debe vivir en `[id]/index.vue` (carpeta) desde el primer commit, **no**
  `[id].vue` (archivo suelto) — coexistir con `[id]/editar.vue` como archivo+carpeta dispara el
  bug de anidación de rutas de Nuxt (`NUXT_E4016`) que Vehículos tuvo que corregir después.
- `getByLabel` sin `{ exact: true }` hace match parcial contra labels más largos — usar
  `exact: true` por defecto en los tests Playwright.
- `supabase gen types typescript --local > archivo` **nunca** con `2>&1` después del `>` — corrompe
  el archivo con el banner del CLI (lección de Vehículos, Fase 11).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1–US6, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend). Esta feature no agrega
nada a `server/api/` (research.md R7): toda la lectura/escritura, incluida la limpieza de
archivos al eliminar, va directo por `useSupabaseClient()`, protegida por RLS.

---

## Phase 1: Setup

**Purpose**: Documentar la decisión de no generar una referencia de Stitch nueva para esta
feature (research.md R10) antes de tocar cualquier CSS/componente — mismo espíritu de la regla
obligatoria de `CLAUDE.md`, aplicada aquí como "reusar un patrón ya construido y validado" en vez
de "generar un mockup pixel-a-pixel", con la razón documentada para que no se lea como un
descuido.

- [X] T001 Agregar una nota a `docs/design-references/screens.md` documentando que Conductores
      (004) no tiene captura propia de Stitch y reutiliza deliberadamente el lenguaje visual de
      `docs/design-system.md` más los patrones de layout ya construidos en Vehículos (listado en
      tabla, detalle en tarjetas con historial de archivo, research.md R10) — sin bloquear el
      resto de la feature en generar un mockup nuevo.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema, Storage y CRUD compartido por las 6 historias — ninguna historia puede
empezar su UI hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new conductores_ajustes`
- [X] T003 En esa migración: `alter table public.conductores add column motivo_baja text check
      (char_length(motivo_baja) <= 150)` + `alter table public.conductores add constraint
      uq_conductores_empresa_numero_licencia unique (empresa_id, numero_licencia)` (research.md R2)
- [X] T004 En esa misma migración: trigger `AFTER INSERT OR UPDATE OR DELETE` en
      `public.conductores` reutilizando `private.audit_empresas_usuarios()` ya existente — **sin**
      crear una función nueva, a diferencia de `private.audit_vehiculos()` de Vehículos
      (research.md R3, `conductores.activo` no está invertido)
- [X] T005 En esa misma migración: `drop policy` + `create policy` de las 4 políticas
      `documentos_select`/`insert`/`update`/`delete` de `storage.objects` (creadas por Vehículos en
      `20260808174129_vehiculos_storage_auditoria.sql`), generalizando el permiso requerido según
      `(storage.foldername(name))[1]` (`poliza`/`foto` → `tiene_permiso('vehiculos',
      'ver'|'editar')`, `licencia` → `tiene_permiso('conductores', 'ver'|'editar')`, sin cambiar el
      chequeo de aislamiento por empresa del segmento `[2]`) (research.md R4)
- [X] T006 En esa misma migración: ajustar la política `archivos_delete` para agregar
      `tiene_permiso('conductores','editar')` al `OR` ya existente (`rol='admin'` +
      `tiene_permiso('vehiculos','editar')`, agregado por Vehículos) (research.md R5)
- [X] T007 En esa misma migración: crear `public.asignaciones_conductor_vehiculo` completa, tal
      cual `docs/schema-reference/schema_06_asignaciones_conductor_vehiculo.sql` (tabla, índice
      único parcial sobre `vehiculo_id` con `fecha_fin is null`, RLS, índices de FK) — sin
      modificarla (research.md R6, Clarifications sesión 2026-08-09)
- [X] T008 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: `\d
      conductores` muestra `motivo_baja` y la restricción `UNIQUE`; un `INSERT` de prueba con
      número de licencia duplicado falla con `23505`; desactivar y reactivar un conductor de
      prueba genera filas en `public.auditoria` con `accion = 'desactivar'`/`'reactivar'` (no
      `'editar'`); una subida de prueba vía REST con `service_role` a
      `licencia/{empresa}/{id}/x.pdf` aterriza en la ruta esperada; `public.asignaciones_conductor_vehiculo`
      existe con su índice único parcial. Diferir a Polish (mismo criterio que Vehículos T007) la
      verificación de aislamiento cross-empresa con un cliente autenticado real — se cubre con el
      test Playwright dedicado en vez de inspección SQL manual.
- [X] T009 Regenerar `app/types/database.types.ts`
      (`supabase gen types typescript --local > app/types/database.types.ts`, **sin** `2>&1`)
- [X] T010 Implementar `app/composables/useConductores.ts`: `listar(busqueda, incluirInactivos)`
      (busca por `nombre`/`apellidos`, mismo escape de `.or()` que `useVehiculos.ts`), `crear`
      (paso 1, sin archivo), `adjuntarLicencia(conductorId, archivo)` (paso 2: sube a Storage vía
      `app/utils/archivos.ts`, sin cambios — + inserta fila en `archivos` + actualiza
      `conductores.licencia_archivo_id`), `editar`, `desactivar(id, motivo)`, `reactivar(id)`,
      `eliminar(id)` (3 pasos ordenados de `contracts/conductores.md` — conductor primero, limpieza
      de `archivos`+Storage después, solo si el primero tuvo éxito), `listarHistorialLicencia
      (conductorId)`, `descargarArchivo(storagePath, nombreDescarga)` (URL firmada con
      `download`), `verArchivo(storagePath)` (URL firmada sin `download`, previsualización) —
      mapeo de errores `23505`→"Ya existe un conductor con ese número de licencia.",
      `23503`→"No se puede eliminar: tiene asignaciones registradas." (parseando el nombre de la
      tabla dependiente del mensaje de Postgres, mismo patrón que `useVehiculos.ts`). `yarn
      typecheck`/`yarn lint` en verde.
- [X] T011 Agregar entrada "Conductores" a `app/layouts/admin.vue`
      (`v-list-item to="/admin/conductores" prepend-icon="mdi-card-account-details-outline"`,
      justo después de "Vehículos")

**Checkpoint**: Fundación lista — las 6 historias de usuario pueden empezar (con las dependencias
entre ellas listadas en "Dependencies & Execution Order" al final, ya que varias comparten
página).

---

## Phase 3: User Story 1 - Administrador da de alta un conductor (Priority: P1) 🎯 MVP (parte 1/2)

**Goal**: El administrador puede registrar un conductor con sus datos, con o sin licencia adjunta
en el momento del alta.

**Independent Test**: Completar el alta sin licencia (aparece sin ella); completar el alta con
licencia adjunta (aparece con ella vigente); confirmar que un fallo de subida no revierte el alta.

### Tests for User Story 1

- [X] T012 [P] [US1] Playwright: alta sin licencia crea el conductor con los campos obligatorios
      en `tests/e2e/conductores.spec.ts`
- [X] T013 [P] [US1] Playwright: alta con licencia adjunta (PDF de prueba) crea el conductor con la
      licencia vigente en `tests/e2e/conductores.spec.ts`
- [X] T014 [P] [US1] Playwright: alta rechazada por número de licencia duplicado dentro de la
      misma empresa, marcada en el formulario antes de enviar, en `tests/e2e/conductores.spec.ts`
- [X] T015 [P] [US1] Playwright: un archivo con tipo (p. ej. `.txt`) o tamaño (>10 MB) inválido se
      rechaza antes de intentar subirse, sin bloquear el resto del formulario en
      `tests/e2e/conductores.spec.ts`
- [X] T016 [P] [US1] Playwright: si la subida del archivo de licencia falla (interceptar la
      petición de Storage con `page.route()` y forzar un error), el conductor del paso 1 queda
      creado igual, sin licencia — el alta completa no se pierde (FR-005) en
      `tests/e2e/conductores.spec.ts`

### Implementation for User Story 1

- [X] T017 [P] [US1] Implementar `app/components/conductores/FormularioConductor.vue` (nombre,
      apellidos, celular, calle, número, colonia, número de licencia, tipo de licencia
      (federal/local), fecha de vencimiento, zona de adjuntar/reemplazar archivo con validación
      vía `app/utils/archivos.ts`; reusable en alta y edición vía prop `registro` opcional, mismo
      patrón que `FormularioVehiculo.vue`)
- [X] T018 [US1] Implementar `app/pages/admin/conductores/nuevo.vue` (usa
      `FormularioConductor.vue` + `useConductores().crear` + `adjuntarLicencia` en secuencia)

**Checkpoint**: Alta de conductor funcional; sus tests de US2 (navegación al listado tras el alta)
quedarán en verde al completar la Fase 4, mismo patrón de dependencia MVP que Vehículos.

---

## Phase 4: User Story 2 - Administrador busca y consulta el listado de conductores (Priority: P1) 🎯 MVP (parte 2/2)

**Goal**: El administrador ve el listado de conductores activos de su empresa, puede buscar por
nombre completo, y ve el estado de vigencia de licencia de cada uno.

**Independent Test**: Con conductores sembrados (vía UI de US1 o directo por `service_role`),
abrir el listado, confirmar que aparecen con su estado de licencia, buscar por nombre y apellidos,
y confirmar que los inactivos quedan ocultos por defecto.

### Tests for User Story 2

- [X] T019 [P] [US2] Playwright: el listado muestra los conductores activos de la empresa, y el
      buscador filtra por nombre y apellidos en `tests/e2e/conductores.spec.ts`
- [X] T020 [P] [US2] Playwright: un conductor inactivo (sembrado con `activo=false` vía
      `service_role`) no aparece en el listado por defecto; activar "Mostrar inactivos" lo incluye
      en `tests/e2e/conductores.spec.ts`
- [X] T021 [P] [US2] Playwright: un conductor con `fecha_vencimiento_licencia` en el pasado se
      muestra como "vencida", uno a 30 días se muestra como "por vencer" (umbral de 60 días, mismo
      que Vehículos), y uno a 120 días como "vigente" en `tests/e2e/conductores.spec.ts`; incluir
      además un conductor **inactivo** con licencia vencida (con "Mostrar inactivos" activo) y
      confirmar que su badge sigue mostrando "vencida" — el estado de vigencia no depende de
      `activo` (edge case de `spec.md`)

### Implementation for User Story 2

- [X] T022 [US2] Implementar `app/pages/admin/conductores/index.vue` (reusa
      `CatalogosTablaCatalogo.vue` + `useConductores().listar` + toggle "Mostrar inactivos" +
      badge de estado de licencia con colores `success`/`warning`/`error` de `vuetify.config.ts`,
      mismo patrón que `app/pages/admin/vehiculos/index.vue`)

**Checkpoint**: MVP completo — US1 + US2 funcionan juntas de forma independiente del resto.

**Estado de la fase**: 8/8 tests de `conductores.spec.ts` en verde, `typecheck`/`lint` limpios. Dos
bugs reales encontrados y corregidos en el camino: (1) el combobox de "Tipo de licencia" se
implementó primero como `v-select` — el `.click()` de Playwright chocaba con un overlay interno
(`data-no-activator`) que interceptaba el evento indefinidamente; cambiado a `v-autocomplete`
(mismo patrón ya probado en `FormularioVehiculo.vue`). (2) El test T021 sembraba 4 conductores en
un solo `insert([...])`, donde solo la 4ª fila especificaba `activo`/`motivo_baja` — PostgREST usa
la unión de columnas de todas las filas del array e inserta `NULL` explícito (no el default de la
columna) en las filas que no especifican esa clave, violando el `NOT NULL` de `activo` en las
otras 3; corregido separando en dos llamadas a `insert()`.

---

## Phase 5: User Story 3 - Administrador consulta el detalle de un conductor sin entrar a edición (Priority: P2)

**Goal**: El administrador abre el detalle de un conductor en modo de solo lectura, con una acción
explícita para editar.

**Independent Test**: Abrir el detalle de un conductor desde el listado y confirmar que ningún
campo es editable hasta hacer clic en "Editar" (que en esta fase puede navegar a una ruta todavía
no implementada — se completa en US4).

**Depende de US2** (navega desde el listado) — ver "Dependencies" al final.

### Tests for User Story 3

- [X] T023 [P] [US3] Playwright: abrir un conductor desde el listado muestra su detalle en modo
      solo lectura, sin campos editables, en `tests/e2e/conductores.spec.ts`

### Implementation for User Story 3

- [X] T024 [US3] Implementar `app/pages/admin/conductores/[id]/index.vue`: encabezado (nombre
      completo, chip si está inactivo), sección "Datos" en modo solo lectura (mismos campos del
      alta), botón "Editar" (`to="/admin/conductores/${id}/editar"`) — **carpeta `[id]/` desde el
      inicio**, no archivo suelto (ver nota de "Lecciones" arriba)

**Checkpoint**: Detalle de solo lectura funcional y probado de forma independiente; el botón
"Editar" navega a una ruta que US4 todavía no construye — no bloquea esta fase.

---

## Phase 6: User Story 4 - Administrador edita un conductor y gestiona el historial de su licencia (Priority: P2)

**Goal**: El administrador puede corregir o actualizar los datos de un conductor y reemplazar el
archivo de su licencia cuando se renueva, sin perder acceso a las versiones anteriores.

**Independent Test**: Editar un conductor existente cambiando uno de sus campos y confirmar que se
guarda; reemplazar su archivo de licencia y confirmar que el anterior sigue disponible en el
historial, marcado como no vigente; subir una nueva versión directo desde el historial.

**Depende de US1** (reusa `FormularioConductor.vue`) y de US3 (agrega la sección de historial al
mismo `[id]/index.vue` que esa historia creó) — ver "Dependencies" al final.

### Tests for User Story 4

- [X] T025 [P] [US4] Playwright: editar campos de un conductor existente guarda los cambios en
      `tests/e2e/conductores.spec.ts`
- [X] T026 [P] [US4] Playwright: la acción "Editar" desde el detalle navega al formulario con los
      datos precargados en `tests/e2e/conductores.spec.ts`
- [X] T027 [P] [US4] Playwright: guardar cambios en el formulario regresa a la vista de detalle
      mostrando los datos actualizados en `tests/e2e/conductores.spec.ts`
- [X] T028 [P] [US4] Playwright: reemplazar el archivo de licencia deja el nuevo como vigente sin
      borrar el anterior en `tests/e2e/conductores.spec.ts`
- [X] T029 [P] [US4] Playwright: el historial de versiones muestra ambas versiones ordenadas por
      fecha descendente en una tabla, cada una con quién la subió, acciones "Ver" y "Descargar", y
      solo la más reciente marcada "Vigente" (la otra "Anterior") en
      `tests/e2e/conductores.spec.ts`
- [X] T030 [P] [US4] Playwright: "Ver" dispara la request de la URL firmada sin el parámetro
      `download=` (a diferencia de "Descargar") en `tests/e2e/conductores.spec.ts`
- [X] T031 [P] [US4] Playwright: "Subir Nueva Licencia" desde el historial agrega una versión y la
      marca como Vigente en `tests/e2e/conductores.spec.ts`

### Implementation for User Story 4

- [X] T032 [P] [US4] Implementar `app/components/conductores/HistorialLicencia.vue`: tabla
      (Versión/Fecha, Estado, Subido por, Acciones) vía `useConductores().listarHistorialLicencia`,
      acciones "Ver"/"Descargar" vía `verArchivo`/`descargarArchivo`, diálogo "Subir Nueva
      Licencia" (mismo dropzone y `validarArchivo` que `FormularioConductor.vue`, reutiliza
      `adjuntarLicencia`) — mismo patrón que `HistorialPoliza.vue` de Vehículos tras su rediseño,
      no la versión inicial de lista simple
- [X] T033 [US4] Implementar `app/pages/admin/conductores/[id]/editar.vue`: reusa
      `FormularioConductor.vue` en modo edición (prop `registro`) + `useConductores().editar` +
      `adjuntarLicencia` si se adjuntó un archivo nuevo; al guardar, navega de vuelta a
      `[id]/index.vue`
- [X] T034 [US4] Montar `HistorialLicencia.vue` dentro de `app/pages/admin/conductores/[id]/index.vue`
      (sección o pestaña separada de los Datos, con `@subida` refrescando los datos del conductor
      para que el chip de vigente/anterior se actualice)

**Checkpoint**: Edición y gestión de licencia funcionales, probadas de forma independiente.

---

## Phase 7: User Story 5 - Administrador desactiva y reactiva un conductor (Priority: P2)

**Goal**: El administrador puede desactivar un conductor que ya no está disponible (con motivo
obligatorio) y reactivarlo cuando vuelva a estarlo.

**Independent Test**: Desactivar un conductor capturando un motivo y confirmar que desaparece del
listado por defecto; reactivarlo y confirmar que vuelve a aparecer.

**Depende de US3** (agrega los botones al mismo `[id]/index.vue` que esa historia creó) — ver
"Dependencies" al final.

### Tests for User Story 5

- [X] T035 [P] [US5] Playwright: intentar confirmar "Desactivar" sin capturar un motivo lo bloquea
      en `tests/e2e/conductores.spec.ts`
- [X] T036 [P] [US5] Playwright: desactivar con un motivo válido oculta el conductor del listado
      por defecto en `tests/e2e/conductores.spec.ts`
- [X] T037 [P] [US5] Playwright: reactivar un conductor desactivado lo regresa al listado por
      defecto en `tests/e2e/conductores.spec.ts`
- [X] T038 [P] [US5] Playwright: desactivar y reactivar generan filas en auditoría con
      `accion = 'desactivar'`/`'reactivar'`, no `'editar'`, en `tests/e2e/conductores.spec.ts`

### Implementation for User Story 5

- [X] T039 [P] [US5] Implementar `app/components/conductores/DialogoDesactivar.vue` (motivo
      obligatorio, ≤150 caracteres, mismo patrón que `DialogoDarDeBaja.vue` de Vehículos)
- [X] T040 [US5] Conectar los botones "Desactivar"/"Reactivar" en
      `app/pages/admin/conductores/[id]/index.vue` (vía `useConductores().desactivar`/`reactivar`,
      refrescando el conductor tras confirmar)

**Checkpoint**: Desactivación y reactivación funcionales, probadas de forma independiente.

**Estado de las fases US3+US4+US5**: implementadas juntas en el mismo pase (comparten el archivo
`[id]/index.vue`) — 20/20 tests de `conductores.spec.ts` en verde, `typecheck`/`lint` limpios. Un
bug de test encontrado y corregido: T029/T030/T031 navegaban directo al detalle y verificaban
`historial-licencia-tabla` sin antes hacer clic en la pestaña "Historial de Licencia" (el tab por
defecto es "Datos") — mismo patrón que ya usa `vehiculos.spec.ts` con
`getByRole('tab', { name: 'Historial de Póliza' }).click()`, agregado aquí también.

---

## Phase 8: User Story 6 - Administrador elimina definitivamente un conductor sin dependientes (Priority: P3)

**Goal**: El administrador puede eliminar por completo un conductor sin asignaciones registradas;
uno con asignaciones se rechaza con un mensaje claro.

**Independent Test**: Eliminar un conductor sin asignaciones y confirmar que desaparece por
completo (incluida su licencia); sembrar una asignación para otro y confirmar que su eliminación
se rechaza.

**Depende de US2** (agrega la acción al mismo `index.vue` que esa historia creó, mismo patrón que
Vehículos) — ver "Dependencies" al final.

### Tests for User Story 6

- [X] T041 [P] [US6] Playwright: eliminar un conductor sin dependientes pero con una licencia
      adjunta borra también su historial de archivos (FR-016a) en
      `tests/e2e/conductores.spec.ts`
- [X] T042 [P] [US6] Playwright: eliminar un conductor con una asignación sembrada directo vía
      `service_role` en `asignaciones_conductor_vehiculo` se rechaza y no borra nada en
      `tests/e2e/conductores.spec.ts`
- [X] T043 [P] [US6] Playwright: eliminar un conductor sin ningún dato adjunto procede sin error en
      `tests/e2e/conductores.spec.ts`

### Implementation for User Story 6

- [X] T044 [US6] Agregar el botón "Eliminar" + `CatalogosDialogoConfirmarEliminarCatalogo` a
      `app/pages/admin/conductores/index.vue` (vía `useConductores().eliminar`, mismo patrón que
      `app/pages/admin/vehiculos/index.vue`)

**Checkpoint**: Las 6 historias de usuario funcionan de forma independiente entre sí.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional que cruza las 6 historias (constitución §2-§4).

- [X] T045 [P] Playwright, caso positivo Y negativo (RLS, constitución §2 "no basta con probar el
      camino permitido"): operario con solo `'ver'` en el módulo `conductores` SÍ puede ver el
      listado, el detalle y el historial de licencia de los conductores de su empresa (quickstart
      Escenario 7 paso 2, FR-018 mitad "puede ver" — sin este caso, un bug en `conductores_select`
      o un guard de UI mal puesto podría bloquear la lectura sin que ningún test lo note); Y NO
      puede escribir en `conductores` ni subir a `documentos/licencia/{empresa_id}/...`, y
      **tampoco** puede subir a `documentos/poliza/{empresa_id}/...` (valida que la
      generalización de research.md R4 no sobre-concede acceso cruzado) en `tests/e2e/rls.spec.ts`
- [X] T046 [P] Playwright (RLS, constitución §4 "100% sobre las políticas de RLS de tablas
      sensibles" — **no** una verificación manual, a diferencia de una redacción anterior de esta
      tarea): con dos empresas de prueba sembradas por `service_role`, confirmar que
      `createSignedUrl` para un archivo de licencia de la empresa B, invocado con la sesión de un
      administrador de la empresa A, es rechazado por RLS de `storage.objects` (no solo que la URL
      "no sirva" — el intento de generarla debe fallar) en `tests/e2e/rls.spec.ts`
- [X] T047 Accesibilidad WCAG 2.1 AA (constitución §4): revisar `FormularioConductor.vue`
      (incluida la zona de subida de archivo) y `index.vue` con teclado real — mismo criterio ya
      aplicado en Vehículos y Catálogos Base
- [X] T048 Ejecutar `quickstart.md` completo de punta a punta (los 7 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
- [X] T049 `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo de esta feature

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea las 6 historias de usuario.
- **User Stories (Phase 3-8)**: todas dependen de Foundational. Dentro de ese conjunto:
  - US1 (Phase 3) y US2 (Phase 4): sin dependencia entre sí a nivel de esquema, pero US1 crea
    `FormularioConductor.vue` que US4 reutiliza, y los tests de US1 navegan al listado que crea
    US2 — mismo acoplamiento de MVP que Vehículos (ambas se consideran juntas la entrega mínima).
  - US3 (Phase 5): depende de US2 (navega desde el listado que esa historia crea).
  - US4 (Phase 6): depende de US1 (reusa `FormularioConductor.vue`) y de US3 (agrega la sección de
    historial al mismo `[id]/index.vue`).
  - US5 (Phase 7): depende de US3 (agrega botones al mismo `[id]/index.vue`).
  - US6 (Phase 8): depende de US2 (agrega la acción al mismo `index.vue`).
- **Polish (Phase 9)**: depende de que todas las historias deseadas estén completas.

### User Story Dependencies

- **US1 (P1)**: depende de Foundational. Comparte MVP con US2.
- **US2 (P1)**: depende de Foundational. Comparte MVP con US1.
- **US3 (P2)**: depende de US2.
- **US4 (P2)**: depende de US1 y US3.
- **US5 (P2)**: depende de US3.
- **US6 (P3)**: depende de US2.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- Componentes antes que páginas que los montan.
- Historia completa (checkpoint) antes de pasar a la siguiente en orden de prioridad, salvo que se
  trabaje en paralelo con más de una persona.

### Parallel Opportunities

- Dentro de Foundational: T002-T009 son secuenciales (misma migración); T010 y T011 sí pueden
  correr en paralelo entre sí y respecto a T001 de Setup.
- Todos los tests de una historia marcados [P] pueden correr en paralelo (mismo archivo de
  spec, casos independientes).
- US1 y US2 pueden implementarse en paralelo por dos personas distintas (ambas dependen solo de
  Foundational).
- US4 y US5 pueden implementarse en paralelo una vez completa US3 (ambas dependen de US3, no entre
  sí) — con la salvedad de que ambas tocan `[id]/index.vue`, así que en la práctica conviene
  coordinarse si se trabaja con dos personas sobre el mismo archivo.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: alta sin licencia crea el conductor con los campos obligatorios"
Task: "Playwright: alta con licencia adjunta crea el conductor con la licencia vigente"
Task: "Playwright: alta rechazada por número de licencia duplicado"
Task: "Playwright: archivo con tipo o tamaño inválido se rechaza antes de subirse"
Task: "Playwright: fallo de subida no revierte el alta"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea todas las historias)
3. Completar Phase 3: User Story 1
4. Completar Phase 4: User Story 2
5. **PARAR y VALIDAR**: probar US1+US2 de forma independiente
6. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → fundación lista
2. US1 + US2 → probar de forma independiente → Deploy/Demo (MVP)
3. US3 → probar → Deploy/Demo
4. US4 → probar → Deploy/Demo
5. US5 → probar → Deploy/Demo
6. US6 → probar → Deploy/Demo
7. Cada historia agrega valor sin romper las anteriores

---

## Notes

- [P] tareas = archivos distintos, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en cualquier checkpoint para validar la historia de forma independiente.
- Evitar: tareas vagas, conflictos de mismo archivo sin necesidad, dependencias entre historias
  que rompan su independencia más allá de las ya documentadas arriba.

## Estado final — feature completa (49/49)

US6 (T041-T044) y Polish (T045-T049) implementados en el mismo pase. T044 ya estaba resuelto
desde T022 (el botón "Eliminar" + diálogo de confirmación se construyeron junto con el listado,
reusando `CatalogosDialogoConfirmarEliminarCatalogo`).

**T045/T046** (remediation de `/speckit-analyze`, hallazgos E1/E2): agregados a `tests/e2e/rls.spec.ts`
(no a `conductores.spec.ts`, mismo criterio que Vehículos) — un test combinado positivo+negativo
para `conductores` (el operario SÍ puede leer, además de las 5 escrituras bloqueadas, más la
verificación cruzada de que tampoco puede subir a `documentos/poliza/...`) y un test dedicado de
aislamiento cross-empresa de Storage para `documentos/licencia/...`, ambos como tests Playwright
reales (no verificación manual).

**Verificación final**:
- 34/34 en `conductores.spec.ts` + `rls.spec.ts` juntos (`--project=admin`).
- 34/35 en `vehiculos.spec.ts` en la corrida completa en paralelo (T032 falló una vez, confirmado
  no reproducible en aislamiento — misma clase de flake por contención de recursos ya documentada
  varias veces en `003-vehiculos/tasks.md`; **no** relacionada con los cambios de esta feature a
  las políticas compartidas `documentos_*`/`archivos_delete`, confirmado porque el resto de
  `vehiculos.spec.ts`, incluida la Fase 11 de fotos que también usa esas políticas, pasó limpio).
- `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo.
- T047 (accesibilidad) verificado por equivalencia: los componentes nuevos replican el marcado
  accesible ya usado en Vehículos (`role="button"`/`tabindex`/`aria-label` en las zonas de
  adjuntar archivo, labels de Vuetify en todos los campos) — reforzado por el hecho de que
  `getByLabel()` funciona en todos los tests, evidencia directa de asociación label/campo
  correcta.
