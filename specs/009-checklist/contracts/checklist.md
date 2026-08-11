# Contrato: Checklist de Aditamentos y Revisión de Seguridad

Sin `server/api/` nuevos: toda operación pasa por `useSupabaseClient()` directo, protegida por
RLS (`data-model.md`). `empresa_id` y `responsable_id`/`subido_por` siempre salen de la sesión
activa (`useAuth().usuario.value`), nunca capturados por el usuario ni tomados de la URL.

## Plantilla de ítems (US-9.1)

**Listar por tipo de vehículo** —
`supabase.from('checklist_item_plantillas').select('*').eq('tipo_vehiculo_id',
tipoVehiculoId).order('orden')`.

**Alta** — `supabase.from('checklist_item_plantillas').insert({ empresa_id, tipo_vehiculo_id,
nombre_item, es_critico, orden }).select('id').single()`.

**Editar** — `supabase.from('checklist_item_plantillas').update({...campos}).eq('id', id)`.

**Eliminar** — `supabase.from('checklist_item_plantillas').delete().eq('id', id)`. Sin bloqueo
por dependientes: `checklist_items.plantilla_item_id` usa `on delete set null` (FR-002,
data-model.md) — checklists ya capturados conservan su copia intacta sin importar si el ítem de
origen se eliminó.

**Gate de UI**: alta/edición/eliminación visibles solo si
`usePermisos().tienePermiso('checklist', 'editar')` (research.md R2 — **no** `'eliminar'`, esa
acción no está referenciada por ninguna política RLS).

## Capturar un checklist (US-9.2)

1. Al seleccionar un vehículo: cargar su `tipo_vehiculo_id` y, con él,
   `checklist_item_plantillas` filtrada (research.md R6). Si viene vacía, el formulario MUST
   mostrar el mensaje de bloqueo de FR-004 en vez de un formulario sin ítems.
2. En paralelo, consultar la asignación activa
   (`asignaciones_conductor_vehiculo.eq('vehiculo_id', ...).is('fecha_fin', null).maybeSingle()`,
   research.md R7) para precargar `conductor_id` — editable.
3. `crear(valores, itemsRespuesta)` →
   - `supabase.from('checklists').insert({ empresa_id, responsable_id, vehiculo_id,
     tipo_vehiculo_id, conductor_id, resultado }).select('id').single()`.
   - Si tuvo éxito: `supabase.from('checklist_items').insert(itemsRespuesta.map(i => ({
     empresa_id, checklist_id: checklistId, nombre_item: i.nombreItem, cumple: i.cumple,
     observaciones: i.observaciones, es_critico: i.esCritico, plantilla_item_id: i.plantillaItemId
     })))` — un solo `insert` masivo (research.md R8, mismo patrón que Mantenimiento).
   - Si el segundo paso falla: la orden ya existe sin ítems — devolver el error junto con el
     `id` del checklist ya creado para reintentar (`reintentarItems`), sin duplicarlo.
4. Validación de cliente antes de enviar: cada ítem con `cumple = false` MUST tener
   `observaciones` no vacías (FR-007); el `resultado` general MUST estar seleccionado (FR-009).

## Listar / filtrar (US-9.3, research.md R9)

`listar({ vehiculoId?, fechaDesde?, fechaHasta?, resultado?, conductorId? })` →
`supabase.from('checklists').select('*, vehiculos(placa, marca, modelo), conductores(nombre,
apellidos), usuarios(nombre), checklist_items(count)')` con `.eq()`/`.gte()`/`.lte()` encadenados
solo para los filtros presentes, `.order('fecha', { ascending: false })`.

## Detalle (US-9.3)

Consulta directa en la propia página (`[id]/index.vue`), sin función `obtener(id)` en el
composable (mismo criterio que Combustible/Mantenimiento):
`supabase.from('checklists').select('*, vehiculos(*), conductores(*), usuarios(nombre),
checklist_items(*)').eq('id', id).single()`.

## Composable `useChecklists.ts` — forma esperada

`listar(filtros?)`, `crear(valores, itemsRespuesta)`, `reintentarItems(checklistId,
itemsRespuesta)`. Sin `editar`/`eliminar`/`cancelar` — no existen en esta feature (FR-010).

## Composable `useChecklistPlantillas.ts` — forma esperada

`listar(tipoVehiculoId)`, `crear`, `editar`, `eliminar`.
