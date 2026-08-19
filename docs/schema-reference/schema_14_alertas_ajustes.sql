-- =====================================================================
-- Migración 14 — Alertas: fecha_vencimiento pasa a ser opcional (los
-- checklists con observaciones no tienen una fecha de vencimiento real,
-- solo el momento en que se marcaron), y un índice único parcial que
-- evita que el cron cree alertas duplicadas para lo mismo.
--   supabase migration new alertas_ajustes
-- =====================================================================

alter table public.alertas
  alter column fecha_vencimiento drop not null;

-- Evita duplicar una alerta abierta (pendiente o enviada) para la misma
-- entidad+tipo — protección extra por si el cron corre dos veces o hay un bug.
create unique index uq_alertas_abiertas
  on public.alertas (empresa_id, tipo, entidad_tipo, entidad_id)
  where estado in ('pendiente', 'enviada');
