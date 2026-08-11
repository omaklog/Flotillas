# Contrato: Mantenimiento

Sin `server/api/` nuevos (research.md R7): toda operación pasa por `useSupabaseClient()` directo,
protegida por RLS (`data-model.md`). `empresa_id` y `creado_por` siempre salen de la sesión activa
(`useAuth().usuario.value`), nunca capturados por el usuario ni tomados de la URL.

## Capturar (FR-001 a FR-009)

1. Antes de mostrar el formulario: `useVehiculos().listar()`, `useProveedores().listar()`,
   `useProductos().listar()` (research.md R5) para poblar los selectores. El selector de producto
   de cada línea excluye del lado del cliente los productos con `tipo === 'combustible'`
   (research.md R12) — sin parámetro nuevo en `useProductos`.
2. El usuario agrega N líneas en el propio formulario (estado reactivo local, sin persistir hasta
   el envío final); cada línea, según el `tipo` del producto seleccionado, muestra sus campos
   condicionales (data-model.md, tabla de mapeo). El formulario MUST bloquear el envío si no hay
   ninguna línea (FR-004, US1/AC6).
3. `crear(valores, lineas)` →
   - `supabase.from('mantenimientos').insert({ empresa_id, creado_por, ...valores
     }).select('id').single()`.
   - Si tuvo éxito: `supabase.from('mantenimiento_detalles').insert(lineas.map(l => ({
     empresa_id, mantenimiento_id: ordenId, ...l })))` — un solo `insert` masivo, atómico como
     sentencia (research.md R13).
   - Si el segundo paso falla: la orden ya existe sin líneas. El composable MUST devolver un
     error distinguible ("líneas no guardadas") junto con el `id` de la orden ya creada, para que
     la UI ofrezca un botón "Reintentar líneas" que repita solo ese segundo `insert` contra el
     mismo `mantenimiento_id` — no crear una orden duplicada.
4. Si se adjuntó factura: tras el paso 3 exitoso (orden + líneas), `adjuntarFactura(ordenId,
   archivo)` — si falla, la orden y sus líneas ya creadas se conservan sin factura (FR-018,
   mismo criterio que Combustible FR-015).
5. `adjuntarFactura(mantenimientoId, archivo)` — mismo patrón que Combustible
   (research.md R3): sube a `documentos` bucket en
   `factura/<empresa_id>/<mantenimientoId>/<nombre_unico>`, inserta la fila en `archivos`
   (`tipo: 'factura'`, `entidad_tipo: 'mantenimiento'`, `entidad_id: mantenimientoId`), y hace
   `update({ factura_archivo_id: archivoRow.id }).eq('id', mantenimientoId)`. Solo permitido si la
   orden sigue `activo` (RLS + trigger, FR-011).

## Listar / filtrar (FR-012, FR-013, research.md R9)

`listar({ vehiculoId?, tipo?, fechaDesde?, fechaHasta?, proveedorId?, estado? })` →
`supabase.from('mantenimientos').select('*, vehiculos(placa), proveedores(nombre),
mantenimiento_detalles(count)')` con `.eq()`/`.gte()`/`.lte()` encadenados solo para los filtros
presentes, `.order('fecha', { ascending: false })`. El número de líneas de cada fila sale del
`count` embebido de `mantenimiento_detalles`, sin una consulta aparte por fila.

El selector de vehículo del filtro usa la misma exclusión de dados de baja que el formulario de
captura (FR-002) — un vehículo dado de baja con órdenes históricas deja de aparecer como opción,
pero sus órdenes siguen visibles al no aplicar ese filtro.

## Detalle (FR-014)

`obtenerConLineas(id)` → `supabase.from('mantenimientos').select('*, vehiculos(*), proveedores(*),
mantenimiento_detalles(*, productos(nombre, tipo))').eq('id', id).single()` — consulta directa en
la propia página de detalle (`[id]/index.vue`), sin una función `obtener(id)` en el composable
(mismo criterio que Combustible/Vehículos, research.md de 007 y `tasks.md` de 008 "Lecciones").
Cada línea trae el nombre y tipo de su producto para poder mostrar los campos condicionales
correctos (data-model.md, tabla de mapeo).

## Cancelar (FR-015, FR-016, FR-017)

`cancelar(id, motivo)` →
`supabase.from('mantenimientos').update({ estado: 'cancelado', motivo_cancelacion: motivo
}).eq('id', id)`. El formulario MUST validar `motivo` no vacío y ≤150 caracteres antes de enviar
(FR-016); el `check` de la columna y el trigger
`private.solo_permite_cancelar_mantenimiento()` son el respaldo de base de datos. Solo visible en
la UI si `usePermisos().tienePermiso('mantenimiento', 'cancelar')` (research.md R6) — RLS
(`mantenimientos_update_solo_cancelar`) es la autorización real. Cancelar la orden **no** requiere
ninguna operación adicional sobre sus líneas — `mantenimiento_detalles` no tiene columna `estado`
propia, hereda la inmutabilidad de su orden padre solo por RLS (`_no_update`/`_no_delete`, ambas
`using (false)`).

## Composable `useMantenimientos.ts` — forma esperada

`listar(filtros?)`, `crear(valores, lineas)`, `reintentarLineas(mantenimientoId, lineas)`,
`adjuntarFactura(mantenimientoId, archivo)`, `listarHistorialFactura(mantenimientoId)`,
`cancelar(id, motivo)`. Sin `editar` ni `eliminar` — no existen en esta feature (FR-010). Sin
`obtener(id)` — el detalle consulta directo (ver arriba).
