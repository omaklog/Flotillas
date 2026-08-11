-- =====================================================================
-- Bitácora de Servicios Obligatorios (010): a diferencia de 007/008/009,
-- la tabla, su enum, y su RLS con tiene_permiso() ya existen desde la
-- migración inicial del proyecto (research.md R1) — lo único que falta es
-- el valor de enum para el comprobante (schema_12_tipo_archivo_testigo.sql,
-- contenido literal) y un trigger de auditoría que ninguna migración
-- previa le agregó (research.md R3, mismo gap ya encontrado y corregido en
-- Combustible/Mantenimiento/Checklist).
--
-- Nota: `ALTER TYPE ... ADD VALUE` no puede usarse en la misma transacción
-- en la que ese valor se inserta por primera vez — esta migración se
-- limita al ALTER y al trigger, sin ningún INSERT/UPDATE que use
-- 'testigo_servicio'.
-- =====================================================================

alter type public.tipo_archivo add value 'testigo_servicio';

create trigger trg_servicios_obligatorios_auditoria
  after insert or update or delete on public.servicios_obligatorios
  for each row execute function private.audit_catalogo();
