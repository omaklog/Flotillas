-- =====================================================================
-- Migración 2 — Sistema de permisos granulares por módulo y acción
-- Se aplica DESPUÉS de schema.sql. En Supabase CLI:
--   supabase migration new modulos_y_permisos
--   (pega este contenido en el archivo generado)
--
-- Filosofía:
--   - admin / superusuario: acceso completo por ROL (sin cambios, ya
--     definido en el documento de entendimiento original).
--   - operario: acceso NULO por default; el admin le otorga permisos
--     explícitos por módulo completo o por acción específica dentro
--     de un módulo, vía la tabla usuario_permisos.
--   - Esto se aplica en RLS (no solo en la vista), como línea de
--     defensa principal, consistente con la constitución §2.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogo de módulos (global, fijo, definido por la aplicación)
-- ---------------------------------------------------------------------
create table public.modulos (
  clave text primary key,
  nombre text not null,
  orden int not null default 0
);

insert into public.modulos (clave, nombre, orden) values
  ('configuracion', 'Configuración', 1),
  ('usuarios', 'Usuarios', 2),
  ('vehiculos', 'Vehículos', 3),
  ('conductores', 'Conductores', 4),
  ('proveedores', 'Proveedores', 5),
  ('aseguradoras', 'Compañías de Seguro', 6),
  ('permisos', 'Catálogo de Permisos', 7),
  ('tipos_vehiculo', 'Tipos de Vehículo', 8),
  ('productos', 'Catálogo de Productos', 9),
  ('combustible', 'Carga de Combustible', 10),
  ('mantenimiento', 'Mantenimiento Correctivo y Preventivo', 11),
  ('checklist', 'Checklist de Seguridad', 12),
  ('servicios_obligatorios', 'Bitácora de Servicios Obligatorios', 13),
  ('reportes', 'Reportes', 14),
  ('alertas', 'Alertas', 15),
  ('archivos', 'Archivos', 16);

alter table public.modulos enable row level security;

create policy "modulos_select" on public.modulos for select
  using (true); -- catálogo global, cualquier usuario autenticado lo lee

create policy "modulos_write" on public.modulos for all
  using (private.es_superusuario())
  with check (private.es_superusuario());

-- ---------------------------------------------------------------------
-- 2. Catálogo de acciones válidas por módulo (para poblar el UI de
--    asignación de permisos y como referencia; no se fuerza como FK
--    estricta sobre usuario_permisos para permitir el wildcard 'todos').
-- ---------------------------------------------------------------------
create table public.acciones_disponibles (
  modulo_clave text not null references public.modulos(clave),
  accion text not null,
  nombre text not null,
  primary key (modulo_clave, accion)
);

insert into public.acciones_disponibles (modulo_clave, accion, nombre) values
  ('configuracion', 'ver', 'Ver configuración'),
  ('configuracion', 'editar', 'Editar configuración'),
  ('usuarios', 'ver', 'Ver usuarios'),
  ('usuarios', 'crear', 'Crear usuarios'),
  ('usuarios', 'editar', 'Editar usuarios'),
  ('usuarios', 'eliminar', 'Eliminar usuarios'),
  ('vehiculos', 'ver', 'Ver vehículos'),
  ('vehiculos', 'crear', 'Crear vehículos'),
  ('vehiculos', 'editar', 'Editar vehículos'),
  ('vehiculos', 'eliminar', 'Eliminar vehículos'),
  ('conductores', 'ver', 'Ver conductores'),
  ('conductores', 'crear', 'Crear conductores'),
  ('conductores', 'editar', 'Editar conductores'),
  ('conductores', 'eliminar', 'Eliminar conductores'),
  ('proveedores', 'ver', 'Ver proveedores'),
  ('proveedores', 'crear', 'Crear proveedores'),
  ('proveedores', 'editar', 'Editar proveedores'),
  ('proveedores', 'eliminar', 'Eliminar proveedores'),
  ('aseguradoras', 'ver', 'Ver aseguradoras'),
  ('aseguradoras', 'crear', 'Crear aseguradoras'),
  ('aseguradoras', 'editar', 'Editar aseguradoras'),
  ('aseguradoras', 'eliminar', 'Eliminar aseguradoras'),
  ('permisos', 'ver', 'Ver catálogo de permisos'),
  ('permisos', 'crear', 'Crear permisos'),
  ('permisos', 'editar', 'Editar permisos'),
  ('permisos', 'eliminar', 'Eliminar permisos'),
  ('tipos_vehiculo', 'ver', 'Ver tipos de vehículo'),
  ('tipos_vehiculo', 'crear', 'Crear tipos de vehículo'),
  ('tipos_vehiculo', 'editar', 'Editar tipos de vehículo'),
  ('tipos_vehiculo', 'eliminar', 'Eliminar tipos de vehículo'),
  ('productos', 'ver', 'Ver productos'),
  ('productos', 'crear', 'Crear productos'),
  ('productos', 'editar', 'Editar productos'),
  ('productos', 'eliminar', 'Eliminar productos'),
  ('combustible', 'ver', 'Ver cargas de combustible'),
  ('combustible', 'crear', 'Capturar carga de combustible'),
  ('combustible', 'cancelar', 'Cancelar carga de combustible'),
  ('mantenimiento', 'ver', 'Ver mantenimientos'),
  ('mantenimiento', 'crear', 'Capturar mantenimiento'),
  ('mantenimiento', 'cancelar', 'Cancelar mantenimiento'),
  ('checklist', 'ver', 'Ver checklists'),
  ('checklist', 'crear', 'Capturar checklist'),
  ('servicios_obligatorios', 'ver', 'Ver servicios obligatorios'),
  ('servicios_obligatorios', 'crear', 'Crear servicio obligatorio'),
  ('servicios_obligatorios', 'editar', 'Editar servicio obligatorio'),
  ('servicios_obligatorios', 'eliminar', 'Eliminar servicio obligatorio'),
  ('reportes', 'ver', 'Ver reportes'),
  ('reportes', 'exportar', 'Exportar reportes'),
  ('alertas', 'ver', 'Ver alertas'),
  ('alertas', 'aprobar', 'Resolver alertas'),
  ('archivos', 'ver', 'Ver archivos'),
  ('archivos', 'crear', 'Subir archivos'),
  ('archivos', 'eliminar', 'Eliminar archivos');

alter table public.acciones_disponibles enable row level security;

create policy "acciones_disponibles_select" on public.acciones_disponibles for select
  using (true);

create policy "acciones_disponibles_write" on public.acciones_disponibles for all
  using (private.es_superusuario())
  with check (private.es_superusuario());

-- ---------------------------------------------------------------------
-- 3. Permisos otorgados a cada usuario (principalmente operarios)
--    accion = 'todos' funciona como comodín: acceso a todo el módulo.
-- ---------------------------------------------------------------------
create table public.usuario_permisos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  modulo_clave text not null references public.modulos(clave),
  accion text not null, -- una de acciones_disponibles.accion, o 'todos'
  otorgado_por uuid not null references public.usuarios(id),
  created_at timestamptz not null default now(),
  unique (usuario_id, modulo_clave, accion)
);

alter table public.usuario_permisos enable row level security;

-- El propio usuario puede ver sus permisos (para pintar el menú/UI);
-- el admin ve y administra los de su empresa.
create policy "usuario_permisos_select" on public.usuario_permisos for select
  using (
    private.es_superusuario()
    or (empresa_id = private.empresa_id() and private.rol() = 'admin')
    or usuario_id = (select id from public.usuarios where auth_user_id = auth.uid())
  );

create policy "usuario_permisos_write" on public.usuario_permisos for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 4. Función de verificación de permiso granular
-- ---------------------------------------------------------------------
create or replace function private.tiene_permiso(p_modulo text, p_accion text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.usuario_permisos up
    join public.usuarios u on u.id = up.usuario_id
    where u.auth_user_id = auth.uid()
      and up.modulo_clave = p_modulo
      and (up.accion = p_accion or up.accion = 'todos')
  );
$$;

-- ---------------------------------------------------------------------
-- 5. Reemplazo de políticas: admin conserva acceso total por rol;
--    operario ahora depende de tiene_permiso(). Se hace DROP + CREATE
--    sobre las políticas definidas en schema.sql.
-- ---------------------------------------------------------------------

-- Catálogos: vehiculos, conductores, proveedores, aseguradoras, permisos,
-- tipos_vehiculo, productos, servicios_obligatorios, vehiculo_permisos
drop policy "vehiculos_write" on public.vehiculos;
create policy "vehiculos_write" on public.vehiculos for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar'))));

drop policy "conductores_write" on public.conductores;
create policy "conductores_write" on public.conductores for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('conductores','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('conductores','editar'))));

drop policy "proveedores_write" on public.proveedores;
create policy "proveedores_write" on public.proveedores for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('proveedores','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('proveedores','editar'))));

drop policy "aseguradoras_write" on public.aseguradoras;
create policy "aseguradoras_write" on public.aseguradoras for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('aseguradoras','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('aseguradoras','editar'))));

drop policy "permisos_write" on public.permisos;
create policy "permisos_write" on public.permisos for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('permisos','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('permisos','editar'))));

drop policy "tipos_vehiculo_write" on public.tipos_vehiculo;
create policy "tipos_vehiculo_write" on public.tipos_vehiculo for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('tipos_vehiculo','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('tipos_vehiculo','editar'))));

drop policy "productos_write" on public.productos;
create policy "productos_write" on public.productos for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('productos','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('productos','editar'))));

drop policy "servicios_obligatorios_write" on public.servicios_obligatorios;
create policy "servicios_obligatorios_write" on public.servicios_obligatorios for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('servicios_obligatorios','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('servicios_obligatorios','editar'))));

drop policy "vehiculo_permisos_write" on public.vehiculo_permisos;
create policy "vehiculo_permisos_write" on public.vehiculo_permisos for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar'))));

-- Captura de combustible: crear y cancelar son acciones distintas
drop policy "cargas_combustible_insert" on public.cargas_combustible;
create policy "cargas_combustible_insert" on public.cargas_combustible for insert
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('combustible','crear'))));

drop policy "cargas_combustible_update_solo_cancelar" on public.cargas_combustible;
create policy "cargas_combustible_update_solo_cancelar" on public.cargas_combustible for update
  using ((private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('combustible','cancelar')))) and estado = 'activo')
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

-- Mantenimiento: crear y cancelar son acciones distintas
drop policy "mantenimientos_insert" on public.mantenimientos;
create policy "mantenimientos_insert" on public.mantenimientos for insert
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('mantenimiento','crear'))));

drop policy "mantenimientos_update_solo_cancelar" on public.mantenimientos;
create policy "mantenimientos_update_solo_cancelar" on public.mantenimientos for update
  using ((private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('mantenimiento','cancelar')))) and estado = 'activo')
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

drop policy "mantenimiento_detalles_insert" on public.mantenimiento_detalles;
create policy "mantenimiento_detalles_insert" on public.mantenimiento_detalles for insert
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('mantenimiento','crear'))));

-- Checklist: una sola acción de captura (no tiene edición ni cancelación, ver punto 4 acordado)
drop policy "checklists_insert" on public.checklists;
create policy "checklists_insert" on public.checklists for insert
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('checklist','crear'))));

drop policy "checklist_items_insert" on public.checklist_items;
create policy "checklist_items_insert" on public.checklist_items for insert
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('checklist','crear'))));

-- Archivos: eliminar es acción sensible
drop policy "archivos_delete" on public.archivos;
create policy "archivos_delete" on public.archivos for delete
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('archivos','eliminar'))));

-- Alertas: resolver es la acción "aprobar"
drop policy "alertas_update" on public.alertas;
create policy "alertas_update" on public.alertas for update
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('alertas','aprobar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('alertas','aprobar'))));

-- Nota: las políticas de SELECT (lectura) de todas estas tablas se
-- mantienen igual que en schema.sql (cualquier usuario de la empresa
-- puede leer). Si más adelante se requiere ocultar módulos completos a
-- ciertos operarios (no solo bloquear escritura), se refina agregando
-- "or private.tiene_permiso('<modulo>','ver')" a cada policy de SELECT.

-- =====================================================================
-- Pendiente de refinar:
--   - Endpoint/UI en Configuración > Usuarios para que el admin
--     otorgue/quite permisos (checkboxes por módulo con opción "todos").
--   - Decidir si SELECT también debe volverse granular por 'ver'
--     (hoy: cualquier usuario de la empresa lee todo, solo la escritura
--     está restringida por permiso).
--   - Sembrar permisos por defecto sugeridos al crear un operario
--     (ej. combustible.crear + checklist.crear) para no dejarlo sin
--     ningún acceso el día 1.
-- =====================================================================
