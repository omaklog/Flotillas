-- =====================================================================
-- Migración 3 — Lectura (SELECT) granular por permiso 'ver' +
--               permisos mínimos por defecto al crear un operario.
-- Se aplica DESPUÉS de schema.sql y schema_02_permisos.sql.
--   supabase migration new permisos_ver_y_defaults
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SELECT granular: admin/superusuario ven todo; operario necesita
--    tiene_permiso('<modulo>','ver') explícito.
-- ---------------------------------------------------------------------

drop policy "vehiculos_select" on public.vehiculos;
create policy "vehiculos_select" on public.vehiculos for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','ver'))));

drop policy "vehiculo_permisos_select" on public.vehiculo_permisos;
create policy "vehiculo_permisos_select" on public.vehiculo_permisos for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','ver'))));

drop policy "conductores_select" on public.conductores;
create policy "conductores_select" on public.conductores for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('conductores','ver'))));

drop policy "proveedores_select" on public.proveedores;
create policy "proveedores_select" on public.proveedores for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('proveedores','ver'))));

drop policy "aseguradoras_select" on public.aseguradoras;
create policy "aseguradoras_select" on public.aseguradoras for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('aseguradoras','ver'))));

drop policy "permisos_select" on public.permisos;
create policy "permisos_select" on public.permisos for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('permisos','ver'))));

drop policy "tipos_vehiculo_select" on public.tipos_vehiculo;
create policy "tipos_vehiculo_select" on public.tipos_vehiculo for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('tipos_vehiculo','ver'))));

drop policy "productos_select" on public.productos;
create policy "productos_select" on public.productos for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('productos','ver'))));

drop policy "cargas_combustible_select" on public.cargas_combustible;
create policy "cargas_combustible_select" on public.cargas_combustible for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('combustible','ver'))));

drop policy "mantenimientos_select" on public.mantenimientos;
create policy "mantenimientos_select" on public.mantenimientos for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('mantenimiento','ver'))));

drop policy "mantenimiento_detalles_select" on public.mantenimiento_detalles;
create policy "mantenimiento_detalles_select" on public.mantenimiento_detalles for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('mantenimiento','ver'))));

drop policy "checklists_select" on public.checklists;
create policy "checklists_select" on public.checklists for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('checklist','ver'))));

drop policy "checklist_items_select" on public.checklist_items;
create policy "checklist_items_select" on public.checklist_items for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('checklist','ver'))));

drop policy "servicios_obligatorios_select" on public.servicios_obligatorios;
create policy "servicios_obligatorios_select" on public.servicios_obligatorios for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('servicios_obligatorios','ver'))));

drop policy "alertas_select" on public.alertas;
create policy "alertas_select" on public.alertas for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('alertas','ver'))));

drop policy "archivos_select" on public.archivos;
create policy "archivos_select" on public.archivos for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('archivos','ver'))));

-- usuarios, empresas, usuario_permisos, modulos, acciones_disponibles NO cambian:
-- ya tienen su propia lógica de visibilidad (sensible / autorreferente / catálogo global).

-- ---------------------------------------------------------------------
-- 2. Permisos mínimos por defecto al crear un operario.
--    - 'ver' se otorga en (casi) todos los módulos operativos, EXCEPTO
--      'usuarios' y 'configuracion' (información sensible / administrativa).
--    - 'crear' se otorga solo en los módulos donde el operario captura
--      información en campo: combustible, mantenimiento, checklist, archivos.
--    - 'editar' y 'eliminar' NUNCA se otorgan por defecto: siempre los
--      asigna el administrador explícitamente desde el panel de permisos.
-- ---------------------------------------------------------------------

create or replace function private.otorgar_permisos_default_operario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  modulos_ver text[] := array[
    'vehiculos','conductores','proveedores','aseguradoras','permisos',
    'tipos_vehiculo','productos','combustible','mantenimiento','checklist',
    'servicios_obligatorios','reportes','alertas','archivos'
  ];
  modulos_crear text[] := array['combustible','mantenimiento','checklist','archivos'];
  m text;
begin
  if new.rol <> 'operario' then
    return new;
  end if;

  foreach m in array modulos_ver loop
    insert into public.usuario_permisos (empresa_id, usuario_id, modulo_clave, accion, otorgado_por)
    values (new.empresa_id, new.id, m, 'ver', new.id)
    on conflict (usuario_id, modulo_clave, accion) do nothing;
  end loop;

  foreach m in array modulos_crear loop
    insert into public.usuario_permisos (empresa_id, usuario_id, modulo_clave, accion, otorgado_por)
    values (new.empresa_id, new.id, m, 'crear', new.id)
    on conflict (usuario_id, modulo_clave, accion) do nothing;
  end loop;

  return new;
end;
$$;

create trigger trg_permisos_default_operario
  after insert on public.usuarios
  for each row execute function private.otorgar_permisos_default_operario();

-- =====================================================================
-- Pendiente de refinar:
--   - Confirmar si 'reportes' y 'alertas' deben venir en 'ver' por
--     defecto o si son exclusivos de admin (hoy: sí vienen por defecto).
--   - otorgado_por queda como el propio usuario (auto-otorgado por el
--     sistema al crearse); si prefieres registrar que fue "el admin que
--     lo creó", hay que pasar ese id explícitamente desde server/api/
--     al insertar en usuarios, en vez de depender solo del trigger.
-- =====================================================================
