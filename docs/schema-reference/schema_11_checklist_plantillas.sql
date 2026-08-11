-- =====================================================================
-- Migración 11 — Checklist: plantilla de ítems por tipo de vehículo
-- (por empresa), conductor activo en el checklist, y un campo
-- "es_critico" preparado para una futura regla de aprobación automática
-- (no se implementa el cálculo automático todavía — resultado sigue
-- siendo manual, según se decidió).
--   supabase migration new checklist_plantillas
-- =====================================================================

-- 1. Plantilla de ítems por tipo de vehículo, por empresa (mismo criterio de
--    catálogo por tenant que tipos_vehiculo/productos).
create table public.checklist_item_plantillas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo_vehiculo_id uuid not null references public.tipos_vehiculo(id) on delete cascade,
  nombre_item text not null,
  es_critico boolean not null default false, -- hook para futura regla de aprobación automática
  orden int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.checklist_item_plantillas enable row level security;

create policy "checklist_item_plantillas_select" on public.checklist_item_plantillas for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('checklist','ver'))));

create policy "checklist_item_plantillas_write" on public.checklist_item_plantillas for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('checklist','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('checklist','editar'))));

create index idx_checklist_item_plantillas_empresa_id on public.checklist_item_plantillas (empresa_id);
create index idx_checklist_item_plantillas_tipo_vehiculo on public.checklist_item_plantillas (tipo_vehiculo_id, orden);

-- 2. El módulo 'checklist' solo tenía ver/crear; administrar la plantilla necesita editar/eliminar.
insert into public.acciones_disponibles (modulo_clave, accion, nombre) values
  ('checklist', 'editar', 'Editar plantilla de checklist'),
  ('checklist', 'eliminar', 'Eliminar ítem de plantilla de checklist');

-- 3. Conductor activo del vehículo al momento del checklist (autocompletado desde
--    asignaciones_conductor_vehiculo, editable si no coincide con la realidad).
alter table public.checklists
  add column conductor_id uuid references public.conductores(id);

create index idx_checklists_conductor_id on public.checklists (conductor_id);

-- 4. checklist_items: copia inmutable del nombre e "es_critico" al momento del
--    checklist (no se referencia la plantilla en vivo, para no reinterpretar
--    retroactivamente checklists ya hechos si la plantilla cambia después —
--    mismo criterio que ya aplicamos a unidades de medida y tipo de producto).
alter table public.checklist_items
  add column es_critico boolean not null default false,
  add column plantilla_item_id uuid references public.checklist_item_plantillas(id) on delete set null;

create index idx_checklist_items_plantilla_item_id on public.checklist_items (plantilla_item_id);

-- =====================================================================
-- Nota para cuando se quiera activar la regla automática de aprobación:
--   La lógica sería algo como "si existe algún checklist_items con
--   cumple=false y es_critico=true, forzar resultado='con_observaciones'"
--   — no se implementa como trigger todavía porque el resultado sigue
--   siendo una decisión manual de quien hace el checklist.
-- =====================================================================
