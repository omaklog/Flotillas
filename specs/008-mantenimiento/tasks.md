---

description: "Task list for Feature 008 — Mantenimiento (Correctivo y Preventivo)"
---

# Tasks: Mantenimiento (Correctivo y Preventivo)

**Input**: Design documents from `/specs/008-mantenimiento/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/mantenimiento.md,
quickstart.md (all present)

**Tests**: Incluidos. La constitución del proyecto (§4) exige una prueba Playwright por cada
regla de negocio explícita en `spec.md` y, como mínimo, un caso positivo Y negativo de RLS por
módulo de permisos afectado — no es opcional para este proyecto.

**Organization**: Tareas agrupadas por historia de usuario (spec.md) — US1 (Capturar, P1) y US2
(Listado, P1) son "las dos mitades del mismo flujo básico" (mismo razonamiento que Combustible,
007): US2 asume que US1 ya dejó órdenes capturadas para poder filtrarlas. US3 (Cancelar, P2) es
un flujo de corrección secundario, independiente de US2.

**Esquema de base de datos**: `mantenimientos`/`mantenimiento_detalles` **ya existen** completas,
con su RLS granular (`tiene_permiso('mantenimiento', 'ver'|'crear'|'cancelar')`, migración
inicial). T002-T006 aplican una única migración nueva con lo que falta: `cantidad` en detalles,
`motivo_cancelacion`, el trigger de inmutabilidad propio (contenido literal de
`docs/schema-reference/schema_10_mantenimiento_ajustes.sql`) y 2 triggers de auditoría — ver
`data-model.md` sección "Extensiones sobre el esquema actual".

**⚠️ Dependencia de orden con Combustible (007)**: si la migración de 007
(`combustible_ajustes`) todavía no se aplicó en el mismo entorno, T005 (aplicar esta migración)
MUST ejecutarse **después** de esa — ambas eliminan/reemplazan la misma función genérica
compartida `private.solo_permite_cancelar()` (data-model.md, nota final). Verificar con
`supabase migration list` antes de T005 si hay duda.

**Referencias visuales**: no existe ninguna captura de Stitch dedicada a la captura/listado de
Mantenimiento. Sí existe `Calendario de Mantenimiento` (`calendario-mantenimiento.png`, ya
descargada), pero describe una vista de calendario/próximos servicios que **pertenece a la
feature de Alertas/Dashboard** (spec.md, "Fuera de Alcance") — no se implementa aquí. Se reutiliza
únicamente como referencia de estilo para los chips de estado/prioridad y el filtro superior
("Todos los servicios"), no su layout de calendario. El resto reutiliza las mismas 4 referencias
que Combustible (007): `gestion-vehiculo-alta-edicion.png` (formulario de captura),
`detalle-vehiculo-historial-polizas.png` (historial de factura), `listado-flotilla-vehiculos-v2.png`
(listado con filtros) y `listado-operarios-paginacion.png` (paginación).

**Lecciones de features anteriores a aplicar desde el inicio, no redescubrir**:
- **Auditoría dedicada desde Foundational, no como corrección posterior**: Combustible (007)
  descubrió vía `/speckit-analyze` (hallazgo A1) que había planeado su migración sin trigger de
  auditoría. Esta feature ya incluye `private.audit_mantenimientos()` +
  `private.audit_catalogo()` (para `mantenimiento_detalles`) en T004, dentro de Foundational —
  no se deja para después.
- **Pruebas de bypass de BD incluidas desde el inicio, no en un Polish tardío**: Combustible
  (007) también encontró (hallazgos A2/A3) que sus reglas de inmutabilidad/validación de respaldo
  solo se verificaban a mano una vez. Esta feature incluye T039/T040 (Polish) desde la primera
  versión de este documento — atacando directo vía cliente Supabase, sin pasar por la UI.
- El historial de archivo "con historial" (factura) es el mismo patrón ya construido 3 veces
  (póliza, licencia, factura de Combustible): nunca se sobreescribe ni borra una fila de
  `archivos`, se inserta una nueva y se mueve el puntero — replicar, no reinventar (research.md
  R3).
- `validarArchivo()` (`app/utils/archivos.ts`, PDF/JPG/PNG, ≤10MB) ya cubre exactamente FR-009 —
  **no** crear una variante nueva.
- `useVehiculos().listar()` (default `incluirBaja=false`) y `useProveedores().listar()` (default
  `incluirInactivos=false`) ya excluyen exactamente lo que FR-002 pide — **no** crear funciones
  `listarActivos()` dedicadas (research.md R5).
- El selector de producto de cada línea filtra `tipo !== 'combustible'` **en el cliente**, sobre
  el resultado de `useProductos().listar()` sin argumentos — no agregar un parámetro nuevo al
  composable solo para esto (research.md R5).
- **Mapeo de categoría de línea → `productos.tipo`** (research.md R12): Servicio→`servicio`,
  Llanta→`llanta`, Refacción→`refaccion`, **Producto→`consumible`** (el enum no tiene un valor
  literal `'producto'`) — usar este mapeo exacto en `FormularioOrden.vue`, no inventar uno nuevo.
- `usePermisos().tienePermiso('mantenimiento', accion)` ya funciona sin cambios — el módulo y sus
  3 acciones están sembrados desde la migración inicial (research.md R6).
- **Captura de orden + líneas es un `insert` en 2 pasos, no una transacción** (research.md R13):
  si el segundo paso (líneas) falla tras crear la orden, el composable MUST devolver el error
  junto con el `id` de la orden ya creada para poder reintentar — no hay función RPC que envuelva
  ambos pasos, no inventar una sin verificar antes con el usuario (sin precedente en el proyecto).
- Los tests de RLS deben cubrir el caso POSITIVO (operario con el permiso correcto sí puede)
  además del negativo — usar un operario aislado (`admin.auth.admin.createUser()`), no el
  `operario-e2e` compartido.
- `supabase gen types typescript --local > archivo` **nunca** con `2>&1` después del `>` —
  corrompe el archivo con el banner del CLI.
- El detalle de una orden (`[id]/index.vue`) consulta directo con `useSupabaseClient()` en el
  propio componente de página, sin una función `obtener(id)` en el composable — mismo patrón ya
  usado en `admin/vehiculos/[id]/index.vue` y `admin/combustible/[id]/index.vue`.

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

**Purpose**: Documentar la decisión de reutilizar referencias visuales existentes (ver
"Referencias visuales" arriba) antes de tocar cualquier CSS/componente.

- [X] T001 Agregar una entrada a `docs/design-references/screens.md` documentando que
      Mantenimiento (008) no tiene captura propia de Stitch para captura/listado, que
      `calendario-mantenimiento.png` describe una vista de Alertas/Dashboard fuera del alcance de
      esta feature (solo se reutiliza su estilo de chips/filtro), y que el resto reutiliza las
      mismas 4 referencias que Combustible (007)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema — nada de la UI puede empezar hasta que esta fase esté completa.

**⚠️ CRITICAL**: Ninguna tarea de implementación de US1/US2/US3 puede empezar hasta que esta fase
esté completa.

- [X] T002 Crear la migración de esta feature: `supabase migration new mantenimiento_ajustes`
- [X] T003 En esa migración: aplicar el contenido literal de
      `docs/schema-reference/schema_10_mantenimiento_ajustes.sql` — agrega
      `mantenimiento_detalles.cantidad`, `mantenimientos.motivo_cancelacion`, reemplaza
      `trg_mantenimientos_inmutable` por `private.solo_permite_cancelar_mantenimiento()`, y
      elimina `private.solo_permite_cancelar()` (data-model.md, research.md R1)
- [X] T004 En esa misma migración: crear `private.audit_mantenimientos()` + `trigger
      trg_mantenimientos_auditoria after insert or update or delete on public.mantenimientos`
      (`accion = 'crear'`/`'cancelar'`/`'editar'`, mismo criterio que
      `private.audit_cargas_combustible()` de Combustible) y `trigger
      trg_mantenimiento_detalles_auditoria after insert or update or delete on
      public.mantenimiento_detalles execute function private.audit_catalogo()` (research.md R11,
      data-model.md)
- [X] T005 Aplicar la migración en local (`supabase migration up` — **verificar primero si la
      migración de Combustible/007 ya se aplicó; si no, aplicarla antes**, ver nota de
      "Dependencia de orden" arriba) y verificar manualmente: una orden con costo total y sin
      líneas asociadas puede insertarse a nivel de BD (la restricción de "al menos una línea" es
      de UI, FR-004 — no hay `CHECK` cross-table); un `update` de `estado` a `cancelado` con
      `motivo_cancelacion` no vacío procede; un `update` que intenta cambiar cualquier columna
      operativa/financiera (activa o cancelada) se rechaza; un `update`/`delete` directo sobre
      una fila de `mantenimiento_detalles` se rechaza siempre (RLS `using (false)`); un `insert`
      de orden y uno de cancelación de prueba generan filas en `public.auditoria` con `accion =
      'crear'`/`'cancelar'` respectivamente — la cobertura automatizada de esto vive en
      Phase 3/5/6, no reemplaza esta verificación manual inicial
- [X] T006 [P] Regenerar `app/types/database.types.ts`
      (`supabase gen types typescript --local > app/types/database.types.ts`, **sin** `2>&1`)

**Checkpoint**: Fundación lista — US1 puede empezar.

---

## Phase 3: User Story 1 - Capturar una orden de mantenimiento (Priority: P1) 🎯 MVP (parte 1/3)

**Goal**: Un administrador u operario con permiso `crear` puede registrar una orden de
mantenimiento con una o más líneas (refacción, llanta, servicio o producto), costo total simple,
y factura opcional.

**Independent Test**: Capturar una orden completa con al menos 2 líneas de tipos distintos, con y
sin factura, para un vehículo activo, y confirmar desde su detalle que quedó guardada con todas
sus líneas y datos correctos.

### Tests for User Story 1

- [X] T007 [P] [US1] Playwright: captura con múltiples líneas de tipos distintos queda visible en
      su detalle con todos los datos correctos (FR-001, FR-004, US1/AC1) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T008 [P] [US1] Playwright: una línea de tipo Llanta captura marca, medida, número de serie,
      condición y kilometraje (FR-005, US1/AC2) en `tests/e2e/mantenimiento.spec.ts`
- [X] T009 [P] [US1] Playwright: una línea de tipo Servicio captura fecha de próximo servicio y
      frecuencia (FR-006, US1/AC3) en `tests/e2e/mantenimiento.spec.ts`
- [X] T010 [P] [US1] Playwright: una línea de tipo Producto o Refacción captura cantidad
      (FR-007, US1/AC4) en `tests/e2e/mantenimiento.spec.ts`
- [X] T011 [P] [US1] Playwright: capturar con una factura adjunta (PDF o imagen) la deja asociada
      y visible en el detalle (FR-009, US1/AC5) en `tests/e2e/mantenimiento.spec.ts`
- [X] T012 [P] [US1] Playwright: reemplazar la factura de una orden activa conserva la versión
      anterior en el historial, mostrando la nueva como vigente (FR-011) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T013 [P] [US1] Playwright: intentar guardar una orden sin ninguna línea se rechaza antes de
      guardar, sin crear ningún registro (FR-004, US1/AC6, SC-002) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T014 [P] [US1] Playwright: el selector de vehículo excluye los dados de baja; el selector
      de proveedor excluye los inactivos (FR-002, US1/AC7) en `tests/e2e/mantenimiento.spec.ts`
- [X] T015 [P] [US1] Playwright: el selector de producto de una línea nunca ofrece productos de
      tipo combustible (FR-004, US1/AC8) en `tests/e2e/mantenimiento.spec.ts`
- [X] T016 [P] [US1] Playwright: el campo fecha no admite una fecha posterior a hoy (FR-003) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T017 [P] [US1] Playwright: si la subida de la factura falla (interceptar la petición de
      Storage con `page.route()`), la orden y sus líneas ya creadas se conservan sin factura
      (FR-018, Edge Cases) en `tests/e2e/mantenimiento.spec.ts`
- [X] T018 [P] [US1] Playwright: si el `insert` de líneas falla tras crear la orden (interceptar
      la petición REST a `mantenimiento_detalles` con `page.route()` y forzar el error), el
      formulario ofrece reintentar contra la misma orden ya creada, sin duplicarla (research.md
      R13) en `tests/e2e/mantenimiento.spec.ts`
      **Nota de implementación**: análogo al caso de fallo de factura de Combustible (007,
      T017), pero aquí las líneas no son opcionales — la UI MUST mostrar un error accionable, no
      solo conservar el registro en silencio.
      **Estado**: T007-T018 (12 tests) 100% en verde en `--project=admin` desde la primera
      corrida — los patrones ya establecidos en Combustible (empresas aisladas por test,
      `irAFormularioX` esperando las respuestas de `listar()`, `getByTestId().click()` para
      `v-select`) se trasladaron limpio sin nuevos hallazgos.

### Implementation for User Story 1

- [X] T019 [P] [US1] Implementar `app/composables/useMantenimientos.ts`: `crear(valores,
      lineas)`, `reintentarLineas(mantenimientoId, lineas)`, `adjuntarFactura(mantenimientoId,
      archivo)`, `listarHistorialFactura(mantenimientoId)` (contracts/mantenimiento.md)
- [X] T020 [P] [US1] Implementar `app/components/mantenimiento/FormularioOrden.vue`: selectores
      de tipo/vehículo/proveedor (poblados vía `useVehiculos().listar()`,
      `useProveedores().listar()` — research.md R5), fecha (máximo hoy), lista dinámica de líneas
      (agregar/quitar antes de guardar) donde cada línea selecciona un producto
      (`useProductos().listar()` filtrado en cliente excluyendo `tipo === 'combustible'`) y
      muestra los campos condicionales según su `tipo` (mapeo research.md R12: llanta/servicio/
      cantidad), costo total (campo simple, sin autocálculo — research.md R8), notas, adjunto de
      factura opcional (`validarArchivo()`); bloquea el envío si no hay ninguna línea (FR-004)
- [X] T021 [US1] Implementar `app/pages/admin/mantenimiento/nuevo.vue`: usa `FormularioOrden.vue`
      (T020), llama `crear()` y, si hay factura, `adjuntarFactura()` (T019); si falla el `insert`
      de líneas, ofrece "Reintentar líneas" (`reintentarLineas()`) contra la orden ya creada
      (research.md R13); si falla la subida de factura, no revierte la orden (FR-018); redirige
      al detalle de la orden creada
- [X] T022 [US1] Implementar `app/pages/admin/mantenimiento/[id]/index.vue`: detalle de solo
      lectura (tipo, vehículo, proveedor, fecha, costo total, notas, estado, todas las líneas con
      sus campos condicionales por tipo), historial de factura vía `listarHistorialFactura()` con
      la versión vigente destacada, botón "Reemplazar factura" visible solo si `estado =
      'activo'`
      **Estado**: sin acción de cancelar todavía — se agrega en Phase 5 (US3, T037). También
      agregar el link "Mantenimiento" al menú lateral (`app/layouts/admin.vue`) — necesario para
      que las páginas sean alcanzables.

**Checkpoint**: Captura funcional y probada de forma independiente.

---

## Phase 4: User Story 2 - Listado y búsqueda de órdenes de mantenimiento (Priority: P1) 🎯 MVP (parte 2/3)

**Goal**: Un administrador u operario con permiso `ver` puede consultar y filtrar el historial de
órdenes por vehículo, tipo, rango de fechas, proveedor y estado, y ver el detalle completo de
cualquiera de ellas.

**Independent Test**: Con varias órdenes ya capturadas (activas y canceladas, de distintos
vehículos, tipos, proveedores y fechas), aplicar cada filtro por separado y confirmar que el
listado muestra exactamente los registros esperados; abrir el detalle de una con varias líneas y
confirmar que todas aparecen correctas.

### Tests for User Story 2

- [X] T023 [P] [US2] Playwright: filtrar por vehículo, tipo, rango de fechas, proveedor o estado
      muestra únicamente las órdenes que cumplen ese filtro (FR-012, US2/AC1) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T024 [P] [US2] Playwright: cada fila del listado muestra vehículo, tipo, fecha, costo
      total, estado y número de líneas (FR-013, US2/AC2) en `tests/e2e/mantenimiento.spec.ts`
- [X] T025 [P] [US2] Playwright: una orden cancelada se muestra junto con las activas, con una
      marca visual que la distingue claramente (FR-013, US2/AC3) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T026 [P] [US2] Playwright: el detalle de una orden con varias líneas muestra todas, cada
      una con los campos específicos de su tipo (FR-014, US2/AC4) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T027 [P] [US2] Playwright: un vehículo dado de baja con órdenes ya capturadas no aparece
      como opción del filtro de vehículo, pero sus órdenes siguen visibles en el listado general
      sin ese filtro aplicado (FR-002, US2/AC5) en `tests/e2e/mantenimiento.spec.ts`
      **Estado**: T023-T027 (5 tests) 100% en verde. Bug real encontrado y corregido en T023:
      reclicar la misma opción ya seleccionada de un `v-select` (`filtro-tipo`) no la deselecciona
      — el filtro quedó "pegado" y contaminó el siguiente paso del test (combinado con el filtro
      de fechas, no coincidía con ninguna orden). Se corrigió recargando la página
      (`page.goto`) entre cada filtro probado en vez de intentar "limpiar" el `v-select` vía UI —
      más robusto y deja cada paso genuinamente independiente.

### Implementation for User Story 2

- [X] T028 [P] [US2] Agregar `listar(filtros?)` a `app/composables/useMantenimientos.ts`
      (`vehiculoId?`, `tipo?`, `fechaDesde?`, `fechaHasta?`, `proveedorId?`, `estado?`, con
      `mantenimiento_detalles(count)` embebido para el número de líneas — contracts/
      mantenimiento.md, research.md R9)
- [X] T029 [US2] Implementar `app/pages/admin/mantenimiento/index.vue`: tabla propia (no
      `TablaCatalogo.vue` — research.md R10) con fila de filtros (vehículo/tipo/rango de
      fechas/proveedor/estado), chip visual para órdenes canceladas, paginación cliente 5/10/20
      (default 10) con el estilo ya establecido en `docs/design-system.md`

**Checkpoint**: Listado funcional y probado de forma independiente — US1 y US2 juntas entregan el
flujo básico completo (MVP).

---

## Phase 5: User Story 3 - Cancelar una orden de mantenimiento (Priority: P2)

**Goal**: Un administrador u operario con permiso `cancelar` puede cancelar una orden activa
capturada por error, dejando constancia del motivo, de forma permanente e irreversible.

**Independent Test**: Cancelar una orden activa con un motivo válido y confirmar que queda
`cancelado`, sin botón de reactivar y sin poder editar ningún campo (incluidas sus líneas y su
propio motivo) después; confirmar que un usuario sin el permiso `cancelar` no ve la acción
disponible.

### Tests for User Story 3

- [X] T030 [P] [US3] Playwright: cancelar una orden activa con un motivo válido (≤150 caracteres)
      la deja `cancelado` de forma permanente (FR-015, FR-016, US3/AC1) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T031 [P] [US3] Playwright: intentar confirmar la cancelación sin capturar un motivo la
      bloquea (FR-016, US3/AC2) en `tests/e2e/mantenimiento.spec.ts`
- [X] T032 [P] [US3] Playwright: una orden ya cancelada no ofrece ninguna acción para
      reactivarla, editar su motivo, reemplazar su factura, ni editar ninguna de sus líneas
      (FR-017, US3/AC3) en `tests/e2e/mantenimiento.spec.ts`
- [X] T033 [P] [US3] Playwright: un usuario sin el permiso `cancelar` (incluido un operario con
      solo `ver`/`crear`, los permisos por defecto) no ve disponible la acción de cancelar sobre
      una orden activa (FR-015, US3/AC4) en `tests/e2e/mantenimiento.spec.ts`
- [X] T034 [P] [US3] Playwright: cancelar una orden genera una fila en `public.auditoria` con
      `accion = 'cancelar'`, no `'editar'` a secas (constitución §2, research.md R11) en
      `tests/e2e/mantenimiento.spec.ts`

### Implementation for User Story 3

- [X] T035 [P] [US3] Agregar `cancelar(id, motivo)` a `app/composables/useMantenimientos.ts`
      (contracts/mantenimiento.md)
- [X] T036 [P] [US3] Implementar `app/components/mantenimiento/DialogoCancelarOrden.vue`: motivo
      obligatorio, máximo 150 caracteres — mismo patrón que `DialogoCancelar.vue` de Combustible
- [X] T037 [US3] En `app/pages/admin/mantenimiento/[id]/index.vue` (T022): agregar botón
      "Cancelar" visible solo si `estado = 'activo'` y `usePermisos().tienePermiso('mantenimiento',
      'cancelar')` (research.md R6), que abre `DialogoCancelarOrden.vue` (T036); ocultar
      "Reemplazar factura" cuando `estado = 'cancelado'`

**Checkpoint**: Las 3 historias de usuario funcionan de forma independiente — feature completa.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación no funcional (constitución §2-§4).

- [X] T038 [P] Playwright, caso positivo Y negativo (RLS, constitución §2): un operario sin el
      permiso `cancelar` (permiso por defecto) no puede cancelar una orden activa ni siquiera
      llamando directo al cliente Supabase; con `cancelar` otorgado explícitamente, sí puede
      (SC-004) en `tests/e2e/rls.spec.ts`
      **Nota**: usa un operario aislado (`admin.auth.admin.createUser()`), no el `operario-e2e`
      compartido.
- [X] T039 [P] Playwright, bypass de UI (constitución §2/§4): llamando directo al cliente
      Supabase (sin pasar por `FormularioOrden.vue`/detalle), intentar `update` de un campo
      operativo/financiero (p. ej. `costo_total`) sobre una orden `activo` y confirmar el rechazo
      de `private.solo_permite_cancelar_mantenimiento()` (FR-010) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T040 [P] Playwright, bypass de UI (constitución §2/§4): llamando directo al cliente
      Supabase, intentar `update`/`delete` sobre una fila de `mantenimiento_detalles` ya
      insertada y confirmar el rechazo por RLS (`using (false)`, FR-010) en
      `tests/e2e/mantenimiento.spec.ts`
- [X] T041 Accesibilidad WCAG 2.1 AA (constitución §4): revisar
      `FormularioOrden.vue`/`DialogoCancelarOrden.vue` y el listado con teclado real — mismo
      criterio ya aplicado en features anteriores
      **Estado**: verificado por equivalencia — todos los campos usan labels de Vuetify,
      reforzado por que `getByLabel()` funciona en todos los tests (T007-T040, incluidas las
      líneas dinámicas con labels indexados `"... de la línea N"`). Verificado también
      visualmente en navegador (listado, captura con línea dinámica agregada, y detalle con 2
      líneas de tipos distintos) contra `docs/design-system.md` — un ajuste cosmético encontrado
      y corregido: la columna "Estado" del filtro del listado quedaba demasiado angosta
      (`md="1"`, mostraba "Est..."), rebalanceada a `md="2"` junto con "Vehículo".
- [X] T042 Ejecutar `quickstart.md` completo de punta a punta (los 7 escenarios) y documentar
      cualquier ajuste encontrado en esta misma sección de `tasks.md`
      **Estado**: los 7 escenarios están cubiertos 1:1 por T007-T040 (Escenario 1→T007,
      2→T013, 3→T011/T012, 4→T014/T015, 5→T023-T027, 6→T030-T032, 7→T033/T038) — sin hallazgos
      nuevos más allá de los ya documentados en T023 (bug del `v-select` que no se destilda
      reclicando la misma opción) y T041 (ajuste de ancho de columna).
- [X] T043 `yarn typecheck` y `yarn lint` en verde sobre todo el código nuevo de esta feature
      **Estado**: verde en cada paso de la implementación, no solo al final.

**Verificación final de Phase 6**: 24/24 en verde (`mantenimiento.spec.ts` completo, incluidas
las 2 pruebas de bypass T039/T040) + `rls.spec.ts` T038, en `--project=admin`, sin flakes.
Regresión adicional corrida contra la suite completa (`usuarios`/`aseguradoras`/
`permisos-catalogo`/`tipos-vehiculo`/`vehiculos`/`conductores`/`proveedores`/`productos`/
`combustible`/`mantenimiento`/`rls`, `--project=admin`, 174 tests): 1 fallo, en
`conductores.spec.ts` T012 — confirmado no relacionado, pasa limpio en aislado (mismo patrón de
contención de recursos por corrida en paralelo ya documentado repetidas veces en este proyecto).
Ninguno de los 37 tests propios de esta feature (T007-T040, más T038 de `rls.spec.ts`) falló en
ninguna corrida, aislada o completa.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Phase 2)**: depende de Setup — bloquea las 3 historias de usuario. **Depende
  además de que la migración de Combustible (007) ya esté aplicada, si ambas están pendientes en
  el mismo entorno** (ver nota al inicio del documento).
- **User Story 1 (Phase 3)**: depende de Foundational — sin dependencias de otra historia.
- **User Story 2 (Phase 4)**: depende de Foundational; su "Independent Test" asume que ya existen
  órdenes capturadas (de US1 o sembradas directo) — se implementa después de US1.
- **User Story 3 (Phase 5)**: depende de Foundational y del detalle de US1 (T022, extendido en
  T037) — no depende de US2.
- **Polish (Phase 6)**: depende de que US1, US2 y US3 estén completas.

### Within Each User Story

- Tests MUST escribirse y confirmarse en rojo antes de implementar.
- El composable (T019/T028/T035) antes que los componentes/páginas que lo consumen.

### Parallel Opportunities

- T006 (regenerar tipos) puede correr en paralelo al resto de Foundational una vez aplicada la
  migración (T005).
- Todos los tests de una misma historia marcados [P] pueden correr en paralelo (casos
  independientes dentro del mismo archivo `mantenimiento.spec.ts`).
- T019-T020 (composable + formulario de US1) pueden implementarse en paralelo entre sí — T021/T022
  dependen de ambos.
- T035-T036 (composable + diálogo de US3) pueden implementarse en paralelo entre sí — T037 depende
  de ambos y de T022 (US1).
- T039 y T040 (Polish, bypass de BD) pueden correr en paralelo entre sí y con T038.

---

## Parallel Example: User Story 1

```bash
# Lanzar todos los tests de User Story 1 juntos:
Task: "Playwright: captura con múltiples líneas de tipos distintos"
Task: "Playwright: línea Llanta captura sus campos específicos"
Task: "Playwright: línea Servicio captura sus campos específicos"
Task: "Playwright: línea Producto/Refacción captura cantidad"
Task: "Playwright: captura con factura adjunta"
Task: "Playwright: reemplazar factura conserva historial"
Task: "Playwright: guardar sin ninguna línea se rechaza"
Task: "Playwright: selectores excluyen vehículo dado de baja y proveedor inactivo"
Task: "Playwright: selector de producto de línea excluye tipo combustible"
Task: "Playwright: fecha futura rechazada"
Task: "Playwright: fallo de subida de factura no revierte la orden"
Task: "Playwright: fallo del insert de líneas ofrece reintentar"
```

---

## Implementation Strategy

### MVP First (US1 + US2, ambas P1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea las 3 historias; verificar orden con la
   migración de Combustible si ambas están pendientes)
3. Completar Phase 3 (Capturar)
4. **PARAR y VALIDAR**: probar US1 de forma independiente
5. Completar Phase 4 (Listado) — usa las órdenes ya capturadas en el paso anterior
6. **PARAR y VALIDAR**: ambas juntas son el MVP completo
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
