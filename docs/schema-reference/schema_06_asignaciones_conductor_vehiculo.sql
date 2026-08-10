-- =====================================================================
-- Migración 6 — Asignación de conductores a vehículos (historial con
-- vigencia). Un vehículo tiene UN conductor activo a la vez; un
-- conductor puede tener varios vehículos activos simultáneamente
-- (la advertencia de "ya tiene asignado" es responsabilidad de la UI,
-- no una restricción de base de datos).
--   supabase migration new asignaciones_conductor_vehiculo
-- =====================================================================

create table public.asignaciones_conductor_vehiculo (
                                                        id uuid primary key default gen_random_uuid(),
                                                        empresa_id uuid not null references public.empresas(id) on delete cascade,
                                                        vehiculo_id uuid not null references public.vehiculos(id),
                                                        conductor_id uuid not null references public.conductores(id),
                                                        fecha_inicio date not null default current_date,
                                                        fecha_fin date, -- null = asignación activa
                                                        asignado_por uuid not null references public.usuarios(id),
                                                        created_at timestamptz not null default now(),
                                                        check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

-- Un vehículo solo puede tener UNA asignación activa (fecha_fin is null) a la vez.
-- Ningún equivalente para conductor_id: se permite que un conductor tenga varias
-- asignaciones activas en paralelo, por diseño.
create unique index uq_asignacion_vehiculo_activa
    on public.asignaciones_conductor_vehiculo (vehiculo_id)
    where fecha_fin is null;

alter table public.asignaciones_conductor_vehiculo enable row level security;

-- Se puede asignar desde el detalle del vehículo O del conductor (Feature 005), así que se
-- acepta permiso de lectura/escritura en cualquiera de los dos módulos.
create policy "asignaciones_conductor_vehiculo_select" on public.asignaciones_conductor_vehiculo for select
                                                                                                         using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','ver') or private.tiene_permiso('conductores','ver'))));

create policy "asignaciones_conductor_vehiculo_write" on public.asignaciones_conductor_vehiculo for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar') or private.tiene_permiso('conductores','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar') or private.tiene_permiso('conductores','editar'))));

-- Índices: FKs (Postgres no las indexa solas) + patrón de consulta típico
-- ("asignaciones activas/historial de este vehículo o de este conductor").
create index idx_asignaciones_cv_empresa_id on public.asignaciones_conductor_vehiculo (empresa_id);
create index idx_asignaciones_cv_vehiculo on public.asignaciones_conductor_vehiculo (vehiculo_id, fecha_inicio desc);
create index idx_asignaciones_cv_conductor on public.asignaciones_conductor_vehiculo (conductor_id, fecha_inicio desc);
create index idx_asignaciones_cv_asignado_por on public.asignaciones_conductor_vehiculo (asignado_por);

-- =====================================================================
-- Nota para cuando se especifique Feature 005:
--   - La advertencia "este conductor ya tiene un vehículo asignado" es
--     lógica de aplicación (consultar conductor_id + fecha_fin is null
--     antes de insertar), no una restricción de BD — así se permite que
--     el admin decida "agregar" o "reemplazar" sin bloquear el flujo.
--   - Al asignar un conductor nuevo a un vehículo que ya tenía uno
--     activo, la operación correcta es: UPDATE ... SET fecha_fin =
--     current_date en la fila anterior, luego INSERT de la nueva — no
--     un DELETE, para conservar el historial.
-- =====================================================================
