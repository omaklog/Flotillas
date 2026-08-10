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

Proyecto de origen en Stitch: `projects/4499192746969655413` ("FleetControl Enterprise").
