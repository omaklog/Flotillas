# Research: Combustible

## R1 — Migraciones pendientes: solo `schema_09`, `schema_08` ya aplicado

**Decisión**: Esta feature aplica una sola migración nueva, con el contenido literal de
`docs/schema-reference/schema_09_combustible_ajustes.sql`: agrega `motivo_cancelacion` a
`cargas_combustible`, el trigger `private.validar_odometro_creciente()` (respaldo de BD para
FR-003) y separa el trigger de inmutabilidad (`private.solo_permite_cancelar_combustible()`,
reemplazando el genérico compartido con `mantenimientos`) para permitir que `estado` +
`motivo_cancelacion` cambien juntos al cancelar, sin abrir la puerta a editar el resto.

**Por qué**: `schema_08_proveedores_activo.sql` (columna `activo`/`motivo_baja` de `proveedores`)
ya se aplicó como parte de Feature 006 (migración
`20260810202715_proveedores_productos_activo_auditoria.sql`) — el `spec.md` de esta feature lo
marca como assumption pendiente porque se escribió antes de esa migración, pero ya no aplica.

**Alternativas consideradas**: ninguna — el contenido de `schema_09` ya está validado
(nombres de función, columnas, comentarios) y no requiere reinterpretación.

## R2 — Patrón de páginas: como Vehículos, sin `editar.vue`

**Decisión**: `index.vue` (listado con filtros), `nuevo.vue` (formulario de captura),
`[id]/index.vue` (detalle de solo lectura + acción cancelar + reemplazo de factura). **Sin**
`[id]/editar.vue` — no existe ninguna edición posible sobre una carga ya guardada (FR-008), a
diferencia de Vehículos/Conductores/Proveedores.

**Por qué**: la feature tiene un formulario de captura no trivial (validación de odómetro,
autocálculo de costo total con override, adjunto opcional) que no cabe bien en un modal, y una
vista de detalle es necesaria para mostrar el historial de facturas y la acción de cancelar —
mismo criterio de "detalle rico → páginas separadas" ya aplicado en Vehículos/Conductores
(a diferencia del patrón modal-en-listado de Catálogos Base/Catálogos Base II).

**Alternativas consideradas**: modal en listado (como Proveedores/Productos) — rechazado porque
el formulario de captura es más largo (7 campos + archivo + validación cruzada de odómetro) y
porque cancelar + ver historial de factura necesitan su propia vista, no un modal encima del
listado.

## R3 — Factura "con historial": mismo patrón que póliza/licencia, sin tabla nueva

**Decisión**: reutiliza `public.archivos` tal cual (`tipo = 'factura'`, ya en el enum
`tipo_archivo` desde la migración inicial — sin cambio de esquema), con
`entidad_tipo = 'carga_combustible'` / `entidad_id = <carga.id>` y el puntero
`cargas_combustible.factura_archivo_id` apuntando siempre a la versión vigente. Cada reemplazo
inserta una fila nueva en `archivos` (nunca sobreescribe ni borra una existente) y actualiza el
puntero — idéntico a `adjuntarPoliza`/`listarHistorialPoliza` de `useVehiculos.ts` y
`adjuntarLicencia` de `useConductores.ts`.

**Por qué**: Clarifications (sesión 2026-08-10) — factura "con historial", mismo patrón ya
construido dos veces. `validarArchivo()` (`app/utils/archivos.ts`, PDF/JPG/PNG, ≤10MB) ya cubre
exactamente el tipo de archivo que pide FR-007 — se reutiliza tal cual, sin variante nueva (a
diferencia de `validarFoto`, que sí necesitó una función propia porque excluye PDF).

**Alternativas consideradas**: ninguna — patrón ya validado dos veces, sin necesidad de
reinterpretarlo.

## R4 — Validación de odómetro: dos capas, sin duplicar lógica de negocio en el cliente

**Decisión**: la UI consulta la última carga activa del vehículo seleccionado
(`select max(odometro) ... where vehiculo_id = ? and estado = 'activo'`, la misma condición que
ya implementa el trigger de R1) para validar *antes* de enviar el formulario y mostrar el mensaje
de error de inmediato (FR-003, US1/AC4). El trigger `private.validar_odometro_creciente()` es el
respaldo real — la UI nunca confía solo en su propia validación.

**Por qué**: constitución §2 — RLS/triggers de BD son la línea de defensa principal, la
validación de cliente es una capa adicional para UX, nunca el único punto de control. Evita
enviar un `insert` que se sabe de antemano que el trigger va a rechazar.

**Alternativas consideradas**: confiar solo en el trigger y mostrar el error de Postgres tal
cual — rechazado por UX (el usuario llenaría todo el formulario antes de enterarse).

## R5 — Selectores de vehículo/proveedor/producto: sin funciones nuevas

**Decisión**: el formulario de captura y el filtro del listado reutilizan
`useVehiculos().listar()` (default `incluirBaja = false`), `useProveedores().listar()` (default
`incluirInactivos = false`) y `useProductos().listar('', 'combustible')` — los tres ya excluyen
lo que FR-004/FR-005 piden por default, sin parámetros nuevos ni funciones dedicadas.

**Por qué**: los tres composables ya resuelven exactamente esta exclusión (Feature 004, 006) —
agregar una función "solo activos" duplicaría lógica ya existente.

**Alternativas consideradas**: una función `listarActivos()` dedicada por catálogo — rechazada,
redundante con el default ya correcto de `listar()`.

## R6 — Permisos en UI: `usePermisos().tienePermiso('combustible', accion)`, ya existente

**Decisión**: el botón "Capturar" se oculta si `!tienePermiso('combustible', 'crear')`; el botón
"Cancelar" del detalle se oculta si `!tienePermiso('combustible', 'cancelar')` (FR-012,
US3/AC4). Sin cambios a `usePermisos.ts` — el módulo `combustible` y sus 3 acciones
(`ver`/`crear`/`cancelar`) ya están sembrados desde la migración inicial, con `ver`+`crear`
otorgados por defecto a todo operario nuevo (spec.md, Assumptions).

**Por qué**: mismo mecanismo ya usado en Vehículos/Conductores/Proveedores para mostrar/ocultar
acciones — la autorización real la hace RLS (`cargas_combustible_update_solo_cancelar`,
`cargas_combustible_insert`), este composable es solo para UI (constitución §2).

## R7 — Sin `server/api/` nuevo

**Decisión**: toda operación pasa por `useSupabaseClient()` directo, protegida por RLS —
mismo patrón que todas las features anteriores.

**Por qué**: no hay ninguna operación que requiera `service_role` ni lógica que no pueda
expresarse como políticas RLS + triggers (constitución §2, §1).

## R8 — Costo total autocalculado con override "hasta el siguiente cambio"

**Decisión**: `computed` reactivo que propone `cantidad * costoUnitario`, más un `ref` de
"override manual" que se activa cuando el usuario edita el campo de costo total directamente y
se **desactiva** (volviendo al autocálculo) en cualquier `watch` sobre `cantidad`/`costoUnitario`
— exactamente la semántica de FR-002/Clarifications sesión 2026-08-10: el valor manual "pega"
hasta el siguiente cambio de esos dos campos, nunca más allá.

**Por qué**: es la única interpretación de la clarificación que no requiere guardar estado en
servidor — se resuelve enteramente en el formulario, con el valor final (autocalculado o manual)
viajando en el `insert` como cualquier otro campo.

**Alternativas consideradas**: recalcular siempre e ignorar la edición manual — rechazado,
contradice explícitamente FR-002. Congelar el valor manual permanentemente una vez editado —
rechazado, contradice la clarificación (el override solo "pega" hasta el siguiente cambio de
cantidad/costo unitario).

## R9 — Filtros del listado (vehículo, rango de fechas, proveedor, estado)

**Decisión**: filtros combinables vía `.eq()`/`.gte()`/`.lte()` encadenados sobre la misma query
base de `listar()`, aplicados en el cliente vía parámetros del composable
(`listar({ vehiculoId?, fechaDesde?, fechaHasta?, proveedorId?, estado? })`) — sin filtros nuevos
a nivel de RLS (la política `cargas_combustible_select` ya cubre el alcance por empresa/permiso;
los filtros de esta feature son solo de presentación).

**Por qué**: no hay ningún filtro de FR-010 que dependa de una regla de autorización — son
recortes de conveniencia sobre datos que el usuario ya puede ver en su totalidad.

## R10 — Reutilización de `TablaCatalogo.vue`: no aplica

**Decisión**: el listado de cargas de combustible **no** reutiliza `TablaCatalogo.vue` — usa su
propia tabla con la fila de filtros (vehículo/fechas/proveedor/estado) en vez del único buscador
de texto que `TablaCatalogo.vue` expone, pero sí replica su patrón de paginación cliente
(selector "Filas por página" 5/10/20, default 10, `v-pagination` con el mismo estilo — ver
`docs/design-system.md`, sección "Pagination") para mantener consistencia visual.

**Por qué**: `TablaCatalogo.vue` está diseñado para un único campo de búsqueda de texto; esta
feature necesita 4 filtros independientes y combinables, que no encajan en ese slot.

## R11 — Auditoría: función dedicada `private.audit_cargas_combustible()`, no genérica

**Decisión**: `cargas_combustible` recibe su propia función de auditoría (mismo criterio que
`private.audit_vehiculos()`, no `private.audit_catalogo()`/`private.audit_empresas_usuarios()`):
`accion = 'crear'` en `INSERT`; en `UPDATE`, `accion = 'cancelar'` cuando `old.estado` es distinto
de `new.estado` (la única transición posible, `activo → cancelado`), y `accion = 'editar'` en
cualquier otro `UPDATE` (en la práctica, solo el reemplazo de `factura_archivo_id` mientras el
registro sigue activo — FR-009). Se crea junto con el resto de la migración de esta feature
(`docs/schema-reference/schema_09_combustible_ajustes.sql` no la incluye — hay que agregarla).

**Por qué**: `/speckit-analyze` sobre esta feature (hallazgo A1) detectó que ninguna migración
existente crea `trg_cargas_combustible_auditoria` — a diferencia de **todas** las demás tablas de
negocio del proyecto (`vehiculos`, `conductores`, `proveedores`, `productos`,
`asignaciones_conductor_vehiculo`, etc., cada una con su propio trigger de auditoría), esta tabla
quedó sin ninguno desde la migración inicial. Constitución §2 exige bitácora para toda
creación/edición/cancelación — sin este trigger, ninguna carga de combustible ni su cancelación
quedaría auditada. `audit_catalogo()`/`audit_empresas_usuarios()` no aplican tal cual porque
ninguna interpreta la columna `estado` (`activo`/`cancelado`) de esta tabla — mismo motivo por el
que `vehiculos` (columna `baja`, semántica distinta) tampoco reutiliza esas dos.

**Alternativas consideradas**: reutilizar `private.audit_catalogo()` (genérica, sin semántica de
estado) — rechazada porque registraría la cancelación como `accion = 'editar'` a secas, rompiendo
el mismo criterio de trazabilidad ya establecido para `desactivar`/`reactivar` en
Vehículos/Conductores/Proveedores (`/speckit-analyze` hallazgo E1 sobre Feature 004, ya aplicado
desde entonces).
