-- =====================================================================
-- Migración 5 (Feature 001) — extensiones que schema.sql v1 no cubre:
--   - empresas.activo: schema.sql no tiene forma de desactivar una empresa,
--     pero US7/FR-006/FR-007/FR-008 lo requieren (ver data-model.md
--     "Extensiones sobre schema.sql" y research.md R12).
--   - accion_auditoria: agrega 'desactivar'/'reactivar', distintos de un
--     'editar' genérico.
--   - Triggers de auditoría automática sobre empresas/usuarios: schema.sql
--     documenta la bitácora como "solo INSERT vía trigger de aplicación"
--     (es decir, asumía que el código de server/api/ insertaría a mano);
--     esta feature lo implementa como trigger de base de datos en su
--     lugar (research.md R8), para que no dependa de que cada endpoint
--     nuevo recuerde loguear.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. empresas.activo
-- ---------------------------------------------------------------------
alter table public.empresas
  add column activo boolean not null default true;

-- ---------------------------------------------------------------------
-- 2. Nuevos valores del enum de auditoría
-- ---------------------------------------------------------------------
alter type accion_auditoria add value if not exists 'desactivar';
alter type accion_auditoria add value if not exists 'reactivar';

-- ---------------------------------------------------------------------
-- 2b. auditoria.usuario_id pasa a nullable (schema.sql lo define NOT NULL,
--     pero no hay forma de garantizar un actor conocido en toda escritura
--     vía service_role — ej. la creación de la primera empresa+admin de
--     una empresa nueva no tiene todavía un usuario "admin" al que
--     atribuirle la fila. Ver private.actor_id() más abajo y
--     data-model.md, que ya documentaba este campo como nullable).
-- ---------------------------------------------------------------------
alter table public.auditoria
  alter column usuario_id drop not null;

-- Mismo caso para empresa_id: un superusuario tiene empresa_id = NULL en `usuarios`, y
-- la auditoría de su creación/edición no tiene empresa a la cual atribuirse.
alter table public.auditoria
  alter column empresa_id drop not null;

-- ---------------------------------------------------------------------
-- 3. Identidad del actor dentro de un trigger cuando la escritura viene
--    de server/api/ vía service_role (auth.uid() es NULL en ese caso,
--    porque el cliente service_role no lleva JWT de usuario).
--
--    Convención: todo endpoint de server/api/ que escriba en empresas o
--    usuarios usando supabaseAdmin (service_role) DEBE ejecutar antes,
--    en la misma conexión/transacción:
--      select set_config('app.actor_id', '<uuid del usuario que realiza
--      la acción>', true);
--    Si no se hace, auditoria.usuario_id queda NULL para esa fila (el
--    campo es nullable) en vez de fallar la escritura.
-- ---------------------------------------------------------------------
create or replace function private.actor_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    (select id from public.usuarios where auth_user_id = auth.uid()),
    nullif(current_setting('app.actor_id', true), '')::uuid
  );
$$;

-- ---------------------------------------------------------------------
-- 4. Trigger genérico de auditoría para empresas/usuarios.
--    accion:
--      - 'crear'      en INSERT
--      - 'eliminar'   en DELETE
--      - 'desactivar' en UPDATE cuando activo pasa de true a false
--      - 'reactivar'  en UPDATE cuando activo pasa de false a true
--      - 'editar'     en cualquier otro UPDATE
-- ---------------------------------------------------------------------
create or replace function private.audit_empresas_usuarios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entidad text := tg_table_name::text;
  -- 'usuarios' plural ya coincide con lo documentado en data-model.md;
  -- 'empresas' también. Ambas tablas ya tienen empresa_id.
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
    if old.activo is distinct from new.activo then
      v_accion := case when new.activo then 'reactivar' else 'desactivar' end;
    else
      v_accion := 'editar';
    end if;
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

-- empresas.empresa_id no existe en sí misma (es la propia empresa) — para la fila de
-- auditoría de una empresa, empresa_id = su propio id.
create or replace function private.audit_empresas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accion public.accion_auditoria;
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    v_accion := 'crear';
    v_id := new.id;
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (new.id, private.actor_id(), 'empresa', new.id, v_accion, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if old.activo is distinct from new.activo then
      v_accion := case when new.activo then 'reactivar' else 'desactivar' end;
    else
      v_accion := 'editar';
    end if;
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (new.id, private.actor_id(), 'empresa', new.id, v_accion, to_jsonb(old), to_jsonb(new));
    return new;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_empresas_auditoria on public.empresas;
create trigger trg_empresas_auditoria
  after insert or update on public.empresas
  for each row execute function private.audit_empresas();

drop trigger if exists trg_usuarios_auditoria on public.usuarios;
create trigger trg_usuarios_auditoria
  after insert or update or delete on public.usuarios
  for each row execute function private.audit_empresas_usuarios();

-- ---------------------------------------------------------------------
-- 5. RLS: empresas_select/empresas_update ya existentes en schema.sql no
--    necesitan cambios por agregar `activo` (es una columna más de la
--    misma fila, no un nuevo alcance de acceso). El bloqueo de login por
--    empresa/usuario inactivo se resuelve en la aplicación
--    (app/pages/login.vue y app/middleware/auth.ts), no en RLS — RLS no
--    puede impedir un signInWithPassword, solo el acceso a datos después
--    de autenticado (ver contracts/auth.md).
-- ---------------------------------------------------------------------
