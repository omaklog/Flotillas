-- =====================================================================
-- Feature 002 — Catálogos Base (Tipos de Vehículo, Aseguradoras, Permisos)
--
-- Las tablas tipos_vehiculo/aseguradoras/permisos, su RLS y sus módulos de
-- permisos granulares ya existen desde Feature 001 (initial_schema.sql,
-- modulos_y_permisos.sql, permisos_ver_y_defaults.sql). Esta migración solo
-- agrega lo que faltaba (ver specs/002-catalogos-base/data-model.md,
-- sección "Extensiones sobre el esquema actual"):
--   1. CHECK de formato de clave en tipos_vehiculo y permisos.
--   2. updated_at + trigger set_updated_at en tipos_vehiculo y permisos
--      (aseguradoras ya la tenía).
--   3. Siembra automática de 3 tipos de vehículo al crear una empresa.
--   4. Auditoría (INSERT/UPDATE/DELETE) en las 3 tablas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. CHECK de formato de clave (FR-005, research.md R2)
-- ---------------------------------------------------------------------
alter table public.tipos_vehiculo
  add constraint chk_tipos_vehiculo_clave_formato
  check (clave ~ '^[a-z0-9_]+$' and char_length(clave) <= 50);

alter table public.permisos
  add constraint chk_permisos_clave_formato
  check (clave ~ '^[a-z0-9_]+$' and char_length(clave) <= 50);

-- ---------------------------------------------------------------------
-- 2. updated_at + trigger set_updated_at (data-model.md; aseguradoras ya
--    lo tenía desde initial_schema.sql — mismo patrón, sin reinventarlo)
-- ---------------------------------------------------------------------
alter table public.tipos_vehiculo
  add column updated_at timestamptz not null default now();

create trigger trg_tipos_vehiculo_updated_at before update on public.tipos_vehiculo
  for each row execute function private.set_updated_at();

alter table public.permisos
  add column updated_at timestamptz not null default now();

create trigger trg_permisos_updated_at before update on public.permisos
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Siembra automática de tipos de vehículo al crear una empresa
--    (FR-011, research.md R3 — mismo patrón que
--    private.otorgar_permisos_default_operario())
-- ---------------------------------------------------------------------
create or replace function private.sembrar_tipos_vehiculo_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tipos_vehiculo (empresa_id, clave, nombre) values
    (new.id, 'ligero', 'Vehículo ligero'),
    (new.id, 'pesado', 'Servicio pesado (más de 3.5 toneladas)'),
    (new.id, 'mat_peligrosos', 'Transporte de materiales peligrosos');
  return new;
end;
$$;

create trigger trg_empresas_sembrar_tipos_vehiculo
  after insert on public.empresas
  for each row execute function private.sembrar_tipos_vehiculo_default();

-- ---------------------------------------------------------------------
-- 4. Auditoría de las 3 tablas de catálogo (constitución §2, research.md
--    R4). No reutiliza private.audit_empresas_usuarios(): esa función
--    referencia old.activo/new.activo en tiempo de ejecución para decidir
--    'desactivar'/'reactivar', y ninguna de estas 3 tablas tiene columna
--    activo — fallaría en runtime al no existir el campo en la fila.
-- ---------------------------------------------------------------------
create or replace function private.audit_catalogo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entidad text := tg_table_name::text;
  v_empresa_id uuid;
  v_accion public.accion_auditoria;
begin
  if tg_op = 'INSERT' then
    v_empresa_id := new.empresa_id;
    v_accion := 'crear';
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (v_empresa_id, private.actor_id(), v_entidad, new.id, v_accion, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    v_empresa_id := coalesce(new.empresa_id, old.empresa_id);
    v_accion := 'editar';
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (v_empresa_id, private.actor_id(), v_entidad, new.id, v_accion, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    v_empresa_id := old.empresa_id;
    v_accion := 'eliminar';
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (v_empresa_id, private.actor_id(), v_entidad, old.id, v_accion, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_tipos_vehiculo_auditoria
  after insert or update or delete on public.tipos_vehiculo
  for each row execute function private.audit_catalogo();

create trigger trg_aseguradoras_auditoria
  after insert or update or delete on public.aseguradoras
  for each row execute function private.audit_catalogo();

create trigger trg_permisos_auditoria
  after insert or update or delete on public.permisos
  for each row execute function private.audit_catalogo();
