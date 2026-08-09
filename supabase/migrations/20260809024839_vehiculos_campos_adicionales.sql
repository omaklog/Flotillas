-- =====================================================================
-- Campos adicionales del vehículo (FR-001 ampliado, Clarifications
-- sesión 2026-08-08, segunda ronda): VIN, kilometraje actual,
-- combustible y transmisión — datos intrínsecos del vehículo que el
-- mockup de Stitch muestra y que no dependían de ninguna feature
-- todavía no construida (a diferencia de "Conductor Asignado"/"Último
-- Mantenimiento", que sí siguen fuera de alcance). Los 4 son opcionales.
-- =====================================================================

alter table public.vehiculos
  add column vin text,
  add column kilometraje_actual numeric,
  add column combustible text,
  add column transmision text;
