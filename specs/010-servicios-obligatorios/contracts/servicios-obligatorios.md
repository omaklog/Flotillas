# Contrato: Bitácora de Servicios Obligatorios

Sin `server/api/` nuevos: toda operación pasa por `useSupabaseClient()` directo, protegida por
RLS (`data-model.md`). `empresa_id` siempre sale de la sesión activa (`useAuth().usuario.value`),
nunca capturado por el usuario ni tomado de la URL.

## Registrar (US-10.1)

`crear(valores)` → `supabase.from('servicios_obligatorios').insert({ empresa_id, vehiculo_id,
tipo, fecha_realizado, fecha_vencimiento }).select('id').single()`. `archivo_id` no se envía en
este paso — el comprobante se adjunta después con `adjuntarComprobante` (dos pasos, igual que
pólizas/facturas), incluso si el usuario lo selecciona en el mismo formulario de captura.

**Validación de cliente antes de enviar** (FR-003, FR-004): `fecha_realizado` MUST NOT ser
posterior a hoy; `fecha_vencimiento` MUST ser posterior a `fecha_realizado`. Mismas reglas se
aplican en edición (US-10.3).

**Selector de vehículo**: excluye vehículos dados de baja (FR-002) — `useVehiculos().listar()` ya
filtra `baja = false` por defecto, mismo criterio que Combustible/Mantenimiento/Checklist.

## Adjuntar/reemplazar comprobante (FR-005, research.md R4)

`adjuntarComprobante(servicioId, archivo)`:

1. Sube `archivo` a Storage, bucket `documentos`, ruta
   `testigo_servicio/{empresa_id}/{servicioId}/{nombreArchivoUnico(archivo.name)}`.
2. `supabase.from('archivos').insert({ empresa_id, tipo: 'testigo_servicio', storage_path,
   entidad_tipo: 'servicio_obligatorio', entidad_id: servicioId, subido_por
   }).select('id').single()`.
3. `supabase.from('servicios_obligatorios').update({ archivo_id: archivoRow.id }).eq('id',
   servicioId)`.
4. Si ya había un comprobante anterior (`archivo_id` previo no nulo): después de que el nuevo ya
   quedó vinculado exitosamente, borrar la fila anterior de `archivos` y su objeto de Storage
   (research.md R4 — sin historial, mismo patrón que `adjuntarFoto()`).

Validación de archivo: `validarArchivo()` (`app/utils/archivos.ts`, ya existente) — PDF/JPG/PNG,
máximo 10 MB.

## Editar (US-10.3)

`editar(id, valores)` → `supabase.from('servicios_obligatorios').update({...campos}).eq('id',
id)`. Mismas validaciones de fecha que el registro (FR-006).

## Eliminar (US-10.3)

`eliminar(id)`:

1. Consultar si tiene comprobante adjunto (`archivo_id` no nulo) antes de borrar la fila.
2. `supabase.from('servicios_obligatorios').delete().eq('id', id)` — sin bloqueo por
   dependientes: ninguna otra tabla referencia esta (FR-007, data-model.md).
3. Si tenía comprobante: borrar la fila de `archivos` y su objeto de Storage (mismo patrón de
   limpieza ya usado en `useConductores.eliminar()`/`useVehiculos.eliminar()`).

**Gate de UI**: registrar/editar/eliminar visibles solo si
`usePermisos().tienePermiso('servicios_obligatorios', 'editar')` (research.md R2 — **no**
`'crear'`/`'eliminar'`, ninguna de esas dos acciones está referenciada por la política RLS de
escritura; solo `'editar'` lo está).

## Listar / filtrar (US-10.2)

`listar({ vehiculoId?, tipo?, fechaDesde?, fechaHasta? })` →
`supabase.from('servicios_obligatorios').select('*, vehiculos(placa, marca, modelo)')` con
`.eq()`/`.gte()`/`.lte()` encadenados solo para los filtros presentes, `.order('fecha_vencimiento',
{ ascending: true })` (para que lo más próximo a vencer aparezca primero por defecto, útil dado el
propósito de prevención de sanciones — SC-003).

**Indicador de vigencia** (FR-009, research.md R7): calculado en el cliente al renderizar cada
fila, no almacenado — misma función `estadoServicio(fechaVencimiento)` (umbral 60 días, colores
`success`/`warning`/`error`) que `estadoPoliza()` de `vehiculos/index.vue`.

## Detalle (US-10.2)

Consulta directa en la propia página (`[id]/index.vue`), sin función `obtener(id)` en el
composable (mismo criterio que Combustible/Mantenimiento/Checklist):
`supabase.from('servicios_obligatorios').select('*, vehiculos(*)').eq('id', id).single()`, más una
consulta aparte a `archivos` para el comprobante (data-model.md).

## Composable `useServiciosObligatorios.ts` — forma esperada

`listar(filtros?)`, `crear(valores)`, `editar(id, valores)`, `eliminar(id)`,
`adjuntarComprobante(servicioId, archivo)`, `obtenerComprobante(servicioId)`,
`descargarArchivo(storagePath, nombreDescarga?)`, `verArchivo(storagePath)` (últimos dos, mismo
patrón ya existente en `useVehiculos.ts`/`useConductores.ts`).
