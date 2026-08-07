-- =====================================================================
-- Sistema de Gestión de Flotilla de Vehículos — Schema inicial (v1)
-- Multi-tenant compartido: todas las empresas viven en las mismas tablas,
-- aisladas por empresa_id + Row Level Security.
--
-- Convención de nombres de archivo cuando lo muevas a Supabase CLI:
--   supabase migration new initial_schema
--   (pega este contenido en el archivo generado bajo supabase/migrations/)
--
-- Decisiones ya tomadas (ver plan.md / spec.md):
--   - Tipos de Vehículo y Productos son catálogos POR EMPRESA.
--   - Un usuario pertenece a UNA sola empresa (excepto superusuario, global).
--   - cargas_combustible y mantenimientos son INMUTABLES: solo cancelables.
--   - Toda tabla tiene RLS activado sin excepción (constitución §2).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensiones y tipos (enums)
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";

create type rol_usuario as enum ('superusuario', 'admin', 'operario');
create type unidad_distancia as enum ('km', 'millas');
create type unidad_combustible as enum ('litros', 'galones');
create type tipo_licencia as enum ('federal', 'local');
create type tipo_permiso as enum ('estatal', 'federal');
create type tipo_producto as enum ('refaccion', 'combustible', 'servicio', 'llanta', 'consumible');
create type tipo_mantenimiento as enum ('correctivo', 'preventivo');
create type condicion_llanta as enum ('nueva', 'renovada');
create type estado_registro as enum ('activo', 'cancelado');
create type tipo_servicio_obligatorio as enum ('revision_fisico_mecanica', 'verificacion_ambiental', 'renovacion_aditamentos');
create type resultado_checklist as enum ('aprobado', 'con_observaciones');
create type estado_alerta as enum ('pendiente', 'enviada', 'resuelta');
create type accion_auditoria as enum ('crear', 'editar', 'eliminar', 'cancelar');
create type tipo_archivo as enum ('poliza', 'licencia', 'factura');

-- ---------------------------------------------------------------------
-- 1. Funciones auxiliares para RLS (schema "private", no expuesto por la API)
-- ---------------------------------------------------------------------
create schema if not exists private;

-- empresa_id del usuario autenticado actual (null si es superusuario)
create or replace function private.empresa_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select empresa_id from public.usuarios where auth_user_id = auth.uid();
$$;

-- rol del usuario autenticado actual
create or replace function private.rol()
returns rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select rol from public.usuarios where auth_user_id = auth.uid();
$$;

create or replace function private.es_superusuario()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select rol = 'superusuario' from public.usuarios where auth_user_id = auth.uid()), false);
$$;

create or replace function private.es_admin_o_superior()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select rol in ('admin', 'superusuario') from public.usuarios where auth_user_id = auth.uid()), false);
$$;

-- trigger genérico para mantener updated_at
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Empresas (tenants)
-- ---------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rfc text not null,
  telefono_oficina_1 text,
  telefono_oficina_2 text,
  telefono_movil text,
  correo text,
  logo_url text,
  unidad_distancia unidad_distancia not null default 'km',
  unidad_combustible unidad_combustible not null default 'litros',
  pais text not null default 'México',
  moneda text not null default 'MXN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_empresas_updated_at before update on public.empresas
  for each row execute function private.set_updated_at();

alter table public.empresas enable row level security;

-- Solo el superusuario crea/edita/borra empresas.
create policy "empresas_select" on public.empresas for select
  using (private.es_superusuario() or id = private.empresa_id());

create policy "empresas_insert" on public.empresas for insert
  with check (private.es_superusuario());

create policy "empresas_update" on public.empresas for update
  using (private.es_superusuario() or (id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (id = private.empresa_id() and private.rol() = 'admin'));

create policy "empresas_delete" on public.empresas for delete
  using (private.es_superusuario());

-- ---------------------------------------------------------------------
-- 3. Usuarios (perfil ligado a auth.users; un usuario = una sola empresa)
-- ---------------------------------------------------------------------
create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  empresa_id uuid references public.empresas(id) on delete cascade, -- null solo para superusuario
  nombre text not null,
  correo text not null,
  rol rol_usuario not null default 'operario',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_superusuario_sin_empresa check (
    (rol = 'superusuario' and empresa_id is null) or (rol <> 'superusuario' and empresa_id is not null)
  )
);

create trigger trg_usuarios_updated_at before update on public.usuarios
  for each row execute function private.set_updated_at();

alter table public.usuarios enable row level security;

create policy "usuarios_select" on public.usuarios for select
  using (
    private.es_superusuario()
    or auth_user_id = auth.uid()
    or (empresa_id = private.empresa_id() and private.rol() = 'admin')
  );

create policy "usuarios_insert" on public.usuarios for insert
  with check (
    private.es_superusuario()
    or (empresa_id = private.empresa_id() and private.rol() = 'admin' and rol = 'operario')
  );

create policy "usuarios_update" on public.usuarios for update
  using (
    private.es_superusuario()
    or (empresa_id = private.empresa_id() and private.rol() = 'admin')
  )
  with check (
    private.es_superusuario()
    or (empresa_id = private.empresa_id() and private.rol() = 'admin' and rol = 'operario')
  );

-- Eliminación solo si no tiene operaciones registradas: se valida en server/api/
-- (no es expresable como política RLS pura); RLS solo garantiza el alcance por rol/empresa.
create policy "usuarios_delete" on public.usuarios for delete
  using (
    private.es_superusuario()
    or (empresa_id = private.empresa_id() and private.rol() = 'admin' and rol = 'operario')
  );

-- ---------------------------------------------------------------------
-- Plantilla de políticas para catálogos "estándar" por empresa:
--   SELECT  -> admin y operario de la misma empresa (+ superusuario)
--   INSERT/UPDATE/DELETE -> solo admin de la misma empresa (+ superusuario)
-- Se repite explícitamente en cada tabla para mantener las políticas
-- auditables por Claude Code sin depender de macros.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4. Tipos de vehículo (catálogo por empresa)
-- ---------------------------------------------------------------------
create table public.tipos_vehiculo (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  clave text not null,
  nombre text not null,
  created_at timestamptz not null default now(),
  unique (empresa_id, clave)
);

alter table public.tipos_vehiculo enable row level security;

create policy "tipos_vehiculo_select" on public.tipos_vehiculo for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "tipos_vehiculo_write" on public.tipos_vehiculo for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 5. Aseguradoras
-- ---------------------------------------------------------------------
create table public.aseguradoras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  razon_social text not null,
  rfc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_aseguradoras_updated_at before update on public.aseguradoras
  for each row execute function private.set_updated_at();

alter table public.aseguradoras enable row level security;

create policy "aseguradoras_select" on public.aseguradoras for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "aseguradoras_write" on public.aseguradoras for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 6. Proveedores
-- ---------------------------------------------------------------------
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  rfc text,
  calle text,
  numero text,
  colonia text,
  telefono_oficina_1 text,
  telefono_oficina_2 text,
  celular text,
  correo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_proveedores_updated_at before update on public.proveedores
  for each row execute function private.set_updated_at();

alter table public.proveedores enable row level security;

create policy "proveedores_select" on public.proveedores for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "proveedores_write" on public.proveedores for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 7. Conductores
-- ---------------------------------------------------------------------
create table public.conductores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  apellidos text not null,
  celular text,
  calle text,
  numero text,
  colonia text,
  numero_licencia text not null,
  tipo_licencia tipo_licencia not null,
  fecha_vencimiento_licencia date not null,
  licencia_archivo_id uuid, -- fk a archivos, se agrega tras crear esa tabla
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_conductores_updated_at before update on public.conductores
  for each row execute function private.set_updated_at();

alter table public.conductores enable row level security;

create policy "conductores_select" on public.conductores for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "conductores_write" on public.conductores for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 8. Permisos (catálogo) y su relación con vehículos
-- ---------------------------------------------------------------------
create table public.permisos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  clave text not null,
  nombre text not null,
  tipo tipo_permiso not null,
  created_at timestamptz not null default now(),
  unique (empresa_id, clave)
);

alter table public.permisos enable row level security;

create policy "permisos_select" on public.permisos for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "permisos_write" on public.permisos for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 9. Vehículos
-- ---------------------------------------------------------------------
create table public.vehiculos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  marca text not null,
  modelo text not null,
  placa text,
  color text,
  numero_serie text,
  numero_motor text,
  capacidad_carga numeric,
  anio int,
  numero_ejes int,
  tipo_vehiculo_id uuid not null references public.tipos_vehiculo(id),
  aseguradora_id uuid references public.aseguradoras(id),
  numero_poliza text,
  fecha_vencimiento_poliza date,
  poliza_archivo_id uuid, -- fk a archivos, se agrega tras crear esa tabla
  baja boolean not null default false,
  motivo_baja text check (char_length(motivo_baja) <= 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_vehiculos_updated_at before update on public.vehiculos
  for each row execute function private.set_updated_at();

alter table public.vehiculos enable row level security;

create policy "vehiculos_select" on public.vehiculos for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "vehiculos_write" on public.vehiculos for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

create table public.vehiculo_permisos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos(id) on delete cascade,
  permiso_id uuid not null references public.permisos(id),
  fecha_vencimiento date,
  created_at timestamptz not null default now(),
  unique (vehiculo_id, permiso_id)
);

alter table public.vehiculo_permisos enable row level security;

create policy "vehiculo_permisos_select" on public.vehiculo_permisos for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "vehiculo_permisos_write" on public.vehiculo_permisos for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 10. Productos (catálogo por empresa)
-- ---------------------------------------------------------------------
create table public.productos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  tipo tipo_producto not null,
  unidad text,
  created_at timestamptz not null default now()
);

alter table public.productos enable row level security;

create policy "productos_select" on public.productos for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "productos_write" on public.productos for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 11. Cargas de combustible (INMUTABLE tras captura, solo cancelable)
-- ---------------------------------------------------------------------
create table public.cargas_combustible (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos(id),
  proveedor_id uuid not null references public.proveedores(id),
  producto_id uuid not null references public.productos(id),
  fecha date not null check (fecha <= current_date),
  odometro numeric not null,
  cantidad numeric not null,
  costo_unitario numeric not null,
  costo_total numeric not null,
  factura_archivo_id uuid, -- fk a archivos
  estado estado_registro not null default 'activo',
  creado_por uuid not null references public.usuarios(id),
  created_at timestamptz not null default now()
);

alter table public.cargas_combustible enable row level security;

create policy "cargas_combustible_select" on public.cargas_combustible for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

-- Operario y admin pueden capturar.
create policy "cargas_combustible_insert" on public.cargas_combustible for insert
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

-- Ninguna UPDATE toca los datos capturados: solo se permite pasar de 'activo' a 'cancelado'.
-- La restricción de "no cambies nada más que estado" se refuerza con un trigger (ver abajo).
create policy "cargas_combustible_update_solo_cancelar" on public.cargas_combustible for update
  using ((private.es_superusuario() or empresa_id = private.empresa_id()) and estado = 'activo')
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

-- DELETE físico nunca permitido, ni para admin.
create policy "cargas_combustible_no_delete" on public.cargas_combustible for delete
  using (false);

create or replace function private.solo_permite_cancelar()
returns trigger
language plpgsql
as $$
begin
  if old.estado = 'cancelado' then
    raise exception 'No se puede modificar un registro ya cancelado';
  end if;
  if new.estado not in ('activo', 'cancelado') then
    raise exception 'Transición de estado inválida';
  end if;
  -- Bloquea cambios a cualquier columna que no sea "estado" una vez capturado.
  if row(new.vehiculo_id, new.proveedor_id, new.producto_id, new.fecha, new.odometro,
         new.cantidad, new.costo_unitario, new.costo_total)
     is distinct from
     row(old.vehiculo_id, old.proveedor_id, old.producto_id, old.fecha, old.odometro,
         old.cantidad, old.costo_unitario, old.costo_total) then
    raise exception 'El registro es inmutable: solo se permite cancelar, no editar';
  end if;
  return new;
end;
$$;

create trigger trg_cargas_combustible_inmutable before update on public.cargas_combustible
  for each row execute function private.solo_permite_cancelar();

-- ---------------------------------------------------------------------
-- 12. Mantenimientos (INMUTABLE tras captura, solo cancelable)
-- ---------------------------------------------------------------------
create table public.mantenimientos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos(id),
  proveedor_id uuid not null references public.proveedores(id),
  tipo tipo_mantenimiento not null,
  fecha date not null check (fecha <= current_date),
  costo_total numeric not null,
  notas text,
  factura_archivo_id uuid, -- fk a archivos
  estado estado_registro not null default 'activo',
  creado_por uuid not null references public.usuarios(id),
  created_at timestamptz not null default now()
);

alter table public.mantenimientos enable row level security;

create policy "mantenimientos_select" on public.mantenimientos for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "mantenimientos_insert" on public.mantenimientos for insert
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "mantenimientos_update_solo_cancelar" on public.mantenimientos for update
  using ((private.es_superusuario() or empresa_id = private.empresa_id()) and estado = 'activo')
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "mantenimientos_no_delete" on public.mantenimientos for delete
  using (false);

create trigger trg_mantenimientos_inmutable before update on public.mantenimientos
  for each row execute function private.solo_permite_cancelar();
  -- Nota: la función reusa la misma firma; si el set de columnas "congeladas" debe
  -- diferir de cargas_combustible, se separa en una función propia al refinar.

create table public.mantenimiento_detalles (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  mantenimiento_id uuid not null references public.mantenimientos(id) on delete cascade,
  producto_id uuid not null references public.productos(id),
  -- Campos específicos si el producto es "llanta"
  llanta_marca text,
  llanta_medida text,
  llanta_numero_serie text,
  llanta_condicion condicion_llanta,
  llanta_kilometraje numeric,
  -- Campos específicos si el producto es "servicio"
  servicio_fecha_proximo date,
  servicio_frecuencia_km numeric,
  created_at timestamptz not null default now()
);

alter table public.mantenimiento_detalles enable row level security;

create policy "mantenimiento_detalles_select" on public.mantenimiento_detalles for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "mantenimiento_detalles_insert" on public.mantenimiento_detalles for insert
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

-- Hereda inmutabilidad del mantenimiento padre: no se permite update/delete directo.
create policy "mantenimiento_detalles_no_update" on public.mantenimiento_detalles for update
  using (false);

create policy "mantenimiento_detalles_no_delete" on public.mantenimiento_detalles for delete
  using (false);

-- ---------------------------------------------------------------------
-- 13. Checklist de aditamentos y revisión de seguridad
-- ---------------------------------------------------------------------
create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos(id),
  tipo_vehiculo_id uuid not null references public.tipos_vehiculo(id),
  responsable_id uuid not null references public.usuarios(id),
  fecha timestamptz not null default now(),
  resultado resultado_checklist not null,
  created_at timestamptz not null default now()
);

alter table public.checklists enable row level security;

create policy "checklists_select" on public.checklists for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "checklists_insert" on public.checklists for insert
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "checklists_no_update" on public.checklists for update using (false);
create policy "checklists_no_delete" on public.checklists for delete using (false);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  nombre_item text not null,
  cumple boolean not null,
  observaciones text
);

alter table public.checklist_items enable row level security;

create policy "checklist_items_select" on public.checklist_items for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "checklist_items_insert" on public.checklist_items for insert
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "checklist_items_no_update" on public.checklist_items for update using (false);
create policy "checklist_items_no_delete" on public.checklist_items for delete using (false);

-- ---------------------------------------------------------------------
-- 14. Bitácora de servicios obligatorios
-- ---------------------------------------------------------------------
create table public.servicios_obligatorios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  vehiculo_id uuid not null references public.vehiculos(id),
  tipo tipo_servicio_obligatorio not null,
  fecha_realizado date not null,
  fecha_vencimiento date not null,
  archivo_id uuid, -- fk a archivos
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_servicios_obligatorios_updated_at before update on public.servicios_obligatorios
  for each row execute function private.set_updated_at();

alter table public.servicios_obligatorios enable row level security;

create policy "servicios_obligatorios_select" on public.servicios_obligatorios for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "servicios_obligatorios_write" on public.servicios_obligatorios for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 15. Alertas (generadas por Edge Function / cron, con service role)
-- ---------------------------------------------------------------------
create table public.alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null, -- 'licencia', 'poliza', 'permiso', 'servicio_obligatorio', 'checklist'
  entidad_tipo text not null,
  entidad_id uuid not null,
  fecha_vencimiento date not null,
  estado estado_alerta not null default 'pendiente',
  created_at timestamptz not null default now()
);

alter table public.alertas enable row level security;

create policy "alertas_select" on public.alertas for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

-- Los usuarios normales no insertan alertas directamente (lo hace la Edge Function
-- con service role, que no pasa por RLS). Solo admin puede marcar como resuelta.
create policy "alertas_update" on public.alertas for update
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- ---------------------------------------------------------------------
-- 16. Archivos (metadata; el binario vive en Supabase Storage)
-- ---------------------------------------------------------------------
create table public.archivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo tipo_archivo not null,
  storage_path text not null,
  entidad_tipo text not null, -- 'vehiculo', 'conductor', 'carga_combustible', 'mantenimiento', 'servicio_obligatorio'
  entidad_id uuid not null,
  subido_por uuid not null references public.usuarios(id),
  created_at timestamptz not null default now()
);

alter table public.archivos enable row level security;

create policy "archivos_select" on public.archivos for select
  using (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "archivos_insert" on public.archivos for insert
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "archivos_delete" on public.archivos for delete
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

-- Ahora sí se pueden agregar las FKs diferidas de conductores/vehiculos -> archivos
alter table public.conductores
  add constraint fk_conductores_licencia_archivo foreign key (licencia_archivo_id) references public.archivos(id);
alter table public.vehiculos
  add constraint fk_vehiculos_poliza_archivo foreign key (poliza_archivo_id) references public.archivos(id);
alter table public.cargas_combustible
  add constraint fk_cargas_combustible_factura_archivo foreign key (factura_archivo_id) references public.archivos(id);
alter table public.mantenimientos
  add constraint fk_mantenimientos_factura_archivo foreign key (factura_archivo_id) references public.archivos(id);
alter table public.servicios_obligatorios
  add constraint fk_servicios_obligatorios_archivo foreign key (archivo_id) references public.archivos(id);

-- ---------------------------------------------------------------------
-- 17. Auditoría (solo INSERT vía trigger de aplicación; nunca UPDATE/DELETE)
-- ---------------------------------------------------------------------
create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id),
  entidad text not null,
  entidad_id uuid not null,
  accion accion_auditoria not null,
  valores_antes jsonb,
  valores_despues jsonb,
  created_at timestamptz not null default now()
);

alter table public.auditoria enable row level security;

-- Solo admin/superusuario consultan la bitácora de auditoría.
create policy "auditoria_select" on public.auditoria for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and private.rol() = 'admin'));

create policy "auditoria_insert" on public.auditoria for insert
  with check (private.es_superusuario() or empresa_id = private.empresa_id());

create policy "auditoria_no_update" on public.auditoria for update using (false);
create policy "auditoria_no_delete" on public.auditoria for delete using (false);

-- =====================================================================
-- Pendiente de refinar (siguiente iteración):
--   - Índices (empresa_id en todas las tablas, fechas de vencimiento para alertas).
--   - Validación de "eliminación solo si no tiene registros dependientes"
--     (aseguradoras, proveedores, vehículos, conductores) -> se hace en
--     server/api/ antes del DELETE, o con triggers BEFORE DELETE adicionales.
--   - Separar la función de inmutabilidad de mantenimientos de la de
--     cargas_combustible si sus columnas "congeladas" terminan siendo distintas.
--   - Bucket policies de Supabase Storage (independientes de estas RLS de tabla).
-- =====================================================================
