-- =====================================================================
-- Feature 005 — Asignación Conductor-Vehículo
--
-- asignaciones_conductor_vehiculo (creada por Feature 004) nunca recibió
-- trigger de auditoría — se agrega aquí reutilizando
-- private.audit_catalogo() ya existente (genérica: usa tg_table_name y
-- new.empresa_id/old.empresa_id, sin ninguna semántica de estado tipo
-- activo/baja que requiera una función dedicada). research.md R2.
-- =====================================================================

create trigger trg_asignaciones_conductor_vehiculo_auditoria
  after insert or update or delete on public.asignaciones_conductor_vehiculo
  for each row execute function private.audit_catalogo();
