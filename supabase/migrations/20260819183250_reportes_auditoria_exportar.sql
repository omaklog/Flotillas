-- =====================================================================
-- Migración — Feature 013 (Reportes). Único cambio de esquema de esta
-- feature: agrega 'exportar' a accion_auditoria para poder registrar en
-- la bitácora cada exportación de reporte (Excel/PDF) desde el endpoint
-- privilegiado server/api/reportes/auditar-exportacion.post.ts —
-- exportar un reporte no dispara ningún trigger de negocio existente
-- (no es un insert/update/delete sobre una tabla de negocio), así que
-- necesita su propia acción explícita (data-model.md, research.md R4).
--
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción en la
-- que se agrega, por eso esta migración no combina nada más.
-- =====================================================================

alter type accion_auditoria add value 'exportar';
