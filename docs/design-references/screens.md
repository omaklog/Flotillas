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

Proyecto de origen en Stitch: `projects/4499192746969655413` ("FleetControl Enterprise").
