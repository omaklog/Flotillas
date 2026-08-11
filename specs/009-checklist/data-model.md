# Data Model: Checklist de Aditamentos y Revisión de Seguridad

> **Fuente de verdad**: `supabase/migrations/20260806044218_initial_schema.sql` (tablas
> `checklists`, `checklist_items`, RLS base, ambas inmutables desde el diseño original),
> `20260806044220_modulos_y_permisos.sql` + `20260806044221_permisos_ver_y_defaults.sql` (RLS
> granular por permiso, módulo `checklist` con `ver`/`crear` ya sembrados, otorgados por defecto)
> — todas ya aplicadas. Este documento describe ese estado real más la extensión que esta
> feature agrega (`docs/schema-reference/schema_11_checklist_plantillas.sql` + auditoría,
> research.md R1).

## Ítem de plantilla de checklist (`public.checklist_item_plantillas`, nueva tabla de esta feature)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `tipo_vehiculo_id` | uuid, not null, FK → `tipos_vehiculo.id` on delete cascade | FR-001 — un tipo de vehículo con ítems queda protegido de eliminación por esta FK (fuera de alcance de esta feature, ya cubierto por Catálogos Base 002) |
| `nombre_item` | text, not null | FR-001 |
| `es_critico` | boolean, not null, default `false` | FR-001 — sin efecto funcional en esta feature (research.md R11) |
| `orden` | int, not null, default `0` | FR-001 — captura manual, sin drag-and-drop |
| `created_at` | timestamptz, not null | |

RLS (ya definida en `schema_11`, sin cambios):

- `checklist_item_plantillas_select`: `tiene_permiso('checklist','ver')` (o admin/superusuario) —
  ya otorgado por defecto.
- `checklist_item_plantillas_write` (`for all` — cubre insert/update/delete):
  `tiene_permiso('checklist','editar')` (o admin/superusuario) — **no** otorgado por defecto
  (research.md R2: la acción `'eliminar'` que también agrega `schema_11` no está referenciada por
  ninguna política, `'editar'` es la única que importa a nivel de RLS).

## Checklist (`public.checklists`, ya existente + extensión de esta feature)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `vehiculo_id` | uuid, not null, FK → `vehiculos.id` | FR-003 — selector excluye dados de baja |
| `tipo_vehiculo_id` | uuid, not null, FK → `tipos_vehiculo.id` | copiado del vehículo al momento de la captura, determina qué plantilla se cargó |
| `conductor_id` | uuid, nullable, FK → `conductores.id` | **nueva columna de esta feature** (`schema_11`) — autocompletado desde la asignación activa, editable (FR-005) |
| `responsable_id` | uuid, not null, FK → `usuarios.id` | usuario que realiza la captura (FR-006) |
| `fecha` | timestamptz, not null, default `now()` | |
| `resultado` | enum `resultado_checklist` (`aprobado`\|`con_observaciones`), not null | FR-009, obligatorio |
| `created_at` | timestamptz, not null | |

**Inmutable desde el diseño original**: ninguna columna se actualiza jamás — RLS
(`checklists_no_update`/`checklists_no_delete`, ambas `using (false)`) bloquea todo `UPDATE`/
`DELETE` incondicionalmente, para cualquier rol (FR-010). No existe ninguna transición de estado
que auditar más allá del `INSERT` — `private.audit_catalogo()` genérica basta (research.md R1).

RLS (ya existente, sin cambios):

- `checklists_select`: `tiene_permiso('checklist','ver')` (o admin/superusuario).
- `checklists_insert`: `tiene_permiso('checklist','crear')` (o admin/superusuario) — otorgado
  por defecto a todo operario nuevo.
- `checklists_no_update`/`checklists_no_delete`: `using (false)` incondicional.

## Ítem de checklist (`public.checklist_items`, ya existente + extensión de esta feature)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `empresa_id` | uuid, not null, FK → `empresas.id` on delete cascade | |
| `checklist_id` | uuid, not null, FK → `checklists.id` on delete cascade | |
| `nombre_item` | text, not null | **copia congelada** del `nombre_item` de la plantilla al momento de capturar (FR-008) |
| `cumple` | boolean, not null | FR-007 |
| `observaciones` | text, nullable | FR-007 — obligatorio en la UI si `cumple = false`, sin `CHECK` a nivel de BD (validación de cliente, mismo criterio que otros campos condicionales de este proyecto) |
| `es_critico` | boolean, not null, default `false` | **nueva columna de esta feature** (`schema_11`) — copia congelada del ítem de plantilla (FR-008) |
| `plantilla_item_id` | uuid, nullable, FK → `checklist_item_plantillas.id` on delete set null | **nueva columna de esta feature** — referencia informativa al origen; `on delete set null` para que eliminar un ítem de plantilla (FR-002) nunca rompa ni borre checklists ya capturados |

**Inmutable, insert-only**: RLS (`checklist_items_no_update`/`_no_delete`, `using (false)`) ya lo
garantizaba desde el diseño original. `private.audit_catalogo()` genérica sobre `INSERT` es
suficiente (research.md R1) — en la práctica, como con `mantenimiento_detalles` (008), solo
audita creación.

RLS (ya existente, sin cambios):

- `checklist_items_select`: `tiene_permiso('checklist','ver')` (o admin/superusuario).
- `checklist_items_insert`: `tiene_permiso('checklist','crear')` (o admin/superusuario) — mismo
  permiso que el checklist padre.
- `_no_update`/`_no_delete`: `using (false)` incondicional.

## Conductor activo de un vehículo (FR-005, research.md R7)

No es una relación nueva — se apoya en `asignaciones_conductor_vehiculo` (Feature 005):

```sql
select conductor_id from public.asignaciones_conductor_vehiculo
where vehiculo_id = ? and fecha_fin is null
```

Como máximo una fila por el índice único parcial `uq_asignacion_vehiculo_activa` — sin
ambigüedad que resolver. Sin resultado → el campo de conductor del formulario queda vacío,
selección manual requerida.

## Extensiones sobre el esquema actual (resumen para `/speckit-tasks`)

Una sola migración nueva de esta feature, con el contenido literal de
`docs/schema-reference/schema_11_checklist_plantillas.sql` (research.md R1) más 3 triggers de
auditoría genéricos:

1. `create table public.checklist_item_plantillas (...)` + su RLS (`_select`/`_write`) + índices.
2. `insert into public.acciones_disponibles (...) values ('checklist','editar',...),
   ('checklist','eliminar',...)`.
3. `alter table public.checklists add column conductor_id uuid references
   public.conductores(id);` + índice.
4. `alter table public.checklist_items add column es_critico boolean not null default false, add
   column plantilla_item_id uuid references public.checklist_item_plantillas(id) on delete set
   null;` + índice.
5. `create trigger trg_checklist_item_plantillas_auditoria after insert or update or delete on
   public.checklist_item_plantillas for each row execute function private.audit_catalogo();`
   (research.md R1) — **nueva respecto a `schema_11`**.
6. `create trigger trg_checklists_auditoria after insert or update or delete on public.checklists
   for each row execute function private.audit_catalogo();` (research.md R1) — **nueva**.
7. `create trigger trg_checklist_items_auditoria after insert or update or delete on
   public.checklist_items for each row execute function private.audit_catalogo();`
   (research.md R1) — **nueva**.

No se modifica ninguna política RLS existente ni ningún enum — todo lo demás para esta feature ya
está en producción local desde la migración inicial del proyecto.
