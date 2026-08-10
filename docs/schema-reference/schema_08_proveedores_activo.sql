-- =====================================================================
-- Migración 8 — Proveedores: agrega activo/motivo_baja, mismo patrón
-- que vehículos y conductores, por consistencia.
--   supabase migration new proveedores_activo
-- =====================================================================

alter table public.proveedores
  add column activo boolean not null default true,
  add column motivo_baja text check (char_length(motivo_baja) <= 150);
