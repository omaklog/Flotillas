# Research: Asignación Conductor-Vehículo

Mismo punto de partida que Conductores (004): revisar qué del esquema ya existe antes de planear
como si se construyera desde cero. Aquí el resultado es aún más favorable — la tabla, su índice
único parcial y su RLS ya están completos y verificados funcionalmente en la sesión anterior. El
trabajo real de esta feature es casi enteramente de aplicación (composable + UI), con dos gaps
reales de esquema encontrados al revisar el código actual.

## R1 — `asignaciones_conductor_vehiculo` y su RLS ya existen, verificados funcionalmente

**Decision**: la tabla (`id`, `empresa_id`, `vehiculo_id`, `conductor_id`, `fecha_inicio`,
`fecha_fin` nullable, `asignado_por`, `created_at`), su índice único parcial
(`uq_asignacion_vehiculo_activa` sobre `vehiculo_id` donde `fecha_fin is null` — un vehículo solo
puede tener una asignación activa a la vez, sin equivalente para `conductor_id`) y sus políticas
RLS (`select`/`write` condicionadas a `tiene_permiso('vehiculos', ...)` **o**
`tiene_permiso('conductores', ...)`, o admin/superusuario) ya están aplicadas — la última ronda,
ampliando de solo `vehiculos` a también `conductores`, se verificó funcionalmente en la sesión
anterior (un usuario con solo `conductores`→`editar` ya puede escribir en la tabla). Esta feature
no repite ese trabajo.

**Rationale**: mismo criterio que Conductores R1 — verificar el estado real antes de planear evita
migraciones redundantes.

**Alternatives considered**: N/A — confirmado contra `supabase/migrations/*.sql` y con una prueba
funcional directa en la sesión anterior.

## R2 — Gap real: `asignaciones_conductor_vehiculo` no tiene trigger de auditoría

**Decision**: ninguna migración hasta ahora le agregó auditoría a esta tabla (se creó como parte
de Conductores 004, enfocada en desbloquear la eliminación con dependientes, no en construir su
propia capa de aplicación). Se agrega reutilizando `private.audit_catalogo()` — ya genérica
(`tg_table_name`, `new.empresa_id`/`old.empresa_id`), sin ninguna semántica de estado tipo
`activo`/`baja` que requiera una función dedicada (a diferencia de `vehiculos`/`conductores`). Una
nueva asignación queda como `'crear'`; cerrar una asignación (con o sin reemplazo) es un `UPDATE`
de `fecha_fin`, queda como `'editar'` — no se distingue "cerrar por reemplazo" de "finalizar sin
reemplazar" a nivel de auditoría, ambas son ediciones de la fila.

**Rationale**: constitución §2, sin excepción por tabla — mismo principio que motivó agregar
auditoría a `conductores` (research.md R3 de esa feature). Aquí es aún más simple: ni siquiera
hace falta evaluar `old.X is distinct from new.X`, `audit_catalogo()` tal cual ya cubre el caso.

**Alternatives considered**: distinguir `'editar'` de una acción nueva tipo `'finalizar'` para
diferenciar el cierre-por-reemplazo del cierre-sin-reemplazo en la auditoría — rechazado por
complejidad no pedida por ningún requisito; el propio historial de la UI (FR-004/FR-007) ya
muestra `fecha_fin` de cada fila, que es la señal relevante para el usuario, no la bitácora técnica.

## R3 — Gap real: `useVehiculos.ts` no traduce el error de FK de `asignaciones_conductor_vehiculo`

**Decision**: `ETIQUETAS_DEPENDIENTES` en `useVehiculos.ts` (usada por `eliminar()` para mapear el
`23503` de la eliminación de un vehículo a un mensaje específico) no incluye
`asignaciones_conductor_vehiculo` — se agrega una entrada (`'asignaciones'`), mismo patrón que ya
usa `useConductores.ts` para su propio `eliminar()` (FR-012 de `spec.md`).

**Rationale**: la FK ya existe desde que Conductores (004) creó la tabla; sin este ajuste, intentar
eliminar un vehículo con una asignación activa cae en el mensaje genérico "tiene registros
relacionados." en vez de uno específico — inconsistente con el resto del patrón ya establecido
para `vehiculos`/`conductores`.

**Alternatives considered**: N/A — cambio de una línea, sin alternativas razonables.

## R4 — Un solo mutador de asignación (`asignar`), no dos funciones distintas por punto de entrada

**Decision**: aunque `spec.md` describe dos flujos de UI distintos (US-1 desde el vehículo, US-2
desde el conductor) con reglas de advertencia/confirmación diferentes, a nivel de escritura en
base de datos ambos flujos ejecutan **la misma operación**: cerrar la asignación activa del
*vehículo* elegido (si la había, sin importar qué conductor tenía) y crear la nueva fila
vehículo↔conductor. La diferencia entre FR-002/FR-003 (reemplazo automático + advertencia
informativa, flujo desde el vehículo) y FR-006 (confirmación fuerte, flujo desde el conductor) es
puramente de **UI**: qué se le pregunta al usuario *antes* de llamar al mutador, no una diferencia
de comportamiento de la escritura en sí. El composable expone un solo `asignar(vehiculoId,
conductorId)`, más funciones de solo lectura para las verificaciones previas:

- `listarVehiculosActivosDeConductor(conductorId)` — para la advertencia informativa de FR-003
  (¿en qué otros vehículos ya está activo este conductor?) y para poblar FR-007 (lista de
  vehículos activos del conductor).
- `obtenerAsignacionActivaDeVehiculo(vehiculoId)` — para la confirmación fuerte de FR-006 (¿este
  vehículo ya tiene otro conductor activo, y quién es?) y para poblar FR-004 (conductor
  actualmente asignado).

**Rationale**: evita duplicar la lógica de "cerrar + crear" en dos funciones que harían
exactamente lo mismo; las reglas de advertencia/confirmación pertenecen naturalmente a la capa de
UI (qué diálogo mostrar y cuándo esperar una confirmación), no a la capa de datos.

**Alternatives considered**: dos funciones `asignarDesdeVehiculo`/`asignarDesdeConductor` con la
misma lógica interna duplicada — rechazado, violaría la guía del proyecto de no duplicar lógica
real; una función con un parámetro `origen: 'vehiculo' | 'conductor'` que cambie su comportamiento
— rechazado, la escritura no depende del origen, solo la UI que la precede.

## R5 — Indicador de "sin conductor" en el listado de vehículos (FR-013): consulta separada, no embed de PostgREST

**Decision**: el listado de vehículos (`useVehiculos().listar()`) no se modifica para incrustar la
asignación activa vía un `select` anidado de PostgREST. En su lugar, `useAsignaciones.ts` expone
`listarVehiculosConAsignacionActiva(vehiculoIds)`, que devuelve el conjunto de `vehiculo_id` con
una fila activa (`fecha_fin is null`) entre los ids dados — `app/pages/admin/vehiculos/index.vue`
la llama después de cargar su propio listado y cruza los resultados client-side para decidir qué
badge mostrar, mismo patrón de dos consultas ya usado en `[id]/index.vue` de Vehículos para
resolver la URL de la foto.

**Rationale**: un `select` anidado con filtro (`asignaciones_conductor_vehiculo!left(...)&fecha_fin=is.null`)
sobre una relación *no* filtrada por PK es un patrón frágil de PostgREST (el filtro del embed
puede convertir el join en efectivamente `inner` según la sintaxis exacta, y no hay una forma
simple de pedir "la fila activa, si la hay" sin arriesgar duplicar filas si algún día hubiera más
de una coincidencia). Dos consultas simples y una unión en el cliente es más legible y ya es el
patrón establecido en este proyecto para "dato opcional relacionado" (research.md ya documentó un
bug real de escape de `.or()` en Catálogos Base — este proyecto prefiere consultas simples y
explícitas sobre sintaxis de PostgREST más compacta pero más frágil).

**Alternatives considered**: `select` anidado con filtro embebido — rechazado por lo anterior; una
vista de Postgres (`vehiculos_con_conductor_activo`) — considerada pero rechazada por ahora,
añadiría un objeto de esquema nuevo para un caso de uso que dos consultas ya resuelven sin
complejidad adicional.

## R6 — Sin `server/api/` nuevos: todo el flujo es client-side

**Decision**: igual que Vehículos y Conductores, ninguna operación de esta feature requiere
`service_role`: asignar (con su lectura previa de conflictos), finalizar, y las distintas listas
de historial se implementan con `useSupabaseClient()` directo, protegidas por la RLS ya existente
de `asignaciones_conductor_vehiculo` (R1).

**Rationale**: ninguna operación necesita bypass de RLS.

**Alternatives considered**: mismas consideradas y rechazadas en Vehículos/Conductores — no se
repiten aquí.

## R7 — Composable propio `useAsignaciones.ts`, no extender `useVehiculos.ts` ni `useConductores.ts`

**Decision**: se crea un composable dedicado a `asignaciones_conductor_vehiculo`, no se agregan sus
funciones a los composables existentes de Vehículos/Conductores — mismo razonamiento que motivó
`useConductores.ts` en vez de reutilizar `useVehiculos.ts` (research.md R9 de esa feature): la
tabla y su forma de uso (dos puntos de entrada, historial cruzado) son distintas de ambos, y
mezclarlas infla composables que ya tienen su propia responsabilidad clara.

**Rationale**: mismo criterio de "no forzar abstracciones que no encajan limpio" ya aplicado dos
veces en este proyecto.

**Alternatives considered**: agregar `listarConductorActivo`/`asignarConductor` directo a
`useVehiculos.ts` y su espejo a `useConductores.ts` — rechazado, duplicaría la lógica de
`asignar()` (R4) en dos lugares en vez de uno.

## R8 — UI: dos pestañas nuevas, dos componentes nuevos, sin referencia visual propia

**Decision**: se agrega una pestaña "Conductor Asignado" a `app/pages/admin/vehiculos/[id]/index.vue`
(hoy tiene "Datos"/"Historial de Póliza") montando un componente nuevo
`VehiculosConductorAsignado.vue`, y una pestaña "Vehículos Asignados" a
`app/pages/admin/conductores/[id]/index.vue` (hoy tiene "Datos"/"Historial de Licencia") montando
`ConductoresVehiculosAsignados.vue`. No existe una referencia de Stitch específica para esta
feature — se sigue `docs/design-system.md` y los patrones de layout ya construidos (tabla de
historial con columnas Fecha inicio/Fecha fin/Estado, mismo criterio visual que
`HistorialPoliza.vue`/`HistorialLicencia.vue`, aunque sin archivos que subir/descargar aquí).

**Rationale**: mismo criterio ya aplicado en Conductores (research.md R10) — reutilizar un patrón
de pantalla ya construido y validado en vez de bloquear la feature en generar un mockup nuevo.

**Alternatives considered**: una sola pantalla dedicada a "Asignaciones" fuera del detalle de
vehículo/conductor — rechazada, contradice explícitamente la decisión confirmada de `spec.md`
("se asigna desde ambos lados", dos pestañas en los detalles ya existentes).
