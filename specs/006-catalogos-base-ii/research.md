# Research: Catálogos Base II (Proveedores + Productos)

Feature deliberadamente chica sobre un esquema ya muy conocido — las 2 tablas y su RLS granular
existen completas desde la migración inicial del proyecto (verificado en `spec.md`, Assumptions).
Las únicas decisiones técnicas reales son: qué falta en el esquema, qué patrón de UI reutilizar, y
por qué 2 composables dedicados en vez de extender `useCatalogo.ts`.

## R1 — `proveedores` y `productos` ya existen completos, incluida su RLS granular

**Decision**: no se crea ninguna tabla nueva. `proveedores` (`nombre`, `rfc`, `calle`, `numero`,
`colonia`, `telefono_oficina_1`, `telefono_oficina_2`, `celular`, `correo`) y `productos`
(`nombre`, `tipo` enum `tipo_producto`, `unidad`) existen desde
`20260806044218_initial_schema.sql`. La RLS granular (`ver`/`crear`/`editar`/`eliminar` por
módulo, con `ver` otorgado por defecto a todo operario nuevo) existe desde
`20260806044220_modulos_y_permisos.sql`/`20260806044221_permisos_ver_y_defaults.sql` — mismo
criterio que Vehículos/Conductores (`editar` cubre insert/update/delete combinados a nivel de
política, sin distinguir `crear`/`eliminar` a ese nivel).

**Rationale**: verificado contra el esquema real antes de escribir `spec.md` — no hay trabajo de
esquema salvo lo listado en R2.

**Alternatives considered**: N/A — no hay decisión que tomar, es estado ya dado.

## R2 — Único trabajo de esquema: `schema_08` tal cual + 2 triggers de auditoría reutilizando funciones ya existentes

**Decision**: una sola migración nueva aplica `docs/schema-reference/schema_08_proveedores_activo.sql`
tal cual (`alter table proveedores add column activo boolean not null default true, add column
motivo_baja text check (char_length(motivo_baja) <= 150)`), y agrega:
- `create trigger trg_proveedores_auditoria after insert or update or delete on proveedores for
  each row execute function private.audit_empresas_usuarios();` — misma función ya usada por
  `conductores`/`empresas`/`usuarios` (semántica de `activo` no invertida).
- `create trigger trg_productos_auditoria after insert or update or delete on productos for each
  row execute function private.audit_catalogo();` — misma función ya usada por
  `tipos_vehiculo`/`aseguradoras`/`permisos` (tablas sin columna `activo`).

**Rationale**: ninguna de las 2 funciones necesita cambios — `audit_empresas_usuarios()` ya
detecta `desactivar`/`reactivar` leyendo `old.activo`/`new.activo` en tiempo de ejecución (no
depende de la tabla), y `audit_catalogo()` es genérica por diseño (usa `tg_table_name`, no
requiere columna `activo`). Sin esto, ninguna de las 2 tablas queda auditada — constitución §2 lo
exige para toda creación/edición/eliminación/cancelación.

**Alternatives considered**: escribir una función de auditoría nueva para `productos` —
rechazado, `audit_catalogo()` ya cubre exactamente este caso (mismo por qué documentado en
`20260807195225_catalogos_base_ajustes.sql`, sección 4, al crearla para
`tipos_vehiculo`/`aseguradoras`/`permisos`).

## R3 — UI: patrón "modal en listado" de Catálogos Base, no el patrón de páginas separadas de Vehículos/Conductores

**Decision**: `admin/proveedores/index.vue` y `admin/productos/index.vue` replican la estructura
de `admin/aseguradoras/index.vue` (`TablaCatalogo.vue` + formulario en `v-dialog` +
`DialogoConfirmarEliminarCatalogo.vue`, ambos componentes ya genéricos y reutilizados sin
cambios) — sin páginas de alta/edición/detalle separadas. Proveedores extiende ese patrón con:
un `v-checkbox` "Mostrar inactivos" en el listado (mismo patrón ya construido en
`admin/conductores/index.vue`), un `v-chip` "Inactivo" por fila, y botones
"Desactivar"/"Reactivar" que abren `ProveedoresDialogoDesactivar.vue` — **copia propia** de
`ConductoresDialogoDesactivar.vue` con el texto ajustado a "proveedor", no un componente
compartido (mismo criterio de "cada módulo su propio texto" ya establecido en el proyecto:
`DialogoDarDeBaja.vue` de Vehículos y `DialogoDesactivar.vue` de Conductores tampoco se
comparten).

**Rationale**: ninguno de los 2 catálogos necesita una vista de detalle rica (sin historial de
archivos, sin pestañas, sin tabs) que justifique el patrón de módulo completo — el patrón modal
ya construido en Catálogos Base es suficiente y más simple, coherente con la propia
Decisión Confirmada del spec ("deliberadamente chica — igual que Catálogos Base, 002").

**Alternatives considered**: replicar el patrón de páginas separadas de Conductores (con detalle
de solo lectura) para Proveedores, dado que tiene activo/inactivo igual que Conductores —
rechazado: activo/inactivo por sí solo no requiere una vista de detalle dedicada, solo un toggle
en el listado y un diálogo de motivo — exactamente lo que ya provee el patrón modal extendido.

## R4 — 2 composables dedicados, sin extender `useCatalogo.ts`

**Decision**: `useProveedores.ts` (`listar(busqueda, incluirInactivos)`, `crear`, `editar`,
`desactivar(id, motivo)`, `reactivar(id)`, `eliminar`) y `useProductos.ts` (`listar(busqueda,
tipo?)`, `crear`, `editar`, `eliminar`, `tieneRegistrosAsociados(productoId)`) — ninguno extiende
`useCatalogo.ts` (`TablaCatalogo` union de tipos: `'tipos_vehiculo' | 'aseguradoras' |
'permisos'`, sin soporte para filtros adicionales, sin `desactivar`/`reactivar`).

**Rationale**: `useCatalogo.ts` fue diseñado para catálogos puramente simples (`listar(busqueda)`,
CRUD plano). Proveedores necesita `desactivar`/`reactivar` (estado adicional, no un campo más);
Productos necesita `tieneRegistrosAsociados()` (una consulta que no es CRUD sobre `productos`
mismo, sino sobre `cargas_combustible`/`mantenimiento_detalles`) y un filtro exacto por `tipo`
además del buscador de texto. Ninguno de los 2 casos es "un catálogo más" del molde genérico
— mismo criterio de "solo 2 casos de uso no justifican la abstracción todavía" ya aplicado
repetidas veces en este proyecto (research.md R9 de Conductores sobre
`useEntidadConArchivo()`, research.md R3 de Foto del Conductor sobre
`adjuntarFotoGenerico()`).

**Alternatives considered**: extender `useCatalogo.ts` con parámetros opcionales
(`filtros?`, `desactivar?`) — rechazado: convertiría un composable simple y genérico en uno con
ramas condicionales específicas de 2 casos de uso, exactamente el tipo de abstracción prematura
que el proyecto ya ha evitado en decisiones anteriores.

## R5 — Mapeo de errores de eliminación bloqueada (FR-006, FR-010)

**Decision**: mismo patrón `mapearErrorEscritura`/`ETIQUETAS_DEPENDIENTES` ya usado en
`useVehiculos.ts`/`useConductores.ts` — al recibir `23503` (foreign_key_violation), se extrae el
nombre de la tabla referenciante del mensaje de Postgres y se traduce a un mensaje de negocio:

| Tabla dependiente | Aplica a | Mensaje |
|---|---|---|
| `mantenimientos` | proveedores | "No se puede eliminar: tiene mantenimientos registrados." |
| `cargas_combustible` | proveedores y productos | "No se puede eliminar: tiene cargas de combustible registradas." |
| `mantenimiento_detalles` | productos | "No se puede eliminar: tiene detalles de mantenimiento registrados." |

**Rationale**: ambas tablas de esta feature son referenciadas por más de una tabla dependiente
(a diferencia de Vehículos/Conductores, que en su mayoría tienen un solo tipo de dependiente por
regla) — el mapeo por tabla ya soporta esto sin cambios, solo con más entradas en
`ETIQUETAS_DEPENDIENTES`.

**Alternatives considered**: un mensaje genérico único ("tiene registros relacionados") sin
distinguir la tabla — rechazado, el proyecto ya distingue el mensaje por tabla dependiente en
todos los catálogos anteriores; mantener la consistencia es más barato que la pérdida de
claridad para el usuario.

## R6 — Bloqueo del campo `tipo` en edición de producto: consulta previa, no restricción de BD

**Decision**: al abrir el formulario de edición de un producto, `useProductos.ts` expone
`tieneRegistrosAsociados(productoId)` — dos `select count(*)` (uno sobre `cargas_combustible`, uno
sobre `mantenimiento_detalles`, ambos filtrados por `producto_id`), `OR`eados en el cliente. Si
cualquiera es mayor a 0, el `v-select` de tipo se deshabilita (`disabled`) con un
`v-tooltip`/mensaje explicando por qué. Confirmado en `spec.md` Fuera de Alcance: esto es
validación de UI únicamente, no una restricción a nivel de RLS o trigger.

**Rationale**: coincide exactamente con la decisión ya tomada en `spec.md` (FR-009, Fuera de
Alcance) — dos consultas de conteo son suficientes y no requieren ningún cambio de esquema.

**Alternatives considered**: un trigger de base de datos que rechace el `UPDATE` de `tipo` si hay
dependientes — explícitamente rechazado en `spec.md` (Fuera de Alcance) para mantener la feature
acotada; puede reconsiderarse si en el futuro se detecta que el bypass de RLS (llamada directa a
la API sin pasar por la UI) se vuelve un problema real.

## R7 — Sin `server/api/` nuevos

**Decision**: igual que el resto del proyecto, ambos composables operan directo vía
`useSupabaseClient()`, protegidos por la RLS ya existente.

**Rationale**: ninguna operación necesita bypass de RLS.

**Alternatives considered**: N/A.

## R8 — Correcciones sobre las Assumptions de `spec.md`

**Decision**: dos afirmaciones de `spec.md` (Assumptions) no se verificaron como precedentes
reales durante la planeación — documentado aquí para que no se asuman ciertas en fases
posteriores:

1. El "filtro adicional por tipo" de Productos (FR-008) se describió como "mismo patrón de filtro
   ya usado en el listado de Vehículos" — no existe tal filtro en
   `app/pages/admin/vehiculos/index.vue` (solo buscador de texto). Se implementa como un
   `v-select` simple adicional al buscador, sin necesidad de un patrón preexistente que replicar
   — no es una funcionalidad compleja que requiera precedente.
2. Ya documentado en `spec.md` mismo: el precedente de "bloqueo de campo tras registros
   asociados" en `unidad_distancia`/`unidad_combustible` (Feature 001) tampoco existe en el
   código — R6 arriba documenta la implementación real, que es nueva para este proyecto.

**Rationale**: mismo criterio de verificar contra el código real antes de dar por buena una
referencia citada, ya aplicado durante la escritura de `spec.md` y de Combustible (007).
