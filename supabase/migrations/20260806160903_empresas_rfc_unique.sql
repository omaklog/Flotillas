-- =====================================================================
-- Migración 6 (Feature 001, US1) — `empresas.rfc` sin restricción UNIQUE
-- en schema.sql v1. contracts/empresas.md exige rechazar altas con RFC
-- duplicado (409 rfc_duplicado); sin esto, la validación solo viviría en
-- server/api/ (check-then-insert), con condición de carrera posible.
-- Se refuerza a nivel de base de datos, consistente con la integridad de
-- datos que exige la constitución §2.
-- =====================================================================

alter table public.empresas
  add constraint empresas_rfc_unique unique (rfc);
