-- =====================================================================
-- Migración 7 — Ajustes a conductores: motivo al desactivar (mismo
-- patrón que vehículos) y número de licencia único por empresa.
-- Se aplica DESPUÉS de las migraciones 1-6, ya corridas en el proyecto real.
--   supabase migration new conductores_ajustes
--
-- Nota: si ya hay filas de conductores con numero_licencia duplicado
-- dentro de la misma empresa, el UNIQUE falla al aplicarse — revisar antes.
-- =====================================================================

alter table public.conductores
  add column motivo_baja text check (char_length(motivo_baja) <= 150);

alter table public.conductores
  add constraint uq_conductores_empresa_licencia unique (empresa_id, numero_licencia);
