-- =====================================================================
-- Feature 009 — Checklist de Aditamentos y Revisión de Seguridad
--
-- Aplica docs/schema-reference/schema_11_checklist_plantillas.sql tal cual
-- (plantilla de ítems por tipo de vehículo, conductor en checklists,
-- campos de copia en checklist_items) más 3 triggers de auditoría
-- genéricos que ese archivo de referencia no incluye — ninguna de las 3
-- tablas de esta feature tiene una columna de estado que distinguir
-- (checklists/checklist_items son insert-only, ya bloqueadas por RLS
-- using(false); checklist_item_plantillas no tiene activo/baja), así que
-- private.audit_catalogo() genérica basta, sin funciones dedicadas
-- (research.md R1).
-- =====================================================================

-- 1. Plantilla de ítems por tipo de vehículo, por empresa.
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
--    checklist (no se referencia la plantilla en vivo).
alter table public.checklist_items
  add column es_critico boolean not null default false,
  add column plantilla_item_id uuid references public.checklist_item_plantillas(id) on delete set null;

create index idx_checklist_items_plantilla_item_id on public.checklist_items (plantilla_item_id);

-- 5. Auditoría genérica de las 3 tablas (research.md R1) — sin funciones dedicadas,
--    ninguna tiene semántica de estado que distinguir.
create trigger trg_checklist_item_plantillas_auditoria
  after insert or update or delete on public.checklist_item_plantillas
  for each row execute function private.audit_catalogo();

create trigger trg_checklists_auditoria
  after insert or update or delete on public.checklists
  for each row execute function private.audit_catalogo();

create trigger trg_checklist_items_auditoria
  after insert or update or delete on public.checklist_items
  for each row execute function private.audit_catalogo();
