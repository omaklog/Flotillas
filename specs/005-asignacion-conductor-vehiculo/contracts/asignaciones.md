# Contrato: Asignación Conductor-Vehículo

Igual que Vehículos/Conductores, sin `server/api/` nuevos: toda operación pasa por
`useSupabaseClient()` directo, protegida por RLS (`data-model.md`, research.md R6). `empresa_id`
siempre sale de la sesión activa, nunca capturado por el usuario ni tomado de la URL.

## Lecturas

**Historial de un vehículo (FR-004)** —
`supabase.from('asignaciones_conductor_vehiculo').select('*, conductores(nombre, apellidos)').eq('vehiculo_id', vehiculoId).order('fecha_inicio', { ascending: false }).order('created_at', { ascending: false })`
— el segundo `order` desempata cuando dos filas comparten `fecha_inicio` (mismo día). La fila con
`fecha_fin === null` (a lo sumo una) es el conductor activo.

**Historial de un conductor, a través de todos los vehículos (FR-007)** —
`supabase.from('asignaciones_conductor_vehiculo').select('*, vehiculos(marca, modelo, placa)').eq('conductor_id', conductorId).order('fecha_inicio', { ascending: false }).order('created_at', { ascending: false })`

**Vehículos activos de un conductor (FR-007, y advertencia informativa de FR-003)** —
mismo query que el historial del conductor, filtrado en el cliente por `fecha_fin === null` (o
agregando `.is('fecha_fin', null)` si no se necesita el historial completo en la misma pantalla).

**Conductor activo de un vehículo, para la confirmación fuerte de FR-006** —
`supabase.from('asignaciones_conductor_vehiculo').select('id, conductor_id, conductores(nombre, apellidos)').eq('vehiculo_id', vehiculoId).is('fecha_fin', null).maybeSingle()`
— si devuelve una fila con `conductor_id` distinto al que se está por asignar, el flujo desde el
conductor MUST mostrar la confirmación fuerte (FR-006) antes de llamar a `asignar()`. Si
`conductor_id` es el mismo que ya se está asignando, no hay nada que hacer (mismo criterio de
FR-010, excluir del selector).

**Vehículos con asignación activa, para el indicador del listado (FR-013)** —
`supabase.from('asignaciones_conductor_vehiculo').select('vehiculo_id').in('vehiculo_id', vehiculoIds).is('fecha_fin', null)`
— `app/pages/admin/vehiculos/index.vue` llama esto después de cargar su propio listado
(`useVehiculos().listar()`) y cruza los `vehiculo_id` resultantes contra los ids ya cargados;
cualquiera que no aparezca en el resultado muestra el indicador "Sin conductor" (research.md R5).

## Escrituras

**Asignar (cierra la activa del vehículo si la había, abre la nueva) — FR-002, FR-006** — 2 pasos:
1. `supabase.from('asignaciones_conductor_vehiculo').select('id').eq('vehiculo_id', vehiculoId).is('fecha_fin', null).maybeSingle()`
   — si hay una fila activa, `supabase.from('asignaciones_conductor_vehiculo').update({ fecha_fin: hoy }).eq('id', esaFila.id)`.
2. `supabase.from('asignaciones_conductor_vehiculo').insert({ empresa_id, vehiculo_id: vehiculoId, conductor_id: conductorId, asignado_por: usuarioId })`.

Ambos pasos ocurren siempre que se llama a `asignar()` (research.md R4) — la decisión de "avisar"
(FR-003) o "confirmar antes de llamar" (FR-006) ya se resolvió en la UI, con las lecturas de
arriba, **antes** de invocar esta función. Si el paso 1 no encuentra fila activa, se omite el
`update` y solo se ejecuta el `insert`.

**Finalizar sin reemplazar (FR-008)** —
`supabase.from('asignaciones_conductor_vehiculo').update({ fecha_fin: hoy }).eq('id', asignacionId)`
— mismo `update` que el paso 1 de "Asignar", pero invocado directo (sin insert posterior) cuando
el usuario elige "Finalizar asignación" en vez de reemplazarla.

## Ajuste sobre Vehículos (FR-012)

`app/composables/useVehiculos.ts`, diccionario `ETIQUETAS_DEPENDIENTES`: agregar
`asignaciones_conductor_vehiculo: 'asignaciones'` — sin cambios de lógica, el mapeo de `23503` ya
existente en `eliminar()` empieza a reconocer esta tabla automáticamente.
