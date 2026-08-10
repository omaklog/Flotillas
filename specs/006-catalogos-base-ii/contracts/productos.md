# Contrato: Productos

Igual que Proveedores (`contracts/proveedores.md`), sin `server/api/` nuevos.

## Producto — CRUD base

**Listar / buscar / filtrar por tipo** —
`supabase.from('productos').select('*').ilike('nombre', '%texto%').order('nombre')`, agregando
`.eq('tipo', tipoSeleccionado)` cuando el filtro de tipo está activo (FR-008) — filtro exacto,
combinable con el buscador de texto (ambos aplican a la vez si están presentes).

**Alta** — `supabase.from('productos').insert({ empresa_id, nombre, tipo, unidad }).select('id').single()`
`nombre` y `tipo` son obligatorios (FR-007); `unidad` es `null` si no se captura.

**Editar** — `supabase.from('productos').update({...campos}).eq('id', id)` — si el campo `tipo`
está deshabilitado en el formulario (ver abajo), no se incluye en el payload de `update` aunque el
usuario no pueda tocarlo de todas formas.

**Eliminar** — `supabase.from('productos').delete().eq('id', id)`. Errores esperados: `23503`
sobre `cargas_combustible` o `mantenimiento_detalles` → mensaje mapeado (research.md R5).

## Verificar registros asociados (FR-009, research.md R6)

Antes de habilitar la edición del campo `tipo`, `useProductos.ts` expone
`tieneRegistrosAsociados(productoId): Promise<boolean>`:

```
const [{ count: cargas }, { count: detalles }] = await Promise.all([
  supabase.from('cargas_combustible').select('id', { count: 'exact', head: true }).eq('producto_id', productoId),
  supabase.from('mantenimiento_detalles').select('id', { count: 'exact', head: true }).eq('producto_id', productoId)
])
return (cargas ?? 0) > 0 || (detalles ?? 0) > 0
```

El formulario de edición llama esto al abrirse (antes de mostrar el `v-select` de tipo); si
devuelve `true`, el campo se renderiza `disabled` con un `v-tooltip` explicando el motivo
("No se puede cambiar el tipo: ya tiene registros asociados.").

## Composable `useProductos.ts` — forma esperada (research.md R4)

`listar(busqueda?, tipo?)`, `crear`, `editar`, `eliminar`, `tieneRegistrosAsociados(productoId)`.
Mapeo de errores (`mapearErrorEscritura`): `23503` sobre `cargas_combustible` → "No se puede
eliminar: tiene cargas de combustible registradas.", sobre `mantenimiento_detalles` → "No se
puede eliminar: tiene detalles de mantenimiento registrados."
