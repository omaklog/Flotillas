-- =====================================================================
-- Foto del vehículo (FR-023 a FR-025, Clarifications sesión 2026-08-08):
-- opcional, mismo bucket `documentos` que la póliza, pero SIN historial
-- de versiones — un solo puntero que se reemplaza. A diferencia de la
-- póliza, no necesita triggers de auditoría nuevos: `archivos` ya tiene
-- el suyo (audit_catalogo(), migración de Foundational), y `vehiculos`
-- ya tiene el suyo (audit_vehiculos()) — ambos cubren la columna nueva
-- automáticamente vía to_jsonb(new)/to_jsonb(old).
--
-- Nota: `ALTER TYPE ... ADD VALUE` no puede usarse en la misma
-- transacción en la que se inserta una fila con ese valor — esta
-- migración se limita a los dos ALTER, sin ninguna manipulación de
-- datos que use 'foto'.
-- =====================================================================

alter type public.tipo_archivo add value 'foto';

alter table public.vehiculos
  add column foto_archivo_id uuid references public.archivos(id);
