# Research: Bitácora de Servicios Obligatorios

## R1 — Esquema base ya casi completo; único cambio pendiente es el tipo de archivo

**Decision**: La tabla `servicios_obligatorios`, el enum `tipo_servicio_obligatorio` (3 valores),
sus índices, y su RLS (`_select`/`_write`, ya con el patrón `tiene_permiso()` — ver R2) existen
desde `20260806044218_initial_schema.sql` y fueron refinados por
`20260806044220_modulos_y_permisos.sql`/`20260806044221_permisos_ver_y_defaults.sql`. Lo único
que falta aplicar es `docs/schema-reference/schema_12_tipo_archivo_testigo.sql`: agrega el valor
`testigo_servicio` al enum `tipo_archivo`, para poder subir el comprobante.

**Rationale**: Evita releer todo el esquema como si esta feature partiera de cero — el trabajo de
Foundational es mínimo comparado con 007/008/009 (que sí agregaron tablas nuevas).

**Alternatives considered**: Ninguna — es un hecho verificable, no una decisión de diseño.

## R2 — Quirk de RLS: la única acción que realmente desbloquea escritura es `'editar'`

**Decision**: `acciones_disponibles` lista 4 acciones para `servicios_obligatorios`
(`ver`/`crear`/`editar`/`eliminar`), pero la única política de escritura
(`servicios_obligatorios_write`, `for all`, en `schema_02_permisos.sql`) verifica **únicamente**
`tiene_permiso('servicios_obligatorios','editar')` — no existe ninguna política `_insert` o
`_delete` dedicada que revise `'crear'` o `'eliminar'` por separado (a diferencia de
Combustible/Mantenimiento, que sí separan `crear` de `cancelar` en políticas distintas). En la
práctica: otorgarle a un operario solo `'crear'` o solo `'eliminar'` **no le da ningún acceso de
escritura real** — solo `'editar'` lo hace. La UI MUST gatear las 3 acciones (registrar/editar/
eliminar, US-10.1/US-10.3) con `tienePermiso('servicios_obligatorios','editar')`, no con
`'crear'`/`'eliminar'` como sus nombres sugerirían.

**Rationale**: Mismo patrón exacto ya encontrado en Checklist (research.md R2 de 009,
`checklist_item_plantillas`) — evitar el mismatch real entre lo que la UI ofrece y lo que RLS
permite habría producido un botón visible que falla silenciosamente. `acciones_disponibles`
sigue listando las 4 acciones (son datos de catálogo usados también por la pantalla de gestión de
permisos para mostrarlas como opciones seleccionables al admin), pero solo `'editar'` tiene efecto
real en este módulo.

**Alternatives considered**: Modificar la política RLS para separar `insert`/`update`/`delete`
como en Combustible/Mantenimiento — rechazado: es un cambio de esquema no solicitado por la
especificación (que no distingue niveles de escritura, a diferencia de "capturar" vs "cancelar"),
y tocar una política ya aplicada en producción sin necesidad real aumenta el riesgo sin beneficio
para esta feature.

## R3 — Falta un trigger de auditoría para `servicios_obligatorios`

**Decision**: Ninguna migración aplicada le agrega un trigger de auditoría a
`servicios_obligatorios` — mismo hallazgo que Combustible/Mantenimiento/Checklist tuvieron que
corregir. Esta feature agrega `trg_servicios_obligatorios_auditoria` reutilizando
`private.audit_catalogo()` (genérica, ya existente) desde Foundational, no como corrección
posterior. No hace falta una función dedicada: a diferencia de `cargas_combustible`/
`mantenimientos` (que distinguen `'crear'`/`'cancelar'`/`'editar'` por una columna `estado`),
`servicios_obligatorios` no tiene estado — sus únicas transiciones son
`crear`/`editar`/`eliminar`, que `audit_catalogo()` ya mapea directo desde `TG_OP`.

**Rationale**: Aplicar la lección de 007/008/009 desde el inicio, no redescubrirla.

**Alternatives considered**: Ninguna.

## R4 — Comprobante sin historial de versiones (a diferencia de la póliza de Vehículos)

**Decision**: `servicios_obligatorios.archivo_id` es un único FK nullable a `archivos` — no una
relación uno-a-muchos. `adjuntarComprobante(servicioId, archivo)` sube el archivo nuevo, lo
vincula, y si ya había uno anterior lo borra (de `archivos` y de Storage) **después** de que el
nuevo ya quedó vinculado exitosamente — mismo patrón que `adjuntarFoto()` de
`useVehiculos.ts`/`useConductores.ts` ("sin historial"), no el patrón de `adjuntarPoliza()`/
`adjuntarFactura()` ("con historial", que mantiene todas las versiones anteriores navegables).

**Rationale**: Cada fila de `servicios_obligatorios` ya es, por diseño (Edge Cases de spec.md),
un evento independiente — una renovación nueva es una fila nueva, no una versión sobre la misma
fila. El comprobante de una fila corresponde a ESE evento puntual; no hay ningún escenario de
negocio descrito en spec.md donde un mismo servicio necesite conservar comprobantes históricos
distintos (a diferencia de la póliza de un vehículo, que sí se renueva "in place" sobre la misma
fila de vehículo).

**Alternatives considered**: Patrón "con historial" como póliza — rechazado por lo anterior; sería
complejidad sin ningún caso de uso que la spec pida.

## R5 — Páginas propias, sin `server/api/` nuevo

**Decision**: Mismo criterio que Combustible/Mantenimiento/Checklist — todo el acceso a datos va
directo por `useSupabaseClient()` desde un composable dedicado `useServiciosObligatorios.ts`,
protegido por RLS (ya completa, R1/R2). Páginas: listado con filtros (US-10.2), formulario de
registro (US-10.1) y de edición (US-10.3, comparten `FormularioServicioObligatorio.vue`), detalle
de solo lectura.

**Rationale**: Consistencia con el resto del proyecto; no hay ninguna operación que requiera
lógica de servidor (a diferencia de invitar operarios, que sí usa `server/api/` para enviar
correo).

**Alternatives considered**: Ninguna — mismo patrón ya establecido, sin motivo para desviarse.

## R6 — Formulario de registro y de edición comparten componente

**Decision**: A diferencia de Checklist (inmutable, sin edición) y de Combustible/Mantenimiento
(edición no existe, solo cancelación), esta feature SÍ tiene edición libre de todos los campos
(FR-006). Un único `FormularioServicioObligatorio.vue` sirve para alta y edición, recibiendo un
`registro?` opcional (mismo patrón ya usado en `FormularioTipoVehiculo.vue`/
`FormularioItemPlantilla.vue` de Checklist), en vez de duplicar el formulario en dos componentes.

**Rationale**: Evita duplicación — los campos y validaciones (FR-001, FR-003, FR-004) son
idénticos entre alta y edición.

**Alternatives considered**: Formularios separados como Combustible/Mantenimiento (que no tienen
edición real, solo cancelación con un formulario de captura distinto al de cancelar) — no aplica
aquí porque no hay asimetría de campos entre registrar y editar.

## R7 — Indicador de vigencia: mismo umbral y colores que la póliza de Vehículos

**Decision**: Reutilizar exactamente la lógica de `estadoPoliza()` de
`app/pages/admin/vehiculos/index.vue` (`UMBRAL_POR_VENCER_DIAS = 60`, colores
`success`/`warning`/`error`) para calcular la vigencia de un servicio obligatorio a partir de
`fecha_vencimiento` — la vigencia se calcula en el cliente al renderizar, no se almacena en BD
(spec.md, Key Entities).

**Rationale**: Es el criterio visual explícito que pide la especificación ("mismo criterio visual
que pólizas y licencias"); reutilizar la función evita reinventar el umbral en un tercer lugar del
código (vehículos ya lo usa para pólizas).

**Alternatives considered**: Ninguna — la especificación ya fija el criterio.

## R8 — Selector de vehículo: mismo riesgo de PostgREST ya documentado

**Decision**: El formulario de registro/edición carga todos los vehículos activos de la empresa
sin paginar (mismo patrón que Combustible/Mantenimiento/Checklist) — mismo riesgo del límite de
1000 filas de PostgREST ya encontrado en Combustible (research.md R10 de 007). Los tests de
captura MUST usar una empresa aislada por test (`crearEmpresaConAdmin`), no la sesión compartida
`admin-e2e`.

**Rationale**: Aplicar la lección ya aprendida, no redescubrirla.

**Alternatives considered**: Ninguna.
