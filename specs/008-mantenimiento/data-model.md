# Data Model: Mantenimiento (Correctivo y Preventivo)

> **Fuente de verdad**: `supabase/migrations/20260806044218_initial_schema.sql` (tablas
> `mantenimientos`, `mantenimiento_detalles`, RLS base), `20260806044220_modulos_y_permisos.sql` +
> `20260806044221_permisos_ver_y_defaults.sql` (RLS granular por permiso, módulo `mantenimiento`
> ya sembrado) — todas ya aplicadas. Este documento describe ese estado real más la extensión que
> esta feature agrega (`docs/schema-reference/schema_10_mantenimiento_ajustes.sql` + auditoría,
> research.md R1/R11).

## Orden de mantenimiento (`public.mantenimientos`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `vehiculo_id` | uuid, not null, FK → `vehiculos.id` | FR-001; selector excluye dados de baja (FR-002, research.md R5) |
| `proveedor_id` | uuid, not null, FK → `proveedores.id` | FR-001; selector excluye inactivos (FR-002, research.md R5) |
| `tipo` | enum `tipo_mantenimiento` (`correctivo`\|`preventivo`), not null | FR-001 |
| `fecha` | date, not null, `check (fecha <= current_date)` | FR-003 |
| `costo_total` | numeric, not null | FR-008 — campo simple, sin autocálculo (research.md R8) |
| `notas` | text, nullable | FR-001 |
| `factura_archivo_id` | uuid, nullable, FK → `archivos.id` | FR-009/FR-011 — puntero a la versión vigente; historial completo en `archivos` (research.md R3) |
| `estado` | enum `estado_registro` (`activo`\|`cancelado`), not null, default `activo` | FR-010/FR-017 |
| `motivo_cancelacion` | text, check `char_length <= 150` | **nueva columna de esta feature** (`schema_10`, research.md R1) — obligatorio al cancelar (FR-016), inmutable después (FR-017) |
| `creado_por` | uuid, not null, FK → `usuarios.id` | |
| `created_at` | timestamptz, not null | |

**Extensión de esta feature**: se agrega `motivo_cancelacion`, se reemplaza el trigger de
inmutabilidad genérico (`private.solo_permite_cancelar()`, hasta ahora compartido con
`cargas_combustible`) por uno propio (`private.solo_permite_cancelar_mantenimiento()`) que exige
`motivo_cancelacion` no vacío al cancelar y permite que `factura_archivo_id` cambie mientras el
registro siga `activo`, y se agrega el trigger de auditoría dedicado
`private.audit_mantenimientos()` (research.md R11) — ninguno de los dos existía antes de esta
feature.

**Transiciones**: `estado: activo → cancelado`, única e irreversible (FR-010/FR-017). No existe
`cancelado → activo`. `factura_archivo_id` puede cambiar libremente mientras `estado = 'activo'`.

RLS (ya existente, sin cambios más allá de lo listado arriba):

- `mantenimientos_select`: `tiene_permiso('mantenimiento','ver')` (o admin/superusuario).
- `mantenimientos_insert`: `tiene_permiso('mantenimiento','crear')` (o admin/superusuario) —
  otorgado por defecto a todo operario nuevo.
- `mantenimientos_update_solo_cancelar`: `tiene_permiso('mantenimiento','cancelar')` (o
  admin/superusuario) **y** `estado = 'activo'` — no otorgado por defecto (FR-015).
- `mantenimientos_no_delete`: `using (false)` — ningún rol puede hacer `DELETE` físico.

## Línea de mantenimiento (`public.mantenimiento_detalles`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `mantenimiento_id` | uuid, not null, FK → `mantenimientos.id` on delete cascade | |
| `producto_id` | uuid, not null, FK → `productos.id` | FR-004 — selector excluye `tipo = 'combustible'`; determina qué campos condicionales aplican (research.md R12) |
| `cantidad` | numeric, nullable | **nueva columna de esta feature** (`schema_10`) — FR-007, solo aplica si `productos.tipo` es `refaccion` o `consumible` |
| `llanta_marca`, `llanta_medida`, `llanta_numero_serie` | text, nullable | FR-005, solo si `productos.tipo = 'llanta'` |
| `llanta_condicion` | enum `condicion_llanta` (`nueva`\|`renovada`), nullable | FR-005 |
| `llanta_kilometraje` | numeric, nullable | FR-005 — sin validación cruzada (research.md R4) |
| `servicio_fecha_proximo` | date, nullable | FR-006, solo si `productos.tipo = 'servicio'` |
| `servicio_frecuencia_km` | numeric, nullable | FR-006 |
| `created_at` | timestamptz, not null | |

**Sin extensión de esquema propia más allá de `cantidad`** (ya cubierta arriba). Hereda
inmutabilidad de su orden — nunca se edita ni se elimina de forma independiente (RLS
`mantenimiento_detalles_no_update`/`_no_delete`, ambas `using (false)`).

RLS (ya existente, sin cambios):

- `mantenimiento_detalles_select`: `tiene_permiso('mantenimiento','ver')` (o admin/superusuario).
- `mantenimiento_detalles_insert`: `tiene_permiso('mantenimiento','crear')` (o
  admin/superusuario) — mismo permiso que la orden padre.
- `_no_update`/`_no_delete`: `using (false)` para ambos — ni siquiera admin puede editar o borrar
  una línea después de insertada.

## Mapeo de categoría de línea → `productos.tipo` (research.md R12)

| Categoría (spec.md) | `productos.tipo` | Campos condicionales que activa |
|---|---|---|
| Servicio | `servicio` | `servicio_fecha_proximo`, `servicio_frecuencia_km` (FR-006) |
| Llanta | `llanta` | `llanta_marca`, `llanta_medida`, `llanta_numero_serie`, `llanta_condicion`, `llanta_kilometraje` (FR-005) |
| Refacción | `refaccion` | `cantidad` (FR-007) |
| Producto | `consumible` | `cantidad` (FR-007) |
| — (excluido) | `combustible` | No aplica — el selector de producto de cada línea lo excluye (FR-004) |

## Factura (`public.archivos`, sin tabla nueva)

| Campo relevante | Valor para esta feature |
|---|---|
| `tipo` | `'factura'` (ya en el enum `tipo_archivo`) |
| `entidad_tipo` | `'mantenimiento'` |
| `entidad_id` | `mantenimientos.id` |
| `storage_path` | `factura/<empresa_id>/<mantenimiento_id>/<nombre_unico>` — mismo patrón que Combustible/póliza/licencia |

Historial completo: `select * from archivos where entidad_tipo = 'mantenimiento' and entidad_id =
? and tipo = 'factura' order by created_at desc` — idéntico al de Combustible (007,
data-model.md).

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature, con el contenido literal de
`docs/schema-reference/schema_10_mantenimiento_ajustes.sql` (research.md R1) más el trigger de
auditoría (research.md R11):

1. `alter table public.mantenimiento_detalles add column cantidad numeric;`
2. `alter table public.mantenimientos add column motivo_cancelacion text check
   (char_length(motivo_cancelacion) <= 150);`
3. `drop trigger if exists trg_mantenimientos_inmutable on public.mantenimientos; create function
   private.solo_permite_cancelar_mantenimiento() ... create trigger
   trg_mantenimientos_inmutable before update ...` (deja `factura_archivo_id` fuera de las
   columnas congeladas, igual que Combustible)
4. `drop function if exists private.solo_permite_cancelar();` — ya no la usa ninguna tabla
   (`cargas_combustible` y `mantenimientos` tienen cada una la suya propia desde las migraciones
   9 y 10)
5. `create function private.audit_mantenimientos() ... create trigger
   trg_mantenimientos_auditoria after insert or update or delete on public.mantenimientos ...`
   (research.md R11) — **nueva respecto a `schema_10`**, aplica el mismo criterio que Combustible
   (007, hallazgo A1 de `/speckit-analyze`) desde el inicio, no como corrección posterior.
6. `create trigger trg_mantenimiento_detalles_auditoria after insert or update or delete on
   public.mantenimiento_detalles for each row execute function private.audit_catalogo();`
   (research.md R11)

No se modifica ninguna política RLS ni ningún enum existente — todo lo demás para esta feature ya
está en producción local desde la migración inicial del proyecto.

**Nota sobre `drop function if exists private.solo_permite_cancelar();` (paso 4)**: `schema_09`
(Combustible, ya aplicado en tasks.md de 007 pero pendiente de ejecutar) reemplaza el trigger de
`cargas_combustible` por el suyo propio; `schema_10` hace lo mismo para `mantenimientos`. Si la
migración de esta feature (008) se aplica **antes** que la de Combustible (007) en el entorno
local, este `drop function` fallaría (la función seguiría en uso por el trigger viejo de
`cargas_combustible`) — **orden de aplicación requerido: 007 antes que 008** en cualquier entorno
donde ambas migraciones aún no se hayan aplicado. Ver plan.md, Constraints.
