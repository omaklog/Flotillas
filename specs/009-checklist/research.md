# Research: Checklist de Aditamentos y Revisión de Seguridad

## R1 — Migración pendiente: `schema_11` + auditoría genérica (sin funciones dedicadas)

**Decisión**: Esta feature aplica una sola migración nueva con el contenido literal de
`docs/schema-reference/schema_11_checklist_plantillas.sql` (tabla `checklist_item_plantillas`,
acciones `editar`/`eliminar` del módulo `checklist`, columna `conductor_id` en `checklists`,
columnas `es_critico`/`plantilla_item_id` en `checklist_items`) más 3 triggers de auditoría
reutilizando `private.audit_catalogo()` **genérica** — sin funciones dedicadas nuevas, a
diferencia de Combustible/Mantenimiento.

**Por qué**: verificado con `grep` — ninguna migración crea un trigger de auditoría para
`checklists`/`checklist_items`/`checklist_item_plantillas`; las 3 quedarían sin bitácora si no se
agrega aquí (mismo patrón de brecha ya encontrado y corregido en Combustible/Mantenimiento). A
diferencia de esas 2 tablas, ninguna de las 3 de esta feature tiene una columna `estado` con
semántica de transición que distinguir (`checklists`/`checklist_items` son puramente
insert-only — RLS ya bloquea todo `UPDATE`/`DELETE` con `using (false)`; `checklist_item_plantillas`
no tiene ninguna columna de estado tipo activo/baja) — `private.audit_catalogo()` (genérica,
`accion = 'crear'`/`'editar'`/`'eliminar'` según `tg_op`) es exactamente lo que ya se usa para
`tipos_vehiculo`/`aseguradoras`/`productos`/`asignaciones_conductor_vehiculo`, sin necesidad de
reinterpretar ninguna columna.

**Alternativas consideradas**: función dedicada como `audit_vehiculos()`/
`audit_cargas_combustible()` — rechazada, no hay ninguna transición de estado que distinguir en
ninguna de las 3 tablas de esta feature.

## R2 — Permiso real de escritura de la plantilla: `'editar'` cubre también eliminar

**Decisión**: la UI gatea **todas** las acciones de escritura sobre `checklist_item_plantillas`
(alta, edición, **y eliminación**) con `usePermisos().tienePermiso('checklist', 'editar')` — no
con `'eliminar'`.

**Por qué**: `schema_11` agrega la acción `'eliminar'` al catálogo de `acciones_disponibles`,
pero la única política de escritura (`checklist_item_plantillas_write`, `for all`) verifica
únicamente `tiene_permiso('checklist','editar')` — otorgar solo `'eliminar'` sin `'editar'` no
habilitaría ningún `DELETE` a nivel de RLS. Gatear el botón de eliminar en la UI por `'eliminar'`
en vez de `'editar'` produciría un mismatch real (botón visible pero el `DELETE` se rechaza, o
viceversa según a quién se le otorgue qué). `spec.md` (Actor) dice "permiso `editar`/`eliminar`
explícito" en sentido coloquial ("hay que otorgarle algo, no viene por defecto"), no como dos
permisos independientes con efecto distinto — la única acción real que un admin necesita
otorgar es `'editar'`.

**Alternativas consideradas**: gatear eliminar con `'eliminar'` tal cual sugiere la lectura
literal de `spec.md` — rechazada tras verificar la política RLS real, produciría un botón que no
funciona para un operario al que solo se le otorgó `'eliminar'`.

## R3 — Ubicación de la pantalla de gestión de plantilla: página propia, no una pestaña de Tipos de Vehículo

**Decisión**: `/admin/checklist/plantilla` — página propia con un selector de tipo de vehículo
arriba y, debajo, el patrón "modal en listado" (Catálogos Base, 002) ya validado, con los ítems
de plantilla del tipo seleccionado.

**Por qué**: el brief de esta feature sugiere "podría vivir dentro del detalle de cada Tipo de
Vehículo... como una pestaña", pero `admin/tipos-vehiculo/` **no tiene ninguna página de
detalle** — Catálogos Base (002) implementó Tipos de Vehículo con el patrón modal-en-listado
puro (`index.vue` únicamente, sin `[id]/index.vue`), igual que Aseguradoras y Permisos. Construir
una vista de detalle nueva para Tipos de Vehículo solo para alojar esta pestaña sería un cambio
de alcance sobre una feature ya cerrada (002) no pedido explícitamente. Una página propia dentro
del módulo Checklist logra lo mismo (gestión de ítems por tipo de vehículo) sin tocar Catálogos
Base.

**Alternativas consideradas**: agregar `[id]/index.vue` a Tipos de Vehículo con pestañas — 
rechazada, fuera de alcance de esta feature y de mayor complejidad que lo que el problema
requiere.

## R4 — Composable dedicado para la plantilla, no extensión de `useCatalogo.ts`

**Decisión**: `useChecklistPlantillas.ts` dedicado, no una extensión de `useCatalogo.ts`
(Catálogos Base).

**Por qué**: `useCatalogo<Tabla>` (research.md R5 de 002) solo soporta búsqueda de texto libre
sobre toda la tabla, sin un filtro fijo adicional — esta feature necesita listar ítems **de un
solo tipo de vehículo a la vez** (`.eq('tipo_vehiculo_id', ...)`), algo que el composable
genérico no expone. Mismo criterio ya aplicado repetidas veces en este proyecto: una dimensión de
filtrado adicional no cubierta por el CRUD genérico justifica un composable propio.

## R5 — Patrón de páginas de captura/listado: como Combustible/Mantenimiento, sin `editar.vue`

**Decisión**: `/admin/checklist/nuevo.vue` (captura), `/admin/checklist/[id]/index.vue`
(detalle), `/admin/checklist/index.vue` (listado). Sin `[id]/editar.vue` ni ninguna acción de
cancelar — a diferencia de Combustible/Mantenimiento, esta feature no tiene absolutamente
ninguna transición de estado posterior a la captura (FR-010: ni edición, ni cancelación, ni
borrado).

**Por qué**: mismo razonamiento que Combustible/Mantenimiento (research.md R2 de ambos) — la
captura (selector de vehículo, conductor autocompletado editable, N ítems fijos de la plantilla,
resultado general) y el detalle (ítems con su estado) son demasiado ricos para un modal.

## R6 — Ítems de la captura: fijos por la plantilla, no agregados por el usuario

**Decisión**: a diferencia de las líneas de Mantenimiento (el usuario agrega/quita líneas
libremente), aquí el formulario de captura renderiza automáticamente **una fila por cada ítem
activo de la plantilla** del tipo de vehículo seleccionado, en su orden — el usuario no agrega ni
quita ítems, solo marca cumple/no cumple y captura observaciones donde aplique.

**Por qué**: `spec.md` FR-007 dice "por cada ítem de la plantilla" — no hay ninguna historia de
usuario que permita capturar un ítem fuera de la plantilla o saltarse uno. Esto simplifica la UI
respecto a Mantenimiento: sin botones "Agregar/quitar línea", solo una lista fija que se puebla
al seleccionar el vehículo (vía su `tipo_vehiculo_id`).

## R7 — Conductor autocompletado: lectura directa de la asignación activa, sin función nueva

**Decisión**: al seleccionar un vehículo, el formulario consulta
`asignaciones_conductor_vehiculo` filtrando `vehiculo_id` y `fecha_fin is null`
(`.maybeSingle()`, nunca puede haber más de una fila por el índice único parcial de Feature 005)
y precarga `conductor_id` si existe — el campo queda editable, sin ninguna función de composable
nueva más allá de una consulta directa.

**Por qué**: la garantía de "como máximo una asignación activa por vehículo" ya la impone
`uq_asignacion_vehiculo_activa` (Feature 005) — no hace falta desambiguar entre varias ni crear
lógica de negocio adicional.

## R8 — Captura de checklist + ítems: `insert` en 2 pasos, mismo patrón de reintento que Mantenimiento

**Decisión**: igual que Mantenimiento (research.md R13 de 008): `crear(valores, itemsRespuesta)`
inserta primero el `checklist`, luego todos sus `checklist_items` en un solo `insert` masivo. Si
el segundo paso falla, el composable devuelve el error junto con el `id` del checklist ya creado
para poder reintentar (`reintentarItems`), sin duplicar el checklist padre.

**Por qué**: mismo riesgo de atomicidad que Mantenimiento — 2 llamadas de cliente sin
transacción, sin precedente de función RPC en el proyecto (research.md R13 de 008, mismas
razones).

## R9 — Filtros del listado (vehículo, rango de fechas, resultado, conductor): sin `TablaCatalogo.vue`

**Decisión**: tabla propia con filtros combinables, mismo criterio que Combustible/Mantenimiento
(research.md R10 de ambos) — `TablaCatalogo.vue` solo expone un buscador de texto único, esta
feature necesita 4 filtros independientes.

## R10 — Selectores de vehículo/producto: reutilización sin funciones nuevas, mismo riesgo de límite de filas ya conocido

**Decisión**: el selector de vehículo reutiliza `useVehiculos().listar()` (default
`incluirBaja=false`, excluye dados de baja — FR-003/FR-009 de spec.md). Igual que
Combustible/Mantenimiento, esta consulta trae **todos** los vehículos de la empresa sin límite
explícito — el mismo riesgo del límite de 1000 filas de PostgREST sobre la "Empresa E2E"
compartida (encontrado durante Combustible) aplica aquí; los tests de captura MUST usar una
empresa aislada por test, mismo criterio ya establecido.

## R11 — Sin desglose de la marca "es crítico" en la lógica de captura

**Decisión**: `es_critico` se copia del ítem de plantilla al ítem de checklist (FR-008) y se
muestra como un dato informativo en la captura/detalle, pero no condiciona ningún campo, validación
ni cálculo — el resultado general sigue siendo 100% manual (spec.md, "Fuera de Alcance").

**Por qué**: evita la tentación de implementar parcialmente la regla de aprobación automática que
`spec.md` explícitamente excluye del alcance de esta feature.
