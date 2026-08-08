-- =====================================================================
-- Feature 003 — Vehículos
--
-- Las tablas vehiculos/vehiculo_permisos/archivos, su RLS y el módulo de
-- permisos granulares ya existen desde Feature 001 (initial_schema.sql,
-- modulos_y_permisos.sql, permisos_ver_y_defaults.sql); placa ya es
-- NOT NULL + UNIQUE(empresa_id, placa) desde una migración previa a
-- Catálogos Base. Esta migración agrega lo que faltaba (ver
-- specs/003-vehiculos/data-model.md, sección "Extensiones sobre el
-- esquema actual"):
--   1. Bucket de Storage `documentos` (privado) + RLS de storage.objects.
--   2. Auditoría de vehiculos (nueva función, interpreta `baja`).
--   3. Auditoría de vehiculo_permisos y archivos (reusa audit_catalogo()
--      ya creada en la migración de Catálogos Base).
--   4. Ajuste de archivos_delete para aceptar el permiso granular.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bucket de Storage `documentos` + RLS de storage.objects
--    (research.md R3). Ruta: {tipo}/{empresa_id}/{entidad_id}/{archivo}
--    — el segmento de empresa es el [2] (el [1] es {tipo}), a diferencia
--    de logos-empresas ([1]) que no tiene ese prefijo.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos',
  'documentos',
  false, -- privado: nunca servido como URL pública, solo vía createSignedUrl
  10485760, -- 10 MiB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy documentos_select on storage.objects
  for select
  using (
    bucket_id = 'documentos'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[2] = private.empresa_id()::text
        and (private.rol() = 'admin'::rol_usuario or private.tiene_permiso('vehiculos', 'ver'))
      )
    )
  );

create policy documentos_insert on storage.objects
  for insert
  with check (
    bucket_id = 'documentos'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[2] = private.empresa_id()::text
        and (private.rol() = 'admin'::rol_usuario or private.tiene_permiso('vehiculos', 'editar'))
      )
    )
  );

create policy documentos_update on storage.objects
  for update
  using (
    bucket_id = 'documentos'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[2] = private.empresa_id()::text
        and (private.rol() = 'admin'::rol_usuario or private.tiene_permiso('vehiculos', 'editar'))
      )
    )
  );

create policy documentos_delete on storage.objects
  for delete
  using (
    bucket_id = 'documentos'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[2] = private.empresa_id()::text
        and (private.rol() = 'admin'::rol_usuario or private.tiene_permiso('vehiculos', 'editar'))
      )
    )
  );

-- ---------------------------------------------------------------------
-- 2. Auditoría de vehiculos (research.md R4). No reutiliza
--    private.audit_empresas_usuarios(): esa función interpreta
--    old.activo/new.activo, y vehiculos no tiene esa columna — tiene
--    `baja`, con semántica invertida (true = dado de baja).
-- ---------------------------------------------------------------------
create or replace function private.audit_vehiculos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa_id uuid;
  v_accion public.accion_auditoria;
begin
  if tg_op = 'INSERT' then
    v_empresa_id := new.empresa_id;
    v_accion := 'crear';
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (v_empresa_id, private.actor_id(), 'vehiculos', new.id, v_accion, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    v_empresa_id := coalesce(new.empresa_id, old.empresa_id);
    if old.baja is distinct from new.baja then
      v_accion := case when new.baja then 'desactivar' else 'reactivar' end;
    else
      v_accion := 'editar';
    end if;
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (v_empresa_id, private.actor_id(), 'vehiculos', new.id, v_accion, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    v_empresa_id := old.empresa_id;
    v_accion := 'eliminar';
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (v_empresa_id, private.actor_id(), 'vehiculos', old.id, v_accion, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_vehiculos_auditoria
  after insert or update or delete on public.vehiculos
  for each row execute function private.audit_vehiculos();

-- ---------------------------------------------------------------------
-- 3. Auditoría de vehiculo_permisos y archivos, reusando
--    private.audit_catalogo() (ya creada en la migración de Catálogos
--    Base — ninguna de las dos tablas tiene columna de estado tipo
--    activo/baja, así que el molde genérico aplica sin cambios).
-- ---------------------------------------------------------------------
create trigger trg_vehiculo_permisos_auditoria
  after insert or update or delete on public.vehiculo_permisos
  for each row execute function private.audit_catalogo();

create trigger trg_archivos_auditoria
  after insert or update or delete on public.archivos
  for each row execute function private.audit_catalogo();

-- ---------------------------------------------------------------------
-- 4. Ajuste de archivos_delete: hoy exige rol = 'admin' a secas
--    (initial_schema.sql); esta feature necesita que un operario con
--    tiene_permiso('vehiculos','editar') también pueda disparar la
--    limpieza de archivos al eliminar un vehículo (FR-016a) o al
--    reemplazar una póliza — igual que ya puede editar el vehículo
--    mismo (data-model.md, sección archivos, Nota).
-- ---------------------------------------------------------------------
drop policy "archivos_delete" on public.archivos;
create policy "archivos_delete" on public.archivos for delete
  using (
    private.es_superusuario()
    or (
      empresa_id = private.empresa_id()
      and (private.rol() = 'admin'::rol_usuario or private.tiene_permiso('vehiculos', 'editar'))
    )
  );
