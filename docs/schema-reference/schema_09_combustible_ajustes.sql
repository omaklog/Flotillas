-- =====================================================================
-- Migración 9 — Combustible: motivo de cancelación, validación de
-- odómetro creciente, y separación del trigger de inmutabilidad
-- (compartido hasta ahora con mantenimientos; a partir de aquí cada
-- tabla tiene su propia función porque sus columnas "congeladas" ya
-- no son idénticas).
--   supabase migration new combustible_ajustes
-- =====================================================================

-- 1. Motivo de cancelación (mismo patrón que dar de baja un vehículo/conductor)
alter table public.cargas_combustible
  add column motivo_cancelacion text check (char_length(motivo_cancelacion) <= 150);

-- 2. Validar que el odómetro capturado sea >= al de la última carga ACTIVA de ese
--    vehículo (ignora canceladas: si se canceló, no es un dato confiable de referencia).
create or replace function private.validar_odometro_creciente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ultimo_odometro numeric;
begin
  select max(odometro) into ultimo_odometro
  from public.cargas_combustible
  where vehiculo_id = new.vehiculo_id
    and estado = 'activo';

  if ultimo_odometro is not null and new.odometro < ultimo_odometro then
    raise exception 'El odómetro (%) no puede ser menor al de la última carga activa de este vehículo (%)', new.odometro, ultimo_odometro;
  end if;

  return new;
end;
$$;

create trigger trg_cargas_combustible_odometro_creciente
  before insert on public.cargas_combustible
  for each row execute function private.validar_odometro_creciente();

-- 3. Separar el trigger de inmutabilidad: cargas_combustible ahora permite que
--    "estado" Y "motivo_cancelacion" cambien juntos al cancelar; el resto sigue
--    congelado. mantenimientos sigue usando private.solo_permite_cancelar() sin
--    cambios, hasta que su propio spec (feature futura) defina si necesita algo
--    distinto.
drop trigger trg_cargas_combustible_inmutable on public.cargas_combustible;

create or replace function private.solo_permite_cancelar_combustible()
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
  -- Bloquea cambios a cualquier columna operativa; factura_archivo_id SÍ puede
  -- cambiar (permite corregir/reemplazar el adjunto sin afectar la inmutabilidad
  -- de los datos financieros/operativos).
  if row(new.vehiculo_id, new.proveedor_id, new.producto_id, new.fecha, new.odometro,
         new.cantidad, new.costo_unitario, new.costo_total)
     is distinct from
     row(old.vehiculo_id, old.proveedor_id, old.producto_id, old.fecha, old.odometro,
         old.cantidad, old.costo_unitario, old.costo_total) then
    raise exception 'El registro es inmutable: solo se permite cancelar, no editar';
  end if;
  return new;
end;
$$;

create trigger trg_cargas_combustible_inmutable
  before update on public.cargas_combustible
  for each row execute function private.solo_permite_cancelar_combustible();
