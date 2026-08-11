# Data Model: Combustible

> **Fuente de verdad**: `supabase/migrations/20260806044218_initial_schema.sql` (tabla
> `cargas_combustible`, RLS base), `20260806044220_modulos_y_permisos.sql` +
> `20260806044221_permisos_ver_y_defaults.sql` (RLS granular por permiso, módulo `combustible`
> ya sembrado) — todas ya aplicadas. Este documento describe ese estado real más la extensión que
> esta feature agrega (`docs/schema-reference/schema_09_combustible_ajustes.sql`, research.md R1).

## Carga de combustible (`public.cargas_combustible`)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `vehiculo_id` | uuid, not null, FK → `vehiculos.id` | FR-001; selector excluye dados de baja (FR-004, research.md R5) |
| `proveedor_id` | uuid, not null, FK → `proveedores.id` | FR-001; selector excluye inactivos (FR-004, research.md R5) |
| `producto_id` | uuid, not null, FK → `productos.id` | FR-001; selector limitado a `tipo = 'combustible'` (FR-005, research.md R5) |
| `fecha` | date, not null, `check (fecha <= current_date)` | FR-006 — el `check` de BD ya es el respaldo, sin cambio |
| `odometro` | numeric, not null | FR-003 — validado contra la última carga activa del mismo vehículo, en cliente (research.md R4) y en el trigger `private.validar_odometro_creciente()` **(nuevo, research.md R1)** |
| `cantidad` | numeric, not null | FR-001 |
| `costo_unitario` | numeric, not null | FR-001 |
| `costo_total` | numeric, not null | FR-002 — autocalculado con override manual (research.md R8); el valor que se guarda es el que esté en el campo al enviar |
| `factura_archivo_id` | uuid, nullable, FK → `archivos.id` | FR-007/FR-009 — puntero a la versión vigente; historial completo en `archivos` (research.md R3) |
| `estado` | enum `estado_registro` (`activo`\|`cancelado`), not null, default `activo` | FR-008/FR-014 |
| `motivo_cancelacion` | text, check `char_length <= 150` | **nueva columna de esta feature** (`schema_09`, research.md R1) — obligatorio al cancelar (FR-013), inmutable después (FR-014) |
| `creado_por` | uuid, not null, FK → `usuarios.id` | |
| `created_at` | timestamptz, not null | |

**Extensión de esta feature**: se agrega `motivo_cancelacion`, el trigger de validación de
odómetro creciente, y se reemplaza el trigger de inmutabilidad genérico
(`private.solo_permite_cancelar()`, compartido hasta ahora con `mantenimientos`) por uno propio
(`private.solo_permite_cancelar_combustible()`) que además exige `motivo_cancelacion` no vacío al
cancelar y permite que `factura_archivo_id` cambie mientras el registro siga `activo` (research.md
R1, R3) — el resto de las columnas permanece congelado exactamente igual que antes.

**Auditoría (research.md R11, `/speckit-analyze` hallazgo A1)**: `cargas_combustible` no tenía
ningún trigger de auditoría en ninguna migración previa — a diferencia de toda otra tabla de
negocio del proyecto. Esta feature agrega `private.audit_cargas_combustible()` (función dedicada,
no genérica, porque interpreta la columna `estado`): `accion = 'crear'` en `INSERT`, `'cancelar'`
en `UPDATE` cuando `estado` cambia a `cancelado`, `'editar'` en cualquier otro `UPDATE` (reemplazo
de factura).

**Transiciones**: `estado: activo → cancelado`, única e irreversible (FR-008/FR-014). No existe
`cancelado → activo`. `factura_archivo_id` puede cambiar libremente mientras `estado = 'activo'`
(cada cambio es un nuevo `insert` en `archivos` + `update` del puntero, nunca una edición in-place
— research.md R3); queda congelado junto con el resto al cancelar.

RLS (ya existente, sin cambios más allá de lo listado arriba):

- `cargas_combustible_select`: `tiene_permiso('combustible','ver')` (o admin/superusuario).
- `cargas_combustible_insert`: `tiene_permiso('combustible','crear')` (o admin/superusuario) —
  otorgado por defecto a todo operario nuevo.
- `cargas_combustible_update_solo_cancelar`: `tiene_permiso('combustible','cancelar')` (o
  admin/superusuario) **y** `estado = 'activo'` — no otorgado por defecto (FR-012).
- `cargas_combustible_no_delete`: `using (false)` — ningún rol puede hacer `DELETE` físico.

## Factura (`public.archivos`, sin tabla nueva)

| Campo relevante | Valor para esta feature |
|---|---|
| `tipo` | `'factura'` (ya en el enum `tipo_archivo` desde la migración inicial — sin cambio de esquema) |
| `entidad_tipo` | `'carga_combustible'` |
| `entidad_id` | `cargas_combustible.id` |
| `storage_path` | `factura/<empresa_id>/<carga_id>/<nombre_unico>` — mismo patrón de ruta que `poliza/`/`licencia/` |

Historial completo: `select * from archivos where entidad_tipo = 'carga_combustible' and
entidad_id = ? and tipo = 'factura' order by created_at desc` — idéntico a
`listarHistorialPoliza`/el equivalente de licencia, solo cambiando `entidad_tipo`/`tipo`.

## Validación de odómetro creciente (FR-003, research.md R4)

No es una relación nueva — se apoya en la propia tabla:

```sql
select max(odometro) from public.cargas_combustible
where vehiculo_id = ? and estado = 'activo'
```

Sin resultado (vehículo sin cargas activas previas) → cualquier odómetro se acepta. Con
resultado → el nuevo odómetro debe ser `>=` ese máximo (igual se acepta, solo se rechaza si es
estrictamente menor — Edge Cases, spec.md).

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature, con el contenido literal de
`docs/schema-reference/schema_09_combustible_ajustes.sql` (research.md R1) más el trigger de
auditoría (research.md R11, no incluido en `schema_09`):

1. `alter table public.cargas_combustible add column motivo_cancelacion text check
   (char_length(motivo_cancelacion) <= 150);`
2. `create function private.validar_odometro_creciente() ... create trigger
   trg_cargas_combustible_odometro_creciente before insert ...`
3. `drop trigger trg_cargas_combustible_inmutable on public.cargas_combustible; create function
   private.solo_permite_cancelar_combustible() ... create trigger
   trg_cargas_combustible_inmutable before update ...`
4. `create function private.audit_cargas_combustible() ... create trigger
   trg_cargas_combustible_auditoria after insert or update or delete on
   public.cargas_combustible ...` (research.md R11) — **nueva respecto a `schema_09`**, cierra la
   brecha detectada por `/speckit-analyze` (hallazgo A1).

No se modifica ninguna política RLS ni el enum `tipo_archivo` (`'factura'` ya existe) — todo lo
demás para esta feature ya está en producción local desde la migración inicial del proyecto.
