-- =====================================================================
-- Migración 13 — Bitácora de auditoría automática. Hasta ahora la tabla
-- auditoria existía pero nada escribía en ella. Se agrega un trigger
-- genérico que se conecta a cada tabla de negocio, para que ningún
-- endpoint tenga que "acordarse" de auditar manualmente (defensa en
-- profundidad, consistente con la constitución §2).
--   supabase migration new bitacora_auditoria_automatica
-- =====================================================================

create or replace function private.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid;
  v_empresa_id uuid;
  v_accion accion_auditoria;
begin
  select id into v_usuario_id from public.usuarios where auth_user_id = auth.uid();

  v_empresa_id := coalesce(new.empresa_id, old.empresa_id);

  v_accion := case
    when TG_OP = 'INSERT' then 'crear'
    when TG_OP = 'DELETE' then 'eliminar'
    -- combustible y mantenimiento solo permiten UPDATE para cancelar (ya lo
    -- garantiza su propio trigger de inmutabilidad), así que un UPDATE ahí
    -- siempre es, de hecho, una cancelación.
    when TG_OP = 'UPDATE' and TG_TABLE_NAME in ('cargas_combustible', 'mantenimientos') then 'cancelar'
    else 'editar'
  end;

  insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
  values (
    v_empresa_id,
    v_usuario_id,
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    v_accion,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

-- Se conecta a todas las tablas de negocio que tienen empresa_id y un id propio.
-- No se conecta a: modulos, acciones_disponibles (catálogos globales del sistema,
-- no mutables por usuarios de una empresa), ni a la propia auditoria (evita
-- recursión), ni a usuario_permisos (se audita distinto, ver nota al final).
do $$
declare
  t text;
  tablas text[] := array[
    'empresas', 'usuarios', 'tipos_vehiculo', 'aseguradoras', 'proveedores',
    'conductores', 'permisos', 'vehiculos', 'vehiculo_permisos', 'productos',
    'cargas_combustible', 'mantenimientos', 'mantenimiento_detalles',
    'checklists', 'checklist_items', 'checklist_item_plantillas',
    'servicios_obligatorios', 'archivos', 'asignaciones_conductor_vehiculo'
  ];
begin
  foreach t in array tablas loop
    execute format(
      'create trigger trg_auditoria_%1$s after insert or update or delete on public.%1$s
       for each row execute function private.registrar_auditoria();',
      t
    );
  end loop;
end $$;

-- usuario_permisos SÍ se audita (es seguridad-sensible: quién le dio qué
-- permiso a quién), pero solo insert/delete — no tiene UPDATE en su flujo real.
create trigger trg_auditoria_usuario_permisos
  after insert or delete on public.usuario_permisos
  for each row execute function private.registrar_auditoria();

-- =====================================================================
-- Nota: "editar" genérico no distingue, por ejemplo, "dar de baja" de
-- "cambiar el color del vehículo" — ambos quedan como accion='editar'.
-- El detalle real vive en valores_antes/valores_despues (jsonb); la UI
-- de la bitácora (Feature 011) es responsable de mostrar el diff de forma
-- legible, no de que la BD adivine la intención de cada cambio.
-- =====================================================================
