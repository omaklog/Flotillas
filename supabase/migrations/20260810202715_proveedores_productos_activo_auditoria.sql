-- =====================================================================
-- Feature 006 — Catálogos Base II (Proveedores + Productos)
--
-- proveedores y productos, con su RLS granular completa
-- (tiene_permiso('proveedores'|'productos', ...)), ya existen desde
-- Feature 001. Esta migración agrega lo que falta (ver
-- specs/006-catalogos-base-ii/data-model.md, sección "Extensiones sobre
-- el esquema actual"):
--   1. proveedores.activo/motivo_baja, tal cual
--      docs/schema-reference/schema_08_proveedores_activo.sql.
--   2. Auditoría de proveedores (reutiliza private.audit_empresas_usuarios(),
--      sin función nueva — misma semántica no invertida que
--      conductores/empresas/usuarios) y de productos (reutiliza
--      private.audit_catalogo(), sin función nueva — tabla sin columna
--      activo, mismo criterio que tipos_vehiculo/aseguradoras/permisos).
--   Ninguna política de RLS se modifica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. proveedores.activo/motivo_baja (research.md R2)
-- ---------------------------------------------------------------------
alter table public.proveedores
  add column activo boolean not null default true,
  add column motivo_baja text check (char_length(motivo_baja) <= 150);

-- ---------------------------------------------------------------------
-- 2. Auditoría (research.md R2).
-- ---------------------------------------------------------------------
create trigger trg_proveedores_auditoria
  after insert or update or delete on public.proveedores
  for each row execute function private.audit_empresas_usuarios();

create trigger trg_productos_auditoria
  after insert or update or delete on public.productos
  for each row execute function private.audit_catalogo();
