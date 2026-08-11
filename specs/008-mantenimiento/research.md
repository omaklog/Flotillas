# Research: Mantenimiento (Correctivo y Preventivo)

## R1 — Migración pendiente: `schema_10` + auditoría dedicada (no separarlo en 2 pasos)

**Decisión**: Esta feature aplica una sola migración nueva que combina el contenido literal de
`docs/schema-reference/schema_10_mantenimiento_ajustes.sql` (`mantenimiento_detalles.cantidad`,
`mantenimientos.motivo_cancelacion`, trigger de inmutabilidad propio
`private.solo_permite_cancelar_mantenimiento()`) **más** un trigger de auditoría dedicado que
`schema_10` no incluye — construido desde el inicio, no descubierto después vía
`/speckit-analyze` como pasó en Combustible (007, hallazgo A1).

**Por qué**: verificado con `grep` sobre las migraciones aplicadas — ninguna crea
`trg_mantenimientos_auditoria` ni `trg_mantenimiento_detalles_auditoria`; `mantenimientos` es,
junto con `cargas_combustible` (ya resuelto en 007 R11), la única tabla de negocio del proyecto
sin auditoría. Constitución §2 exige bitácora para toda creación/edición/cancelación — esta
feature cierra esa brecha para `mantenimientos` en la misma migración que agrega el resto de sus
columnas, en vez de en dos pasos.

**Alternativas consideradas**: aplicar `schema_10` tal cual y dejar la auditoría para una
corrección posterior (como ocurrió en 007) — rechazada; ya se identificó el patrón del error, no
tiene sentido repetirlo a sabiendas.

## R2 — Patrón de páginas: como Combustible, sin `editar.vue`

**Decisión**: `index.vue` (listado con filtros), `nuevo.vue` (formulario de captura multi-línea),
`[id]/index.vue` (detalle de solo lectura con todas las líneas + acción cancelar + reemplazo de
factura). **Sin** `[id]/editar.vue` — ninguna edición posible sobre una orden ya guardada
(FR-010), mismo criterio que Combustible.

**Por qué**: mismo razonamiento que Combustible (007, research.md R2) — captura no trivial
(múltiples líneas condicionales según tipo de producto) y detalle rico (historial de factura,
listado de líneas, cancelar) no caben en un modal.

## R3 — Factura "con historial": mismo patrón que Combustible/póliza/licencia

**Decisión**: reutiliza `public.archivos` tal cual (`tipo = 'factura'`, ya en el enum
`tipo_archivo`), con `entidad_tipo = 'mantenimiento'` / `entidad_id = <mantenimiento.id>` y el
puntero `mantenimientos.factura_archivo_id` apuntando a la versión vigente. Idéntico a
`adjuntarFactura` de Combustible (007, research.md R3), solo cambiando `entidad_tipo`.

**Por qué**: Decisiones confirmadas del spec — "El adjunto de factura puede reemplazarse aunque
el registro siga activo (misma excepción a la inmutabilidad que en Combustible)". Patrón ya
construido 3 veces (póliza, licencia, factura de Combustible) — replicar, no reinventar.

## R4 — Sin validación cruzada de kilometraje (a diferencia del odómetro de Combustible)

**Decisión**: `mantenimiento_detalles.llanta_kilometraje` se captura como dato informativo de la
línea, sin ninguna validación contra un historial (ni del propio vehículo ni de Combustible).

**Por qué**: spec.md (Fuera de Alcance, Assumptions) lo excluye explícitamente — a diferencia de
Combustible, donde el odómetro creciente es una regla de negocio central (FR-003 de 007), aquí no
se pidió ninguna regla equivalente y no existe una fuente de kilometraje con la que cruzarlo
dentro de este alcance.

## R5 — Selectores de vehículo/proveedor/producto: sin funciones nuevas

**Decisión**: el formulario de captura y el filtro del listado reutilizan
`useVehiculos().listar()` (default `incluirBaja = false`), `useProveedores().listar()` (default
`incluirInactivos = false`) para vehículo/proveedor. El selector de producto de cada línea usa
`useProductos().listar()` **sin** filtro de tipo a nivel de composable — se filtra en el
formulario excluyendo `tipo === 'combustible'` (research.md R12), ya que a diferencia de
Combustible (un único tipo de producto permitido), aquí se permiten 4 de los 5 tipos.

**Por qué**: mismo criterio que Combustible (007, research.md R5) — los 3 composables ya resuelven
la exclusión de inactivos que FR-002 pide, sin funciones dedicadas nuevas.

## R6 — Permisos en UI: `usePermisos().tienePermiso('mantenimiento', accion)`, ya existente

**Decisión**: el botón "Capturar" se oculta si `!tienePermiso('mantenimiento', 'crear')`; el
botón "Cancelar" del detalle se oculta si `!tienePermiso('mantenimiento', 'cancelar')` (FR-015).
Sin cambios a `usePermisos.ts` — el módulo `mantenimiento` y sus 3 acciones
(`ver`/`crear`/`cancelar`) ya están sembrados desde la migración inicial, con `ver`+`crear`
otorgados por defecto a todo operario nuevo (spec.md, Assumptions).

**Por qué**: mismo mecanismo ya usado en Vehículos/Conductores/Proveedores/Combustible — la
autorización real la hace RLS (`mantenimientos_update_solo_cancelar`,
`mantenimientos_insert`/`mantenimiento_detalles_insert`), este composable es solo para UI
(constitución §2).

## R7 — Sin `server/api/` nuevo

**Decisión**: toda operación pasa por `useSupabaseClient()` directo, protegida por RLS — mismo
patrón que todas las features anteriores. Sin funciones RPC de Postgres nuevas (ver R13, que
resuelve el riesgo de atomicidad de otra forma).

**Por qué**: no hay ninguna operación que requiera `service_role` ni lógica que no pueda
expresarse como políticas RLS + triggers + 2 llamadas de cliente en secuencia (constitución §2,
§1).

## R8 — Costo total: campo simple, sin autocálculo (a diferencia de Combustible)

**Decisión**: `costo_total` es un `v-text-field` numérico simple, capturado directamente por el
usuario, sin ningún cálculo derivado de las líneas ni de ningún otro campo.

**Por qué**: Decisiones confirmadas del spec — "así lo pidió el documento original ('sin
desglose de impuestos')"; a diferencia de Combustible, donde `cantidad × costo_unitario` existe a
nivel de una sola línea, aquí no hay costo unitario por línea que sumar — no aplica ningún
patrón de override/autocálculo (contraste explícito con Combustible, research.md R8 de 007).

## R9 — Filtros del listado (vehículo, tipo, rango de fechas, proveedor, estado)

**Decisión**: filtros combinables vía `.eq()`/`.gte()`/`.lte()` encadenados
(`listar({ vehiculoId?, tipo?, fechaDesde?, fechaHasta?, proveedorId?, estado? })`), mismo
patrón que `useCargasCombustible().listar()` (007, research.md R9) más el filtro adicional de
`tipo` (correctivo/preventivo) que Combustible no tiene.

**Por qué**: ningún filtro de FR-012 depende de una regla de autorización — son recortes de
conveniencia sobre datos que el usuario ya puede ver en su totalidad, vía RLS
(`mantenimientos_select`).

## R10 — Reutilización de `TablaCatalogo.vue`: no aplica

**Decisión**: el listado de órdenes de mantenimiento **no** reutiliza `TablaCatalogo.vue` — misma
razón que Combustible (007, research.md R10): necesita 5 filtros independientes (vehículo, tipo,
fechas, proveedor, estado), no un único buscador de texto. Sí replica el patrón visual de
paginación cliente (5/10/20, default 10 — `docs/design-system.md`).

## R11 — Auditoría: `private.audit_mantenimientos()` dedicada; `mantenimiento_detalles` reutiliza `audit_catalogo()`

**Decisión**: `mantenimientos` recibe una función dedicada (mismo criterio que
`private.audit_vehiculos()`/`private.audit_cargas_combustible()` de Combustible, research.md R11
de 007 — no genérica, porque interpreta la columna `estado`): `accion = 'crear'` en `INSERT`,
`'cancelar'` en `UPDATE` cuando `estado` cambia a `cancelado`, `'editar'` en cualquier otro
`UPDATE` (reemplazo de factura). `mantenimiento_detalles` reutiliza
`private.audit_catalogo()` (genérica) — sin semántica de estado propia, y sus políticas RLS ya
bloquean `UPDATE`/`DELETE` (`using (false)`), así que en la práctica solo audita `INSERT`.

**Por qué**: `mantenimiento_detalles_no_update`/`mantenimiento_detalles_no_delete` (`using
(false)`) confirman que esa tabla solo recibe inserciones — no necesita distinguir transiciones
de estado como sí lo necesita `mantenimientos`.

## R12 — Mapeo de categoría de línea → `productos.tipo`

**Decisión**: las 4 categorías de línea que el spec nombra ("Servicio, Producto, Llanta o
Refacción") mapean al enum `tipo_producto` (`refaccion`\|`combustible`\|`servicio`\|`llanta`\|
`consumible`) así: Servicio → `servicio`, Llanta → `llanta`, Refacción → `refaccion`, **Producto**
→ `consumible` (el enum no tiene un valor literal `'producto'` — `consumible` es la única
categoría restante tras excluir `combustible`, que spec.md excluye explícitamente). El campo
condicional que se muestra por línea (llanta/servicio/cantidad) se decide por el `tipo` del
producto seleccionado, consultado vía `useProductos().listar()`, no por un campo propio de la
línea.

**Por qué**: sin esta decisión explícita, "Producto" en el spec queda ambiguo contra el esquema
real — verificado directamente contra `create type tipo_producto as enum (...)` en la migración
inicial.

## R13 — Captura multi-línea: orden primero, líneas en un solo `insert` masivo; sin RPC nueva

**Decisión**: `crear(valores, lineas[])` hace 2 llamadas en secuencia: (1)
`insert` de la orden, obteniendo su `id`; (2) un único `insert` masivo (`insert([...])`, un array
de filas) de todas las líneas con ese `mantenimiento_id` — atómico como sentencia SQL individual
(todas las líneas se insertan o ninguna). Si el paso (2) falla (raro — la validación de cliente ya
impide el caso común de una lista vacía, FR-004/US1 AC6), la orden queda creada sin líneas; el
formulario captura ese error específico y ofrece reintentar el `insert` de líneas contra la misma
orden ya creada, en vez de silenciarlo como se hace con la factura opcional (FR-018) — a
diferencia de la factura, las líneas no son opcionales, el usuario MUST enterarse y poder
corregirlo de inmediato.

**Por qué**: no existe ningún precedente de función RPC de Postgres invocada desde el cliente en
este proyecto (`grep` sobre todos los composables) — introducir una function nueva solo para
envolver estos 2 `insert` en una transacción sería la primera vez que se rompe ese patrón
establecido, y la constitución prioriza simplicidad operativa (§1) para un equipo de un
desarrollador. El caso de fallo parcial es infrecuente (solo tras pasar la validación de cliente)
y tiene una salida clara sin necesitar infraestructura nueva.

**Alternativas consideradas**: función RPC (`security invoker`) que inserte orden + líneas en una
sola transacción de servidor — rechazada por ahora, sin precedente en el proyecto y complejidad
no justificada por la frecuencia del caso de fallo; queda documentada aquí como opción futura si
este patrón de fallo resulta más frecuente de lo esperado en producción.
