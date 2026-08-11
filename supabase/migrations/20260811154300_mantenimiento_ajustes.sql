-- =====================================================================
-- Feature 008 — Mantenimiento (Correctivo y Preventivo)
--
-- Aplica docs/schema-reference/schema_10_mantenimiento_ajustes.sql tal cual
-- (cantidad en detalles, motivo de cancelación, trigger de inmutabilidad
-- propio, elimina la función genérica compartida con cargas_combustible)
-- más 2 triggers de auditoría que ese archivo de referencia no incluye —
-- mantenimientos era, junto con cargas_combustible (ya resuelto en 007), la
-- única tabla de negocio del proyecto sin ninguno (research.md R1/R11).
-- =====================================================================

-- 1. Cantidad para líneas tipo Producto/Refacción (llanta y servicio ya tienen
--    sus propios campos específicos y no la usan).
alter table public.mantenimiento_detalles
  add column cantidad numeric;

-- 2. Motivo de cancelación, mismo patrón que combustible.
alter table public.mantenimientos
  add column motivo_cancelacion text check (char_length(motivo_cancelacion) <= 150);

-- 3. Trigger de inmutabilidad propio de mantenimientos (antes compartía función
--    genérica con cargas_combustible; ya no aplica desde que sus columnas
--    "congeladas" y el manejo de motivo_cancelacion divergen).
drop trigger if exists trg_mantenimientos_inmutable on public.mantenimientos;

create or replace function private.solo_permite_cancelar_mantenimiento()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'cancelado' then
    raise exception 'No se puede modificar un registro ya cancelado';
  end if;
  if new.estado not in ('activo', 'cancelado') then
    raise exception 'Transición de estado inválida';
  end if;
  if new.estado = 'cancelado' and (new.motivo_cancelacion is null or char_length(trim(new.motivo_cancelacion)) = 0) then
    raise exception 'Se requiere un motivo para cancelar el registro';
  end if;
  -- factura_archivo_id queda fuera de esta lista a propósito (mismo criterio que
  -- combustible): el adjunto se puede reemplazar sin romper la inmutabilidad.
  if row(new.vehiculo_id, new.proveedor_id, new.tipo, new.fecha, new.costo_total, new.notas)
     is distinct from
     row(old.vehiculo_id, old.proveedor_id, old.tipo, old.fecha, old.costo_total, old.notas) then
    raise exception 'El registro es inmutable: solo se permite cancelar, no editar';
  end if;
  return new;
end;
$$;

create trigger trg_mantenimientos_inmutable
  before update on public.mantenimientos
  for each row execute function private.solo_permite_cancelar_mantenimiento();

-- 4. La función genérica original ya no la usa ninguna tabla (cargas_combustible
--    y mantenimientos tienen cada una la suya desde las migraciones de las
--    Features 007 y 008).
drop function if exists private.solo_permite_cancelar();

-- 5. Auditoría dedicada de mantenimientos (no genérica): interpreta la columna
--    "estado" para distinguir 'cancelar' de un 'editar' cualquiera (ej.
--    reemplazo de factura), mismo criterio que private.audit_vehiculos() y
--    private.audit_cargas_combustible() (research.md R11).
create or replace function private.audit_mantenimientos()
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
    values (v_empresa_id, private.actor_id(), 'mantenimientos', new.id, v_accion, null, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    v_empresa_id := coalesce(new.empresa_id, old.empresa_id);
    if old.estado is distinct from new.estado then
      v_accion := 'cancelar';
    else
      v_accion := 'editar';
    end if;
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (v_empresa_id, private.actor_id(), 'mantenimientos', new.id, v_accion, to_jsonb(old), to_jsonb(new));
    return new;
  elsif tg_op = 'DELETE' then
    v_empresa_id := old.empresa_id;
    v_accion := 'eliminar';
    insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
    values (v_empresa_id, private.actor_id(), 'mantenimientos', old.id, v_accion, to_jsonb(old), null);
    return old;
  end if;
  return null;
end;
$$;

create trigger trg_mantenimientos_auditoria
  after insert or update or delete on public.mantenimientos
  for each row execute function private.audit_mantenimientos();

-- 6. Auditoría de mantenimiento_detalles: genérica (audit_catalogo), sin
--    semántica de estado propia — sus políticas RLS ya bloquean UPDATE/DELETE
--    (using (false)), así que en la práctica solo audita INSERT.
create trigger trg_mantenimiento_detalles_auditoria
  after insert or update or delete on public.mantenimiento_detalles
  for each row execute function private.audit_catalogo();
