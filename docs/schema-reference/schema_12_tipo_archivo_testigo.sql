-- =====================================================================
-- Migración 12 — Nuevo valor de enum tipo_archivo para adjuntar el
-- comprobante/certificado de un servicio obligatorio.
--   supabase migration new tipo_archivo_testigo_servicio
--
-- Nota: ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción
-- en la que ese valor nuevo se INSERTA por primera vez — por eso va sola
-- en su propia migración, separada de cualquier INSERT/uso posterior.
-- =====================================================================

alter type tipo_archivo add value 'testigo_servicio';
