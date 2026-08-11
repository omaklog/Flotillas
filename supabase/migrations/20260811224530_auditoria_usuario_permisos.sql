-- =====================================================================
-- Historial por Vehículo y Bitácora de Auditoría (011): a diferencia de
-- lo que asumía la descripción original de la feature, las 19 tablas que
-- schema_13_bitacora_auditoria_automatica.sql intenta conectar con un
-- trigger genérico YA TIENEN, cada una, su propio trigger de auditoría
-- dedicado desde Features 001-010 — aplicar ese script tal cual
-- duplicaría cada fila de auditoría (research.md R1, spec.md §
-- Assumptions). La única tabla sin cobertura previa es usuario_permisos.
--
-- Versión simplificada de private.registrar_auditoria() respecto a la de
-- schema_13: sin la rama UPDATE (usuario_permisos no tiene ese flujo,
-- solo alta/baja de permisos) y sin el caso especial 'cancelar' de
-- cargas_combustible/mantenimientos (no aplica aquí, y esas dos tablas
-- ya tienen su propio trigger dedicado que sí lo maneja).
-- =====================================================================

create or replace function private.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accion public.accion_auditoria;
begin
  if TG_OP = 'INSERT' then
    v_accion := 'crear';
  else
    v_accion := 'eliminar';
  end if;

  insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
  values (
    coalesce(new.empresa_id, old.empresa_id),
    private.actor_id(),
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    v_accion,
    case when TG_OP = 'DELETE' then to_jsonb(old) else null end,
    case when TG_OP = 'INSERT' then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create trigger trg_auditoria_usuario_permisos
  after insert or delete on public.usuario_permisos
  for each row execute function private.registrar_auditoria();
