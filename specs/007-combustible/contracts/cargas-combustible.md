# Contrato: Cargas de Combustible

Sin `server/api/` nuevos (research.md R7): toda operación pasa por `useSupabaseClient()` directo,
protegida por RLS (`data-model.md`). `empresa_id` y `creado_por` siempre salen de la sesión activa
(`useAuth().usuario.value`), nunca capturados por el usuario ni tomados de la URL.

## Capturar (FR-001, FR-002, FR-003, FR-006, FR-007)

1. Antes de mostrar el formulario: `useVehiculos().listar()`, `useProveedores().listar()`,
   `useProductos().listar('', 'combustible')` (research.md R5) para poblar los 3 selectores. Si
   el listado de productos tipo combustible viene vacío, mostrar el mensaje de FR-005 en vez del
   selector.
2. Al seleccionar un vehículo: `select max(odometro) from cargas_combustible where vehiculo_id =
   ? and estado = 'activo'` (data-model.md) para la validación de cliente de FR-003; si el nuevo
   odómetro es menor, bloquear el envío con un mensaje claro (US1/AC4) antes de llamar a `crear`.
3. `crear(valores)` →
   `supabase.from('cargas_combustible').insert({ empresa_id, creado_por, ...valores }).select('id').single()`.
   El `costo_total` que se envía es el que esté en el campo al momento de guardar (autocalculado o
   manual, research.md R8) — el composable no recalcula nada, solo persiste lo que el formulario
   ya resolvió.
4. Si se adjuntó factura: tras el `insert` exitoso, `adjuntarFactura(cargaId, archivo)` (paso 5) —
   si falla, la carga ya creada se conserva sin factura (FR-015, Edge Cases).
5. `adjuntarFactura(cargaId, archivo)` — mismo patrón que `adjuntarPoliza`/licencia
   (research.md R3): sube a `documentos` bucket en `factura/<empresa_id>/<cargaId>/<nombre_unico>`,
   inserta la fila en `archivos` (`tipo: 'factura'`, `entidad_tipo: 'carga_combustible'`,
   `entidad_id: cargaId`), y hace `update({ factura_archivo_id: archivoRow.id }).eq('id',
   cargaId)`. Solo permitido si la carga sigue `activo` (RLS + trigger, FR-009).
6. Errores esperados del `insert`: el trigger `trg_cargas_combustible_odometro_creciente`
   (respaldo de BD, research.md R4) puede rechazar aun con la validación de cliente si hubo una
   carga concurrente — mostrar el mensaje de Postgres tal cual, es suficientemente claro.

## Listar / filtrar (FR-010, FR-011, research.md R9)

`listar({ vehiculoId?, fechaDesde?, fechaHasta?, proveedorId?, estado? })` →
`supabase.from('cargas_combustible').select('*, vehiculos(placa), proveedores(nombre)')` con
`.eq('vehiculo_id', ...)`/`.gte('fecha', ...)`/`.lte('fecha', ...)`/`.eq('proveedor_id',
...)`/`.eq('estado', ...)` encadenados solo para los filtros presentes, `.order('fecha', {
ascending: false })`. RLS (`cargas_combustible_select`) ya limita a la empresa/permiso del
usuario — sin filtro adicional de autorización en el cliente.

El selector de vehículo del filtro usa la misma exclusión de dados de baja que el formulario de
captura (FR-004) — un vehículo dado de baja con cargas históricas deja de aparecer como opción,
pero sus cargas siguen visibles al no aplicar ese filtro (Clarifications, sesión 2026-08-10).

## Cancelar (FR-012, FR-013, FR-014)

`cancelar(id, motivo)` →
`supabase.from('cargas_combustible').update({ estado: 'cancelado', motivo_cancelacion: motivo
}).eq('id', id)`. El formulario MUST validar `motivo` no vacío y ≤150 caracteres antes de enviar
(FR-013); el `check` de la columna y el trigger
`private.solo_permite_cancelar_combustible()` son el respaldo de base de datos. Solo visible en
la UI si `usePermisos().tienePermiso('combustible', 'cancelar')` (research.md R6) — RLS
(`cargas_combustible_update_solo_cancelar`) es la autorización real.

Tras cancelar: la vista de detalle deja de ofrecer cualquier acción de edición, reemplazo de
factura, o reactivación (FR-014) — el trigger rechazaría cualquier intento igual, pero la UI no
debe ni mostrar el control.

## Composable `useCargasCombustible.ts` — forma esperada

`listar(filtros?)`, `crear(valores)`, `adjuntarFactura(cargaId, archivo)`,
`listarHistorialFactura(cargaId)`, `obtenerUltimoOdometroActivo(vehiculoId)`, `cancelar(id,
motivo)`. Sin `editar` ni `eliminar` — no existen en esta feature (FR-008).
