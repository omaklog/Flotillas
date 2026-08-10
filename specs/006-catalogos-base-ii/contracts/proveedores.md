# Contrato: Proveedores

Igual que Vehículos/Conductores, sin `server/api/` nuevos: toda operación pasa por
`useSupabaseClient()` directo, protegida por RLS (`data-model.md`, research.md R7). `empresa_id`
siempre sale de la sesión activa (`useAuth().usuario.value.empresa_id`), nunca capturado por el
usuario ni tomado de la URL.

## Proveedor — CRUD base

**Listar / buscar** —
`supabase.from('proveedores').select('*').or('nombre.ilike."%texto%",rfc.ilike."%texto%"').eq('activo', true).order('nombre')`
(el filtro `eq('activo', true)` se omite cuando "Mostrar inactivos" está activo — FR-003). El
texto de búsqueda MUST escaparse con el mismo mecanismo ya usado en
`useCatalogo.ts`/`useVehiculos.ts`/`useConductores.ts` (comillas dobles alrededor del valor).

**Alta** — `supabase.from('proveedores').insert({ empresa_id, nombre, ...resto }).select('id').single()`
Solo `nombre` es obligatorio (FR-001); el resto de los campos son `null` si no se capturan.

**Editar** — `supabase.from('proveedores').update({...campos}).eq('id', id)`.

**Desactivar** — `supabase.from('proveedores').update({ activo: false, motivo_baja: texto }).eq('id', id)`
El formulario MUST validar `texto` no vacío y ≤150 caracteres antes de enviar (FR-005); el `CHECK`
de la columna es el respaldo de base de datos.

**Reactivar** — `supabase.from('proveedores').update({ activo: true }).eq('id', id)` —
`motivo_baja` no se limpia (queda como el motivo de la última desactivación, visible en el
historial de auditoría vía `private.audit_empresas_usuarios()`).

**Eliminar** — `supabase.from('proveedores').delete().eq('id', id)`. Errores esperados: `23503`
(foreign_key_violation) sobre `mantenimientos` o `cargas_combustible` → mensaje mapeado
(research.md R5, `mapearErrorEscritura`/`ETIQUETAS_DEPENDIENTES`).

## Composable `useProveedores.ts` — forma esperada (research.md R4)

`listar(busqueda?, incluirInactivos?)`, `crear`, `editar`, `desactivar(id, motivo)`,
`reactivar(id)`, `eliminar`. Mapeo de errores (`mapearErrorEscritura`): `23503` sobre
`mantenimientos` → "No se puede eliminar: tiene mantenimientos registrados.", sobre
`cargas_combustible` → "No se puede eliminar: tiene cargas de combustible registradas."
