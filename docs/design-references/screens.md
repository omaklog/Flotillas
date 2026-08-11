# Pantallas de referencia (Stitch)

Capturas generadas por Stitch para el proyecto `FleetControl Enterprise`
(`projects/4499192746969655413`), descargadas el 2026-08-05 y guardadas
localmente porque las URLs originales de Google (`lh3.googleusercontent.com`)
son firmadas y pueden expirar. Usar como referencia visual al escribir
`spec.md`/`plan.md` de cada módulo — no son el layout final, son punto de
partida.

Sigue el mismo lenguaje visual descrito en `../design-system.md`.

| Pantalla | Módulo relacionado | Archivo | Stitch screen ID |
|---|---|---|---|
| Inicio de Sesión | Autenticación | `screens/inicio-sesion.png` | `ece1f0a0552f4c4c844f7130d066acd4` |
| Inicio de Sesión Multitenant | Autenticación (multi-organización) | `screens/inicio-sesion-multitenant.png` | `f86e689ba6e9478aa814c77064edab1d` |
| Dashboard de Flotilla | Reportes / vista general | `screens/dashboard-flotilla.png` | `b3885471039a4a6e98681620adad9bcf` |
| Listado de Flotilla | Vehículos (listado) | `screens/listado-flotilla.png` | `52ec269149ba49518e5fa4fe8f23d6d5` |
| Detalle de Vehículo | Vehículos (detalle) | `screens/detalle-vehiculo.png` | `fa59c93834434c83a09a7acc985c9a6b` |
| Calendario de Mantenimiento | Mantenimiento | `screens/calendario-mantenimiento.png` | `d4634bd5d2b64662b4571b440102c78b` |
| *(asset de fondo, no es una pantalla)* | — | `screens/asset-login-background.jpg` | `96580f59b89740b98be207277fcea262` |
| Listado de Operarios | Usuarios (US5/US9, `admin/usuarios/index.vue`) | `screens/listado-operarios.png` | `875c09687a8a456885a6e75bcce169bb` |
| Gestión de Permisos | Permisos (US6, `admin/permisos/[id].vue`) | `screens/gestion-permisos.png` | `68461028366941c1bd3232c07cbeaeaf` |
| Configuración de la Empresa | Configuración (US4, `admin/configuracion.vue`) | `screens/configuracion-empresa.png` | `0b536648558c49b69713fe6bf6aaf3cc` |
| Administración de Catálogos | Catálogos Base (002, hub — referencia de patrón, no de contenido literal) | `screens/administracion-catalogos.png` | `4ef14f0eca2f46cfa61629f1c2c8aec5` |
| Detalle de Catálogo: Marcas y Modelos | Catálogos Base (002, `admin/tipos-vehiculo`, `admin/aseguradoras`, `admin/permisos` — molde de tabla+búsqueda+acciones) | `screens/detalle-catalogo-marcas-modelos.png` | `4c90c0d8d1ed4f03815a8d15257dbec1` |
| Listado de Flotilla de Vehículos | Vehículos (003, `admin/vehiculos/index.vue`) | `screens/listado-flotilla-vehiculos-v2.png` | `c3baa74b234d4bec8de37408d9cc1a33` |
| Gestión de Vehículo: Alta y Edición | Vehículos (003, `admin/vehiculos/nuevo.vue` y `[id].vue`, pestaña de datos — referencia de patrón, no literal) | `screens/gestion-vehiculo-alta-edicion.png` | `fd9fb918cd9e4c8094c7153c47d8d4f5` |
| Detalle de Vehículo: Datos Generales | Vehículos (003, `admin/vehiculos/[id].vue`) | `screens/detalle-vehiculo-datos-generales.png` | `94fd194837ed400598c50cbed163aab0` |
| Detalle de Vehículo: Historial de Pólizas | Vehículos (003, `admin/vehiculos/[id]/index.vue`, pestaña "Historial de Póliza", `components/vehiculos/HistorialPoliza.vue`) | `screens/detalle-vehiculo-historial-polizas.png` | `70e72834d4ee4bd08560b2617249ff35` |
| Detalle de Conductor: Datos Generales | Conductores (004, `admin/conductores/[id]/index.vue`, pestaña "Datos" — actualización posterior "Foto del Conductor", 2026-08-10) | `screens/detalle-conductor-datos-generales.png` | `d3847082278f4718b7436a7868767d58` |
| Listado de Operarios con Paginación | Patrón de paginación de `TablaCatalogo.vue` (compartido por todos los listados de catálogo) y `admin/usuarios/index.vue` | `screens/listado-operarios-paginacion.png` | `f4c2fb8e23004454933ef5d05447c9bc` |

Las 3 anteriores a estas 2 últimas se descargaron el 2026-08-07, vía el workaround de `curl`
directo documentado en `../../CLAUDE.md` § "Design system compliance" (el MCP de Stitch tenía
`tools/list` roto en ese momento). Las 2 últimas (`administracion-catalogos.png`,
`detalle-catalogo-marcas-modelos.png`) se generaron y descargaron el mismo día para Feature 002:
**no** corresponden literalmente a Tipos de Vehículo/Aseguradoras/Permisos (Stitch las generó con
datos de ejemplo genéricos — "Marcas y Modelos", "Toyota"/"Ford"/"Volvo" — y con columnas/filtros
como `Status`/`Origin` que no aplican a esas 3 tablas, que no tienen columna `activo`). Se usan
como referencia de **patrón** (breadcrumb, encabezado + botón "+ Nuevo", buscador + filtros,
tabla con columna de Acciones con editar/eliminar, paginación), no de contenido literal — cada
pantalla real (`tipos-vehiculo`, `aseguradoras`, `permisos`) adapta las columnas a sus propios
campos (`data-model.md`) y omite el filtro de estado.

Las 3 últimas (`listado-flotilla-vehiculos-v2.png`, `gestion-vehiculo-alta-edicion.png`,
`detalle-vehiculo-datos-generales.png`) se generaron y descargaron el 2026-08-08 para Feature 003
(Vehículos), directo en la UI de Stitch por el usuario. **Adaptaciones deliberadas respecto al
mockup, no discrepancias por descuido**: (1) el mockup separa "Datos Generales" y "Seguro y
Póliza" en 2 pestañas distintas dentro del formulario de alta/edición — se combinan en una sola
pestaña "Datos" en la implementación real; el formulario sigue siendo más chico que el del
mockup (sin "Estado Operativo": conductor asignado, ubicación, último mantenimiento — ver (3)) y
no justifica el paso adicional; (2) el listado del mockup muestra filtros por categoría
(Camiones/Vans/Ligeros) y una columna "Próx. Mantenimiento" — fuera de alcance (Mantenimiento 004
no existe todavía); se usa en cambio el badge de vigencia de póliza ya visto en
`listado-flotilla.png`; (3) el detalle del mockup incluye pestañas/tarjetas de "Conductor
Asignado" y "Mantenimiento" — tampoco existen todavía (Conductores, Mantenimiento); se omiten
hasta que esas features se construyan.

**Segunda ronda de `/speckit-clarify` (2026-08-08)**, tras revisar la vista de detalle ya
implementada contra `detalle-vehiculo-datos-generales.png`: la primera versión del detalle de
solo lectura (US-3.7) usaba una sola tarjeta con todos los campos en una cuadrícula uniforme, sin
la agrupación en tarjetas del mockup ("Identificación del Vehículo", "Registro y Seguimiento"), y
omitía VIN/Kilometraje/Combustible/Transmisión asumiéndolos fuera de alcance por descuido, no por
decisión explícita. Corregido: (a) el detalle ahora agrupa en tarjetas siguiendo el mockup
(spec.md FR-026); (b) VIN, kilometraje actual, combustible y transmisión se agregaron como
columnas opcionales de `vehiculos` — son datos intrínsecos del vehículo, a diferencia de
"Conductor Asignado"/"Mantenimiento" (relaciones a entidades que no existen, siguen fuera de
alcance vía (3) arriba).

**`detalle-vehiculo-historial-polizas.png`** se generó y descargó el 2026-08-09, directo en la UI
de Stitch por el usuario, para reemplazar la vista en lista simple (`v-list`) de la pestaña
"Historial de Póliza" por el formato de tabla del mockup. Adaptación deliberada: el mockup
etiqueta las versiones no vigentes como "Vencida" (implica que Stitch conoce la fecha de
vencimiento de cada versión histórica); el modelo de datos real solo guarda
`numero_poliza`/`fecha_vencimiento_poliza` para la póliza vigente del vehículo, no por versión —
las versiones anteriores se etiquetan como "Anterior" en vez de "Vencida" para no afirmar algo que
no se puede verificar. Tampoco se replica la subetiqueta "Póliza Anual 2026-2027" bajo la fecha
(no existe un campo de período por versión). El botón "Subir Nueva Póliza" del mockup sí se
implementó igual: permite reemplazar la póliza directamente desde esta pestaña además de desde
Editar (spec.md FR-011a).

**Feature 004 — Conductores**: no tiene captura propia de Stitch. Reutiliza deliberadamente el
lenguaje visual de `../design-system.md` más los patrones de layout ya construidos y validados en
Vehículos (003) — listado en `v-table` con buscador y badge de vigencia
(`listado-flotilla-vehiculos-v2.png` como referencia de patrón), detalle de solo lectura con
historial de archivo en tabla (acciones "Ver"/"Descargar"/"Subir Nueva Licencia", idéntico al
rediseño de `HistorialPoliza.vue`) — sin generar un mockup pixel-a-pixel nuevo (research.md R10 de
`specs/004-conductores/`). Si en algún punto se genera una referencia real de Stitch para
Conductores, se sigue la regla de `CLAUDE.md` de ajustarse a ella antes de seguir iterando
visualmente.

**Feature 005 — Asignación Conductor-Vehículo**: tampoco tiene captura propia de Stitch.
Reutiliza deliberadamente el lenguaje visual de `../design-system.md` más los patrones de layout
ya construidos en Vehículos (003) y Conductores (004) — pestañas dentro de un detalle ya
existente, historial en tabla — sin generar un mockup nuevo (research.md R8 de
`specs/005-asignacion-conductor-vehiculo/`).

**`detalle-conductor-datos-generales.png`** se generó y descargó el 2026-08-10, directo en la UI
de Stitch por el usuario, para la actualización posterior "Foto del Conductor" sobre Conductores
(004) — especificada e implementada originalmente como Feature 006 independiente, doblada dentro
de 004 el mismo día para no dejar un hueco en la numeración secuencial (ver
`specs/004-conductores/spec.md`, sección "Actualización posterior") — la primera captura propia de
Conductores (004 y Asignación Conductor-Vehículo, 005, no tenían una, ver nota arriba). A
diferencia del patrón ya usado en Vehículos (foto embebida como bloque 240×180 dentro de la
tarjeta de datos/identificación), este mockup separa la pestaña "Datos" en 2 tarjetas: una angosta
a la izquierda con la foto como avatar grande, el nombre completo debajo, y un chip de tipo de
licencia ("Conductor Federal"/"Conductor Local") debajo del nombre; y "Datos del conductor" como
tarjeta ancha a la derecha, sin cambios sobre los campos que ya existían. Se sigue tal cual
(research.md R12 de `specs/004-conductores/`) en vez de reutilizar el patrón de Vehículos, porque
`CLAUDE.md` prioriza la referencia de Stitch específica de la pantalla sobre la consistencia entre
módulos cuando ambas están disponibles.

**Feature 006 — Catálogos Base II (Proveedores + Productos)**: no tiene captura propia de Stitch.
Reutiliza deliberadamente el patrón "modal en listado" ya construido y validado en Catálogos Base
(002, `listado-flotilla.png`/`aseguradoras`/`tipos-vehiculo` — buscador + tabla + formulario en
`v-dialog`, sin páginas de alta/edición/detalle separadas) para ambos catálogos, más el patrón de
activo/inactivo con motivo obligatorio ya construido en Vehículos/Conductores (checkbox "Mostrar
inactivos", chip "Inactivo", diálogo de motivo) para Proveedores — sin generar un mockup nuevo
(research.md R3/R8 de `specs/006-catalogos-base-ii/`).

**`listado-operarios-paginacion.png`** se generó y descargó el 2026-08-10, directo en la UI de
Stitch por el usuario, para corregir el estilo de `v-pagination` — hasta entonces sin `variant`
ni `color` propios, heredando el look plano por defecto de Vuetify. Aplicado a
`TablaCatalogo.vue` (compartido por todos los listados de catálogo, incluidos los de Proveedores/
Productos de Feature 006) y a `admin/usuarios/index.vue` (la única otra pantalla con su propio
`v-pagination`, nombrada explícitamente como referencia en `docs/design-system.md` § Pagination).
Página activa: cuadrado navy sólido (`primary`/`on-primary`) con esquinas redondeadas
(`rounded="lg"`); páginas inactivas, elipsis y flechas prev/next: sin fondo, solo texto/ícono.
Vuetify no permite variantes distintas por botón vía props (`variant` aplica parejo a todos) —
se usa `variant="text"` (deja todo transparente, correcto para todo salvo la activa) más una
regla CSS con `:deep()` dirigida a la clase de estado `.v-pagination__item--is-active` que
`v-pagination` ya agrega, forzando el relleno sólido solo ahí.

**Feature 007 — Combustible**: no tiene captura propia de Stitch (verificado vía `list_screens` —
ninguna pantalla del proyecto menciona "combustible"/"fuel"). Reutiliza 4 referencias ya
descargadas: `gestion-vehiculo-alta-edicion.png` (estructura del formulario de captura),
`detalle-vehiculo-historial-polizas.png` (historial de archivo con versión vigente destacada,
aplicado al historial de factura), `listado-flotilla-vehiculos-v2.png` (listado con fila de
filtros encima de la tabla) y `listado-operarios-paginacion.png` (estilo de paginación, ya
estándar del proyecto) — sin generar un mockup nuevo (research.md R2/R3/R10 de
`specs/007-combustible/`).

**Feature 008 — Mantenimiento (Correctivo y Preventivo)**: no tiene captura/listado propios de
Stitch para captura/listado. `Calendario de Mantenimiento` (`calendario-mantenimiento.png`)
describe una vista de calendario/próximos servicios que pertenece a la feature de
Alertas/Dashboard (spec.md, "Fuera de Alcance") — no se implementa aquí; solo se reutiliza su
estilo de chips de estado/prioridad y el filtro superior. El resto reutiliza las mismas 4
referencias que Combustible (007): `gestion-vehiculo-alta-edicion.png` (formulario de captura
multi-línea), `detalle-vehiculo-historial-polizas.png` (historial de factura),
`listado-flotilla-vehiculos-v2.png` (listado con filtros) y `listado-operarios-paginacion.png`
(paginación) — sin generar mockups nuevos (research.md R2/R3/R10 de `specs/008-mantenimiento/`).

**Feature 009 — Checklist de Aditamentos y Revisión de Seguridad**: no tiene captura propia de
Stitch. Reutiliza `administracion-catalogos.png` (patrón modal-en-listado, para la pantalla de
gestión de plantilla por tipo de vehículo), `gestion-vehiculo-alta-edicion.png` (estructura de
formulario de captura), `listado-flotilla-vehiculos-v2.png` (listado con filtros) y
`listado-operarios-paginacion.png` (paginación) — mismas 4 referencias de estilo que
Combustible/Mantenimiento, sin generar mockups nuevos (research.md R1-R3 de
`specs/009-checklist/`).

**Feature 010 — Bitácora de Servicios Obligatorios**: no tiene captura propia de Stitch. Reutiliza
`gestion-vehiculo-alta-edicion.png` (estructura de formulario de captura/edición, compartido entre
alta y edición — research.md R6 de `specs/010-servicios-obligatorios/`),
`detalle-vehiculo-historial-polizas.png` (patrón de comprobante adjunto + indicador de vigencia,
mismo umbral de 60 días y colores ya usados para pólizas), `listado-flotilla-vehiculos-v2.png`
(listado con fila de filtros) y `listado-operarios-paginacion.png` (paginación) — mismas
referencias de estilo que Combustible/Mantenimiento/Checklist, sin generar mockups nuevos.

Proyecto de origen en Stitch: `projects/4499192746969655413` ("FleetControl Enterprise").
