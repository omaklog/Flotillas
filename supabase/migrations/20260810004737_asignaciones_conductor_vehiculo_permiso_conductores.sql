-- =====================================================================
-- Actualización sobre asignaciones_conductor_vehiculo (aplicada en
-- 20260809215241_conductores_ajustes.sql, Feature 004 — Conductores).
--
-- docs/schema-reference/schema_06_asignaciones_conductor_vehiculo.sql se
-- amplió después de esa migración: las políticas _select/_write pasan de
-- aceptar solo tiene_permiso('vehiculos', ...) a aceptar también
-- tiene_permiso('conductores', ...), previendo que Feature 005 permita
-- asignar desde el detalle del vehículo O del conductor. Ampliación pura
-- de acceso (agrega un OR) — nadie que ya podía leer/escribir pierde
-- acceso, y ninguna feature actual (003, 004) tiene UI que dependa del
-- comportamiento angosto anterior.
-- =====================================================================

drop policy "asignaciones_conductor_vehiculo_select" on public.asignaciones_conductor_vehiculo;
create policy "asignaciones_conductor_vehiculo_select" on public.asignaciones_conductor_vehiculo for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','ver') or private.tiene_permiso('conductores','ver'))));

drop policy "asignaciones_conductor_vehiculo_write" on public.asignaciones_conductor_vehiculo;
create policy "asignaciones_conductor_vehiculo_write" on public.asignaciones_conductor_vehiculo for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar') or private.tiene_permiso('conductores','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar') or private.tiene_permiso('conductores','editar'))));
