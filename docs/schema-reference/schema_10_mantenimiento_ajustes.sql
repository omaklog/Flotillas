-- =====================================================================
-- Migración 10 — Mantenimiento: cantidad en detalles (Producto/Refacción),
-- motivo de cancelación y trigger de inmutabilidad propio (mismo criterio
-- que se aplicó a cargas_combustible en la migración 9).
--   supabase migration new mantenimiento_ajustes
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
--    y mantenimientos tienen cada una la suya desde las migraciones 9 y 10).
drop function if exists private.solo_permite_cancelar();
