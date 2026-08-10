# Data Model: Catálogos Base II (Proveedores + Productos)

> **Fuente de verdad**: `supabase/migrations/20260806044218_initial_schema.sql` (tablas
> `proveedores`, `productos`, `cargas_combustible`, `mantenimientos`, `mantenimiento_detalles`),
> `20260806044220_modulos_y_permisos.sql` + `20260806044221_permisos_ver_y_defaults.sql` (RLS
> granular de ambas tablas, ya con `tiene_permiso('proveedores'|'productos', ...)`) — todas ya
> aplicadas, no se recrean aquí. Este documento describe ese estado real más las extensiones
> puntuales que esta feature agrega (resumen al final).

## Proveedor (`public.proveedores`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `nombre` | text, not null | FR-001 |
| `rfc` | text, nullable | |
| `calle`, `numero`, `colonia` | text, nullable | domicilio |
| `telefono_oficina_1`, `telefono_oficina_2` | text, nullable | |
| `celular` | text, nullable | |
| `correo` | text, nullable | |
| `activo` | boolean, not null, default `true` | **nueva columna de esta feature** (`schema_08_proveedores_activo.sql`, research.md R2) — semántica NO invertida, mismo criterio que `conductores`/`empresas`/`usuarios` |
| `motivo_baja` | text, check `char_length <= 150` | **nueva columna de esta feature** — obligatorio al desactivar (FR-005); se conserva al reactivar |
| `created_at`, `updated_at` | timestamptz | trigger `set_updated_at` ya existe |

**Extensión de esta feature**: se agregan `activo` y `motivo_baja` (research.md R2), y el trigger
de auditoría reutilizando `private.audit_empresas_usuarios()` — **sin** crear una función nueva.

**Transiciones**: `activo: true ⇄ false` (US-1, vía `private.audit_empresas_usuarios()` — mismo
patrón que `activo` en `conductores`/`empresas`/`usuarios`). Eliminación física sujeta a que no
existan filas dependientes en `mantenimientos` ni `cargas_combustible` (ambas FK sin
`ON DELETE CASCADE`, research.md R5).

RLS (ya existente, sin cambios — research.md R1): `proveedores_select` para cualquier usuario de
la empresa con `tiene_permiso('proveedores','ver')` (o admin/superusuario); `proveedores_write`
(INSERT/UPDATE/DELETE combinados) para `tiene_permiso('proveedores','editar')` (o
admin/superusuario) — mismo matiz que Vehículos/Conductores: `'crear'`/`'eliminar'` del módulo no
bastan por sí solos a nivel de RLS, solo `'editar'`.

## Producto (`public.productos`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `nombre` | text, not null | FR-007 |
| `tipo` | enum `tipo_producto` (`refaccion`\|`combustible`\|`servicio`\|`llanta`\|`consumible`) | not null; **bloqueado en la UI para edición si el producto tiene registros asociados** (FR-009, research.md R6) — sin restricción a nivel de BD |
| `unidad` | text, nullable | texto libre (FR-007) |
| `created_at` | timestamptz, not null | |

**Sin extensión de esquema**: `productos` no gana columnas nuevas — solo el trigger de auditoría
nuevo, reutilizando `private.audit_catalogo()` (research.md R2), igual que
`tipos_vehiculo`/`aseguradoras`/`permisos`.

**Sin estado activo/inactivo**: a diferencia de Proveedores, Productos solo tiene alta, edición
(con la excepción de FR-009) y eliminación física — mismo criterio que los catálogos simples de
Catálogos Base (002).

RLS (ya existente, sin cambios — research.md R1): `productos_select`/`productos_write`, mismo
patrón que `proveedores` arriba, sustituyendo el módulo por `productos`.

## Verificación de "registros asociados" (FR-009, research.md R6)

No es una relación nueva — se apoya en columnas ya existentes:

| Tabla | Columna FK a `productos` | Uso |
|---|---|---|
| `cargas_combustible` | `producto_id`, not null, sin `ON DELETE CASCADE` | bloquea eliminación (FR-010) y edición de `tipo` (FR-009) |
| `mantenimiento_detalles` | `producto_id`, not null, sin `ON DELETE CASCADE` | bloquea eliminación (FR-010) y edición de `tipo` (FR-009) |

`useProductos.ts` expone `tieneRegistrosAsociados(productoId)`: dos `select count`, uno por tabla,
`OR`eados en el cliente — ver `contracts/productos.md`.

## Verificación de dependientes para eliminar un proveedor (FR-006)

| Tabla | Columna FK a `proveedores` | Uso |
|---|---|---|
| `mantenimientos` | `proveedor_id`, not null, sin `ON DELETE CASCADE` | bloquea eliminación |
| `cargas_combustible` | `proveedor_id`, not null, sin `ON DELETE CASCADE` | bloquea eliminación |

No requiere una consulta previa como Productos — se apoya directamente en el error `23503` de
Postgres al intentar el `DELETE`, traducido por `mapearErrorEscritura` (research.md R5).

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature debe agregar:

1. `alter table public.proveedores add column activo boolean not null default true, add column
   motivo_baja text check (char_length(motivo_baja) <= 150)` — tal cual
   `docs/schema-reference/schema_08_proveedores_activo.sql` (research.md R2).
2. `create trigger trg_proveedores_auditoria after insert or update or delete on
   public.proveedores for each row execute function private.audit_empresas_usuarios();`
3. `create trigger trg_productos_auditoria after insert or update or delete on public.productos
   for each row execute function private.audit_catalogo();`

No se modifican columnas existentes de `proveedores`/`productos` más allá de lo listado en (1), ni
la RLS de ninguna de las 2 tablas, ni los módulos/acciones ya sembrados — todo lo demás para esta
feature ya está en producción local desde Feature 001.
