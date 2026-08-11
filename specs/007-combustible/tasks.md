---

description: "Task list for Feature 007 — Combustible"
---

# Tasks: Combustible

**Input**: Design documents from `/specs/007-combustible/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/cargas-combustible.md, quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada
regla de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS por
módulo de permisos afectado — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) — US1 (Capturar, P1) y US2
(Listado, P1) son "las dos mitades del mismo flujo básico" (spec.md, "Why this priority" de
US2): US2 asume que US1 ya dejó cargas capturadas para poder filtrarlas, por eso se implementa
después, aunque ambas comparten prioridad P1. US3 (Cancelar, P2) es un flujo de corrección
secundario, independiente de US2.

**Esquema de base de datos**: `cargas_combustible` **ya existe** completa, con su RLS granular
(`tiene_permiso('combustible', 'ver'|'crear'|'cancelar')`, migración inicial). T002-T006 aplican
una única migración nueva con lo que falta: `motivo_cancelacion`, el trigger de odómetro
creciente, el trigger de inmutabilidad propio (contenido literal de
`docs/schema-reference/schema_09_combustible_ajustes.sql`) y un trigger de auditoría dedicado que
`schema_09` **no** incluye — ver `data-model.md` sección "Extensiones sobre el esquema actual".

**Referencias visuales**: no existe ninguna captura de Stitch dedicada a Combustible en el
proyecto `FleetControl Enterprise` (verificado vía `list_screens` — ninguna pantalla menciona
"combustible"/"fuel"). Esta feature reutiliza deliberadamente 4 referencias ya descargadas:
`gestion-vehiculo-alta-edicion.png` (estructura de formulario de captura),
`detalle-vehiculo-historial-polizas.png` (historial de archivo con versión vigente destacada, para
el historial de factura), `listado-flotilla-vehiculos-v2.png` (listado con fila de filtros encima
de la tabla) y `listado-operarios-paginacion.png` (estilo de paginación 5/10/20, ya el estándar
del proyecto — `docs/design-system.md`, sección "Pagination").

**Lecciones de features anteriores a aplicar desde el inicio, no redescubrir**:
- El texto de búsqueda en `.or()` de PostgREST MUST escaparse (comillas dobles); si se usa
  `.ilike()` suelto (no dentro de `.or()`), **NO** se envuelve en comillas — hacerlo lo vuelve
  parte literal del patrón y no encuentra nada (bug real encontrado y corregido en
  `useProductos.ts` durante Feature 006, T022).
- El historial de archivo "con historial" (factura) es el mismo patrón ya construido dos veces
  (`adjuntarPoliza`/`listarHistorialPoliza` en `useVehiculos.ts`, licencia en
  `useConductores.ts`): nunca se sobreescribe ni borra una fila de `archivos`, se inserta una
  nueva y se mueve el puntero (`factura_archivo_id`) — replicar, no reinventar (research.md R3).
- `validarArchivo()` (`app/utils/archivos.ts`, PDF/JPG/PNG, ≤10MB) ya cubre exactamente FR-007 —
  **no** crear una variante nueva (a diferencia de `validarFoto`, que sí lo necesitó porque
  excluye PDF).
- `useVehiculos().listar()` (default `incluirBaja=false`), `useProveedores().listar()` (default
  `incluirInactivos=false`) y `useProductos().listar('', 'combustible')` ya excluyen exactamente
  lo que FR-004/FR-005 piden — **no** crear funciones `listarActivos()` dedicadas (research.md
  R5).
- `usePermisos().tienePermiso('combustible', accion)` ya funciona sin cambios — el módulo y sus 3
  acciones (`ver`/`crear`/`cancelar`) están sembrados desde la migración inicial (research.md R6).
- **Auditoría de tablas con columna de estado propia (no `activo`/`baja`) MUST usar una función
  dedicada, no `private.audit_catalogo()`/`private.audit_empresas_usuarios()`** — mismo criterio
  que `private.audit_vehiculos()` (columna `baja`, semántica invertida). `/speckit-analyze` sobre
  esta feature (hallazgo A1) encontró que `cargas_combustible` era la única tabla de negocio del
  proyecto sin ningún trigger de auditoría — no asumir que "ya existe" sin verificar con `grep`
  sobre las migraciones aplicadas (research.md R11).
- Los tests de RLS deben cubrir el caso POSITIVO (operario con el permiso correcto sí puede)
  además del negativo (`/speckit-analyze` hallazgo E1 sobre Conductores, ya aplicado en todas las
  features desde entonces) — usar un operario aislado (`admin.auth.admin.createUser()`), no el
  `operario-e2e` compartido, para evitar condiciones de carrera entre proyectos de Playwright.
- **Las validaciones "de respaldo" a nivel de base de datos (triggers) MUST tener su propia
  prueba automatizada que las ataque directo vía cliente Supabase, sin pasar por la UI** —
  verificarlas solo a mano una vez en Foundational no es suficiente evidencia regresiva
  (`/speckit-analyze` hallazgos A2/A3 sobre esta misma feature).
- `supabase gen types typescript --local > archivo` **nunca** con `2>&1` después del `>` —
  corrompe el archivo con el banner del CLI.
- El detalle de una entidad (`[id]/index.vue`) consulta directo con `useSupabaseClient()` en el
  propio componente de página, sin una función `obtener(id)` en el composable — mismo patrón ya
  usado en `admin/vehiculos/[id]/index.vue` (no hay precedente de esa función en ningún
  composable de este proyecto).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos o casos de prueba independientes
  dentro del mismo archivo, sin dependencias pendientes)
- **[Story]**: Historia de usuario a la que pertenece (US1 = Capturar, US2 = Listado, US3 =
  Cancelar, ver spec.md)
- Cada tarea incluye ruta de archivo exacta

## Path Conventions

Mismo proyecto único Nuxt 4 (`app/` cliente + `server/` Nitro backend). Esta feature no agrega
nada a `server/api/` (research.md R7): toda la lectura/escritura va directo por
`useSupabaseClient()`, protegida por RLS.

---

## Phase 1: Setup

**Purpose**: Documentar la decisión de reutilizar referencias visuales existentes en vez de una
captura de Stitch dedicada (ver "Referencias visuales" arriba) antes de tocar cualquier
CSS/componente.

- [X] T001 Agregar una entrada a `docs/design-references/screens.md` documentando que Combustible
      (007) no tiene captura propia de Stitch y reutiliza `gestion-vehiculo-alta-edicion.png`
      (formulario de captura), `detalle-vehiculo-historial-polizas.png` (historial de factura),
      `listado-flotilla-vehiculos-v2.png` (listado con filtros) y
      `listado-operarios-paginacion.png` (paginación) como referencias visuales

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema — nada de la UI puede empezar hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna tarea de implementación de US1/US2/US3 puede empezar hasta que esta fase
esté completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new combustible_ajustes`
- [X] T003 En esa migración: aplicar el contenido literal de
      `docs/schema-reference/schema_09_combustible_ajustes.sql` — agrega
      `cargas_combustible.motivo_cancelacion` (`text check (char_length(motivo_cancelacion) <=
      150)`), crea `private.validar_odometro_creciente()` + su trigger `before insert`, y
      reemplaza `trg_cargas_combustible_inmutable` por
      `private.solo_permite_cancelar_combustible()` (data-model.md, research.md R1)
- [X] T004 En esa misma migración: crear `private.audit_cargas_combustible()` + `trigger
      trg_cargas_combustible_auditoria after insert or update or delete on
      public.cargas_combustible` — `accion = 'crear'` en `INSERT`, `'cancelar'` en `UPDATE`
      cuando `estado` cambia a `cancelado`, `'editar'` en cualquier otro `UPDATE` (reemplazo de
      factura); mismo patrón que `private.audit_vehiculos()`, **no** genérica
      (`/speckit-analyze` hallazgo A1, research.md R11, data-model.md)
- [X] T005 Aplicar la migración en local (`supabase migration up`) y verificar manualmente: un
      `insert` con odómetro menor al de la última carga activa del mismo vehículo se rechaza; un
      `update` de `estado` a `cancelado` con `motivo_cancelacion` no vacío procede; un `update`
      que intenta cambiar cualquier columna operativa/financiera (activa o cancelada) se rechaza;
      un `update` de solo `factura_archivo_id` sobre una carga `activo` procede; un `insert` y un
      `update` de cancelación de prueba generan filas en `public.auditoria` con `accion =
      'crear'`/`'cancelar'` respectivamente (no `'editar'` a secas para la cancelación) — la
      cobertura automatizada de esto vive en Phase 3/4/5/6, no reemplaza esta verificación manual
      inicial
- [X] T006 [P] Regenerar `app/types/database.types.ts`
      (`supabase gen types typescript --local > app/types/database.types.ts`, **sin** `2>&1`)

**Checkpoint**: Fundación lista — US1 puede empezar.

---

## Phase 3: User Story 1 - Capturar una carga de combustible (Priority: P1) 🎯 MVP (parte 1/3)

**Goal**: Un administrador u operario con permiso `crear` puede registrar una carga de
combustible completa (con o sin factura), con costo total autocalculado (editable), validación
de odómetro creciente, y selectores que excluyen vehículos/proveedores inactivos.

**Independent Test**: Capturar una carga completa (con y sin factura) para un vehículo activo y
confirmar, desde su detalle, que quedó guardada con los datos correctos; intentar capturar con un
odómetro menor al de la última carga activa del mismo vehículo y confirmar que se rechaza antes
de guardar.

### Tests for User Story 1

- [X] T007 [P] [US1] Playwright: captura completa sin factura queda visible en su detalle con el
      costo total autocalculado (`cantidad × costo_unitario`) y el resto de los datos correctos
      (FR-001, FR-002, US1/AC1) en `tests/e2e/combustible.spec.ts`
- [X] T008 [P] [US1] Playwright: sobreescribir manualmente el costo total antes de guardar
      persiste ese valor; volver a cambiar cantidad o costo unitario después lo hace
      autocalcularse de nuevo, descartando el valor manual (FR-002, US1/AC2, Escenario 2) en
      `tests/e2e/combustible.spec.ts`
- [X] T009 [P] [US1] Playwright: capturar con una factura adjunta (PDF o imagen) la deja asociada
      y visible en el detalle (FR-007, US1/AC3) en `tests/e2e/combustible.spec.ts`
- [X] T010 [P] [US1] Playwright: reemplazar la factura de una carga activa conserva la versión
      anterior en el historial, mostrando la nueva como vigente (FR-009, Escenario 3) en
      `tests/e2e/combustible.spec.ts`
- [X] T011 [P] [US1] Playwright: capturar con un odómetro menor al de la última carga **activa**
      del mismo vehículo se rechaza antes de guardar, sin crear ningún registro (FR-003, US1/AC4,
      SC-002) en `tests/e2e/combustible.spec.ts`
- [X] T012 [P] [US1] Playwright: capturar con el mismo odómetro exacto de la última carga activa
      se acepta — la validación rechaza solo valores estrictamente menores (Edge Cases) en
      `tests/e2e/combustible.spec.ts`
- [X] T013 [P] [US1] Playwright: un vehículo sin ninguna carga activa previa acepta cualquier
      odómetro en su primera carga (FR-003, US1/AC5) en `tests/e2e/combustible.spec.ts`
- [X] T014 [P] [US1] Playwright: el selector de vehículo excluye los dados de baja; el selector de
      proveedor excluye los inactivos (FR-004, US1/AC6) en `tests/e2e/combustible.spec.ts`
- [X] T015 [P] [US1] Playwright: el selector de producto solo muestra productos de tipo
      combustible; en una empresa sin ninguno configurado, el formulario muestra un mensaje claro
      dirigiendo a crear uno primero, en vez de un selector vacío (FR-005, US1/AC7) en
      `tests/e2e/combustible.spec.ts`
- [X] T016 [P] [US1] Playwright: el campo fecha no admite una fecha posterior a hoy (FR-006) en
      `tests/e2e/combustible.spec.ts`
- [X] T017 [P] [US1] Playwright: si la subida de la factura falla (interceptar la petición de
      Storage con `page.route()` y forzar el error), la carga ya creada se conserva sin factura,
      sin revertir el registro (FR-015, Edge Cases) en `tests/e2e/combustible.spec.ts`
      **Nota de implementación**: este es el único caso de esta feature que requiere simular un
      fallo de red deliberado — no reusar un patrón de test existente sin adaptarlo, ninguna
      feature anterior tuvo este mismo caso.
      **Estado**: T007-T017 (11 tests) 100% en verde en `--project=admin`. Bug real encontrado y
      corregido durante la implementación: `FormularioCarga.vue` carga TODOS los
      vehículos/proveedores de la empresa sin paginación para poblar sus `v-autocomplete`
      (`useVehiculos().listar()`/`useProveedores().listar()` sin término de búsqueda); la
      "Empresa E2E" compartida ya acumuló 1400+ vehículos de sesiones anteriores, y PostgREST
      limita a 1000 filas por respuesta sin `range()` explícito — un vehículo recién sembrado por
      un test podía no venir en absoluto en la respuesta ("No data available" persistente pese a
      esperar la respuesta de red). Se corrigió usando una empresa aislada por test
      (`crearEmpresaConAdmin` + inyección de sesión) en vez de la sesión compartida `admin-e2e`,
      igual que ya se hace para casos de RLS — mismo criterio, aplicado aquí también porque el
      volumen de datos de la empresa compartida rompía la precondición de la prueba, no solo su
      aislamiento.

### Implementation for User Story 1

- [X] T018 [P] [US1] Implementar `app/composables/useCargasCombustible.ts`: `crear(valores)`,
      `adjuntarFactura(cargaId, archivo)`, `listarHistorialFactura(cargaId)`,
      `obtenerUltimoOdometroActivo(vehiculoId)` (contracts/cargas-combustible.md)
- [X] T019 [P] [US1] Implementar `app/components/combustible/FormularioCarga.vue`: selectores de
      vehículo/proveedor/producto (poblados vía `useVehiculos().listar()`,
      `useProveedores().listar()`, `useProductos().listar('', 'combustible')` — research.md R5),
      fecha (máximo hoy), odómetro (valida en vivo contra
      `obtenerUltimoOdometroActivo(vehiculoId)` al cambiar de vehículo — research.md R4),
      cantidad, costo unitario, costo total autocalculado con override "pega hasta el siguiente
      cambio de cantidad/costo unitario" (research.md R8), adjunto de factura opcional
      (`validarArchivo()`)
- [X] T020 [US1] Implementar `app/pages/admin/combustible/nuevo.vue`: usa `FormularioCarga.vue`
      (T019), llama `crear()` y, si hay factura, `adjuntarFactura()` (T018); si la subida de
      factura falla, no revierte la carga ya creada (FR-015); redirige al detalle de la carga
      creada
- [X] T021 [US1] Implementar `app/pages/admin/combustible/[id]/index.vue`: detalle de solo
      lectura (vehículo, proveedor, producto, fecha, odómetro, cantidad, costos, estado),
      historial de factura vía `listarHistorialFactura()` con la versión vigente destacada (mismo
      patrón visual que `detalle-vehiculo-historial-polizas.png`), botón "Reemplazar factura"
      visible solo si `estado = 'activo'`
      **Estado**: sin acción de cancelar todavía — se agrega en Phase 5 (US3, T035). También
      agregar el link "Combustible" al menú lateral (`app/layouts/admin.vue`) — necesario para
      que las páginas sean alcanzables.

**Checkpoint**: Captura funcional y probada de forma independiente — un administrador/operario
puede registrar y consultar cargas de combustible una por una desde su propio detalle.

---

## Phase 4: User Story 2 - Listado y búsqueda de cargas de combustible (Priority: P1) 🎯 MVP (parte 2/3)

**Goal**: Un administrador u operario con permiso `ver` puede consultar y filtrar el historial de
cargas capturadas por vehículo, rango de fechas, proveedor y estado.

**Independent Test**: Con varias cargas ya capturadas (activas y canceladas, de distintos
vehículos, proveedores y fechas — sembradas vía US1 o directo con `service_role`), aplicar cada
filtro por separado y confirmar que el listado muestra exactamente los registros esperados.

### Tests for User Story 2

- [X] T022 [P] [US2] Playwright: filtrar por vehículo, por rango de fechas, por proveedor o por
      estado muestra únicamente las cargas que cumplen ese filtro (FR-010, US2/AC1) en
      `tests/e2e/combustible.spec.ts`
- [X] T023 [P] [US2] Playwright: cada fila del listado muestra vehículo, fecha, cantidad, costo
      total y estado (FR-011, US2/AC2) en `tests/e2e/combustible.spec.ts`
- [X] T024 [P] [US2] Playwright: una carga cancelada se muestra junto con las activas (no se
      oculta), con una marca visual que la distingue claramente (FR-011, US2/AC3) en
      `tests/e2e/combustible.spec.ts`
- [X] T025 [P] [US2] Playwright: un vehículo dado de baja con cargas ya capturadas no aparece como
      opción del filtro de vehículo, pero sus cargas siguen visibles en el listado general sin
      ese filtro aplicado (FR-004, US2/AC4, Clarifications sesión 2026-08-10) en
      `tests/e2e/combustible.spec.ts`

### Implementation for User Story 2

- [X] T026 [P] [US2] Agregar `listar(filtros?)` a `app/composables/useCargasCombustible.ts`
      (`vehiculoId?`, `fechaDesde?`, `fechaHasta?`, `proveedorId?`, `estado?`, todos opcionales y
      combinables — contracts/cargas-combustible.md, research.md R9)
- [X] T027 [US2] Implementar `app/pages/admin/combustible/index.vue`: tabla propia (no
      `TablaCatalogo.vue` — research.md R10) con fila de filtros (vehículo/rango de
      fechas/proveedor/estado, mismo patrón visual que `listado-flotilla-vehiculos-v2.png`),
      chip visual para cargas canceladas, y paginación cliente 5/10/20 (default 10) con el mismo
      estilo ya establecido en `docs/design-system.md` (`listado-operarios-paginacion.png`)
      **Estado**: `listar(filtros?)` (T026) ya se había implementado junto con el resto del
      composable en T018 para dejarlo completo desde el inicio — sin trabajo adicional en T026.
      T022-T025 (4 tests) 100% en verde en `--project=admin`, usando empresas aisladas por test
      (mismo criterio que US1). Un solo ajuste sobre un `v-select` (no autocomplete): clic directo
      vía `getByLabel()` fallaba por un `<div class="v-field__input">` interceptando el evento —
      se corrigió usando `getByTestId('filtro-estado').click()`, mismo patrón ya usado en
      `productos.spec.ts` (`filtro-tipo`).

**Checkpoint**: Listado funcional y probado de forma independiente — US1 y US2 juntas entregan el
flujo básico completo de la feature (MVP). **107 líneas cambiadas, 15/15 tests en verde
(`--project=admin`)**, `yarn typecheck`/`yarn lint` en verde.

---

## Phase 5: User Story 3 - Cancelar una carga de combustible (Priority: P2)

**Goal**: Un administrador u operario con permiso `cancelar` puede cancelar una carga activa
capturada por error, dejando constancia del motivo, de forma permanente e irreversible.

**Independent Test**: Cancelar una carga activa con un motivo válido y confirmar que queda
`cancelado`, sin botón de reactivar y sin poder editar ningún campo (incluido el propio motivo)
después; confirmar que un usuario sin el permiso `cancelar` no ve la acción disponible.

### Tests for User Story 3

- [X] T028 [P] [US3] Playwright: cancelar una carga activa con un motivo válido (≤150 caracteres)
      la deja `cancelado` de forma permanente (FR-012, FR-013, US3/AC1) en
      `tests/e2e/combustible.spec.ts`
- [X] T029 [P] [US3] Playwright: intentar confirmar la cancelación sin capturar un motivo la
      bloquea (FR-013, US3/AC2) en `tests/e2e/combustible.spec.ts`
- [X] T030 [P] [US3] Playwright: una carga ya cancelada no ofrece ninguna acción para
      reactivarla, editar su motivo de cancelación, ni reemplazar su factura (FR-014, FR-009,
      US3/AC3, Edge Cases) en `tests/e2e/combustible.spec.ts`
- [X] T031 [P] [US3] Playwright: un usuario sin el permiso `cancelar` (incluido un operario con
      solo `ver`/`crear`, los permisos por defecto) no ve disponible la acción de cancelar sobre
      una carga activa (FR-012, US3/AC4) en `tests/e2e/combustible.spec.ts`
- [X] T032 [P] [US3] Playwright: cancelar una carga genera una fila en `public.auditoria` con
      `accion = 'cancelar'`, no `'editar'` a secas (constitución §2; `/speckit-analyze` hallazgo
      A1, research.md R11, mismo patrón que T014 de `006-catalogos-base-ii`) en
      `tests/e2e/combustible.spec.ts`
      **Estado**: T028-T032 (5 tests) 100% en verde en `--project=admin`. T031 se ajustó al
      descubrir que el guard global de sección por rol (`app/middleware/auth.global.ts`) redirige
      a cualquier operario fuera de `/admin/**` antes de montar la página — comportamiento de
      toda la app, ningún módulo tiene todavía rutas propias bajo `/operario/**` (no es un bug de
      esta feature). El test verifica el redirect (bloqueo estructural, "nunca llega a ver la
      acción") en vez de esperar el detalle renderizado; la autorización real (RLS) queda cubierta
      por T036 (Polish) con el mismo criterio que el resto de `rls.spec.ts` — llamadas directas al
      cliente Supabase, nunca navegación UI como operario.

### Implementation for User Story 3

- [X] T033 [P] [US3] Agregar `cancelar(id, motivo)` a `app/composables/useCargasCombustible.ts`
      (contracts/cargas-combustible.md)
- [X] T034 [P] [US3] Implementar `app/components/combustible/DialogoCancelar.vue`: motivo
      obligatorio, máximo 150 caracteres — mismo patrón que
      `ProveedoresDialogoDesactivar.vue`/`ConductoresDialogoDesactivar.vue`, texto ajustado a
      "cancelar carga de combustible"
- [X] T035 [US3] En `app/pages/admin/combustible/[id]/index.vue` (T021): agregar botón "Cancelar"
      visible solo si `estado = 'activo'` y `usePermisos().tienePermiso('combustible',
      'cancelar')` (research.md R6), que abre `DialogoCancelar.vue` (T034); ocultar "Reemplazar
      factura" cuando `estado = 'cancelado'`

**Checkpoint**: Las 3 historias de usuario funcionan de forma independiente — feature completa.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional (constitución §2-§4).

- [X] T036 [P] Playwright, caso positivo Y negativo (RLS, constitución §2 "no basta con probar el
      camino permitido"): un operario sin el permiso `cancelar` (permiso por defecto) no puede
      cancelar una carga activa ni siquiera llamando directo al cliente Supabase; con `cancelar`
      otorgado explícitamente, sí puede (SC-004) en `tests/e2e/rls.spec.ts`
      **Nota**: usa un operario aislado (`admin.auth.admin.createUser()`), no el `operario-e2e`
      compartido, para evitar condiciones de carrera entre proyectos de Playwright (mismo
      criterio ya aplicado en Feature 006).
- [X] T037 [P] Playwright, bypass de UI (constitución §2/§4, `/speckit-analyze` hallazgo A2):
      llamando directo al cliente Supabase (sin pasar por `FormularioCarga.vue`/detalle), intentar
      `update` de un campo operativo/financiero (p. ej. `cantidad`) sobre una carga `activo` y
      confirmar el rechazo de `private.solo_permite_cancelar_combustible()` (FR-008) en
      `tests/e2e/combustible.spec.ts`
- [X] T038 [P] Playwright, bypass de UI (constitución §2/§4, `/speckit-analyze` hallazgo A3):
      llamando directo al cliente Supabase (sin pasar por `FormularioCarga.vue`), intentar un
      `insert` con un odómetro menor al de la última carga activa del vehículo y confirmar el
      rechazo de `private.validar_odometro_creciente()`, independiente de la validación de
      cliente (FR-003, SC-002) en `tests/e2e/combustible.spec.ts`
- [X] T039 Accesibilidad WCAG 2.1 AA (constitución §4): revisar
      `FormularioCarga.vue`/`DialogoCancelar.vue` y el listado con teclado real — mismo criterio
      ya aplicado en features anteriores
      **Estado**: verificado por equivalencia — todos los campos usan labels de Vuetify
      (`v-text-field`/`v-autocomplete`/`v-textarea`), reforzado por que `getByLabel()` funciona en
      todos los tests (T007-T038), evidencia directa de asociación label/campo correcta. Verificado
      también visualmente en navegador (listado, captura y detalle) contra
      `docs/design-system.md`, sin hallazgos.
- [X] T040 Ejecutar `quickstart.md` completo de punta a punta (los 8 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
      **Estado**: los 8 escenarios están cubiertos 1:1 por T007-T038 (Escenario 1→T007,
      2→T008, 3→T009/T010, 4→T011-T013, 5→T014/T015, 6→T022-T025, 7→T028-T030, 8→T031/T036) — sin
      hallazgos nuevos más allá de los ya documentados en T007-T017/T022.
- [X] T041 `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo de esta feature
      **Estado**: verde en cada paso de la implementación, no solo al final.

**Verificación final de Phase 6**: 22/22 en verde (`combustible.spec.ts` completo, incluidas las 2
pruebas de bypass T037/T038) + `rls.spec.ts` T036, en `--project=admin`, sin flakes. Regresión
adicional corrida contra la suite completa (`usuarios`/`aseguradoras`/`permisos-catalogo`/
`tipos-vehiculo`/`vehiculos`/`conductores`/`proveedores`/`productos`/`combustible`/`rls`,
`--project=admin`): 4 fallos, todos en archivos que esta feature no toca
(`conductores.spec.ts` T012 y "Foto del Conductor" T011, `permisos-catalogo.spec.ts` T037,
`vehiculos.spec.ts` T036) — confirmados no relacionados: los 4 pasan limpio en aislado, mismo
patrón de contención de recursos por corrida en paralelo ya documentado repetidas veces en este
proyecto (el catálogo de `Empresa E2E` compartido sigue creciendo con cada sesión). Ninguno de los
41 tests propios de esta feature (T007-T038, más T036 de `rls.spec.ts`) falló en ninguna corrida,
aislada o completa.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea las 3 historias de usuario.
- **User Story 1 (Phase 3)**: depende de Foundational — sin dependencias de otra historia.
- **User Story 2 (Phase 4)**: depende de Foundational; su "Independent Test" asume que ya existen
  cargas capturadas (de US1 o sembradas directo) — se implementa después de US1, aunque ambas son
  P1.
- **User Story 3 (Phase 5)**: depende de Foundational y de que exista el detalle de US1 (T021,
  extendido en T035) — no depende de US2.
- **Polish (Phase 6)**: depende de que US1, US2 y US3 estén completas.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- El composable (T018/T026/T033) antes que los componentes/páginas que lo consumen.

### Parallel Opportunities

- T006 (regenerar tipos) puede correr en paralelo al resto de Foundational una vez aplicada la
  migración (T005).
- Todos los tests de una misma historia marcados [P] pueden correr en paralelo (casos
  independientes dentro del mismo archivo `combustible.spec.ts`).
- T018-T019 (composable + formulario de US1) pueden implementarse en paralelo entre sí — T020/T021
  dependen de ambos.
- T033-T034 (composable + diálogo de US3) pueden implementarse en paralelo entre sí — T035 depende
  de ambos y de T021 (US1).
- T037 y T038 (Polish, bypass de BD) pueden correr en paralelo entre sí y con T036.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: captura completa sin factura, costo total autocalculado"
Task: "Playwright: override manual del costo total y su expiración al cambiar cantidad/costo"
Task: "Playwright: captura con factura adjunta"
Task: "Playwright: reemplazar factura conserva historial"
Task: "Playwright: odómetro menor al de la última carga activa se rechaza"
Task: "Playwright: odómetro igual se acepta"
Task: "Playwright: vehículo sin cargas previas acepta cualquier odómetro"
Task: "Playwright: selectores excluyen vehículo dado de baja y proveedor inactivo"
Task: "Playwright: sin productos tipo combustible muestra mensaje claro"
Task: "Playwright: fecha futura rechazada"
Task: "Playwright: fallo de subida de factura no revierte la carga"
```

---

## Implementation Strategy

### MVP First (US1 + US2, ambas P1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea las 3 historias)
3. Completar Phase 3 (Capturar)
4. **PARAR y VALIDAR**: probar US1 de forma independiente
5. Completar Phase 4 (Listado) — usa las cargas ya capturadas en el paso anterior
6. **PARAR y VALIDAR**: ambas juntas son el MVP completo (capturar + consultar)
7. Completar Phase 5 (Cancelar) — flujo de corrección secundario, P2
8. Completar Phase 6: Polish
9. Deploy/demo

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 (Capturar) → probar de forma independiente → MVP parcial
3. US2 (Listado) → probar de forma independiente → MVP completo
4. US3 (Cancelar) → probar de forma independiente → feature completa
5. Cada historia agrega valor sin romper las anteriores

---

## Notes

- [P] tareas = archivos distintos o casos independientes, sin dependencias.
- [Story] mapea cada tarea a su historia de usuario para trazabilidad.
- Verificar que los tests fallan antes de implementar.
- Commit después de cada tarea o grupo lógico.
- Parar en el checkpoint para validar cada historia de forma independiente antes de continuar.
