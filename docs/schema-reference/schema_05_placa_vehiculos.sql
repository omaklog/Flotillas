-- =====================================================================
-- Migración 5 — placa obligatoria y única por empresa en vehiculos.
-- Se aplica DESPUÉS de las migraciones 1-4, que ya están corridas en el
-- proyecto real de Supabase.
--   supabase migration new placa_vehiculo_obligatoria
--
-- Nota: si ya hay filas en vehiculos con placa NULL, este ALTER falla.
-- Dado que Vehículos (Feature 003) aún no se implementa, la tabla debería
-- estar vacía; si no lo está, hay que backfillear placa antes de correr esto.
-- =====================================================================

alter table public.vehiculos
  alter column placa set not null;

alter table public.vehiculos
  add constraint uq_vehiculos_empresa_placa unique (empresa_id, placa);
