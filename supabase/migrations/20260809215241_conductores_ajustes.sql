-- =====================================================================
-- Feature 004 — Conductores
--
-- La tabla conductores, su RLS granular (tiene_permiso('conductores', ...))
-- y el módulo de permisos ya existen desde Feature 001
-- (initial_schema.sql, modulos_y_permisos.sql, permisos_ver_y_defaults.sql).
-- Esta migración agrega lo que falta (ver specs/004-conductores/data-model.md,
-- sección "Extensiones sobre el esquema actual"):
--   1. motivo_baja + UNIQUE(empresa_id, numero_licencia) en conductores.
--   2. Auditoría de conductores (reutiliza private.audit_empresas_usuarios(),
--      sin función nueva — a diferencia de Vehículos).
--   3. Generalización de las 4 políticas de storage.objects del bucket
--      documentos (creado por Vehículos), hoy hardcodeadas al permiso
--      'vehiculos', para que también acepten 'conductores' según el tipo
--      de documento.
--   4. Ajuste de archivos_delete para aceptar tiene_permiso('conductores','editar').
--   5. Tabla asignaciones_conductor_vehiculo completa, tal cual
--      docs/schema-reference/schema_06_asignaciones_conductor_vehiculo.sql
--      (Clarifications sesión 2026-08-09) — sin UI propia en esta feature,
--      solo para que la eliminación bloqueada por dependientes (US-6) sea
--      probable de punta a punta desde ahora.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. motivo_baja + UNIQUE(empresa_id, numero_licencia) (research.md R2)
-- ---------------------------------------------------------------------
alter table public.conductores
  add column motivo_baja text check (char_length(motivo_baja) <= 150);

alter table public.conductores
  add constraint uq_conductores_empresa_numero_licencia unique (empresa_id, numero_licencia);

-- ---------------------------------------------------------------------
-- 2. Auditoría de conductores (research.md R3). conductores.activo ya usa
--    la misma semántica que empresas/usuarios (no invertida como
--    vehiculos.baja), así que private.audit_empresas_usuarios() ya
--    genérica aplica sin cambios — sin función nueva.
-- ---------------------------------------------------------------------
create trigger trg_conductores_auditoria
  after insert or update or delete on public.conductores
  for each row execute function private.audit_empresas_usuarios();

-- ---------------------------------------------------------------------
-- 3. Generalizar las 4 políticas de storage.objects del bucket
--    documentos (research.md R4). Hoy solo revisan tiene_permiso('vehiculos',
--    ...); esta feature las reemplaza para que el permiso dependa del
--    primer segmento de la ruta ({tipo}): 'poliza'/'foto' -> vehiculos,
--    'licencia' -> conductores. El segmento de empresa ([2]) no cambia.
-- ---------------------------------------------------------------------
drop policy "documentos_select" on storage.objects;
create policy documentos_select on storage.objects
  for select
  using (
    bucket_id = 'documentos'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[2] = private.empresa_id()::text
        and (
          private.rol() = 'admin'::rol_usuario
          or (
            (storage.foldername(name))[1] in ('poliza', 'foto')
            and private.tiene_permiso('vehiculos', 'ver')
          )
          or (
            (storage.foldername(name))[1] = 'licencia'
            and private.tiene_permiso('conductores', 'ver')
          )
        )
      )
    )
  );

drop policy "documentos_insert" on storage.objects;
create policy documentos_insert on storage.objects
  for insert
  with check (
    bucket_id = 'documentos'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[2] = private.empresa_id()::text
        and (
          private.rol() = 'admin'::rol_usuario
          or (
            (storage.foldername(name))[1] in ('poliza', 'foto')
            and private.tiene_permiso('vehiculos', 'editar')
          )
          or (
            (storage.foldername(name))[1] = 'licencia'
            and private.tiene_permiso('conductores', 'editar')
          )
        )
      )
    )
  );

drop policy "documentos_update" on storage.objects;
create policy documentos_update on storage.objects
  for update
  using (
    bucket_id = 'documentos'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[2] = private.empresa_id()::text
        and (
          private.rol() = 'admin'::rol_usuario
          or (
            (storage.foldername(name))[1] in ('poliza', 'foto')
            and private.tiene_permiso('vehiculos', 'editar')
          )
          or (
            (storage.foldername(name))[1] = 'licencia'
            and private.tiene_permiso('conductores', 'editar')
          )
        )
      )
    )
  );

drop policy "documentos_delete" on storage.objects;
create policy documentos_delete on storage.objects
  for delete
  using (
    bucket_id = 'documentos'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[2] = private.empresa_id()::text
        and (
          private.rol() = 'admin'::rol_usuario
          or (
            (storage.foldername(name))[1] in ('poliza', 'foto')
            and private.tiene_permiso('vehiculos', 'editar')
          )
          or (
            (storage.foldername(name))[1] = 'licencia'
            and private.tiene_permiso('conductores', 'editar')
          )
        )
      )
    )
  );

-- ---------------------------------------------------------------------
-- 4. archivos_delete: agregar tiene_permiso('conductores','editar') al OR
--    ya existente (rol='admin' + tiene_permiso('vehiculos','editar'),
--    agregado por Vehículos) (research.md R5).
-- ---------------------------------------------------------------------
drop policy "archivos_delete" on public.archivos;
create policy "archivos_delete" on public.archivos for delete
  using (
    private.es_superusuario()
    or (
      empresa_id = private.empresa_id()
      and (
        private.rol() = 'admin'::rol_usuario
        or private.tiene_permiso('vehiculos', 'editar')
        or private.tiene_permiso('conductores', 'editar')
      )
    )
  );

-- ---------------------------------------------------------------------
-- 5. asignaciones_conductor_vehiculo, tal cual
--    docs/schema-reference/schema_06_asignaciones_conductor_vehiculo.sql
--    (research.md R6, Clarifications sesión 2026-08-09) — sin modificar.
-- ---------------------------------------------------------------------
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

-- Mismo módulo de permisos que la gestión del vehículo (se asigna desde su detalle).
create policy "asignaciones_conductor_vehiculo_select" on public.asignaciones_conductor_vehiculo for select
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','ver'))));

create policy "asignaciones_conductor_vehiculo_write" on public.asignaciones_conductor_vehiculo for all
  using (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar'))))
  with check (private.es_superusuario() or (empresa_id = private.empresa_id() and (private.rol() = 'admin' or private.tiene_permiso('vehiculos','editar'))));

-- Índices: FKs (Postgres no las indexa solas) + patrón de consulta típico
-- ("asignaciones activas/historial de este vehículo o de este conductor").
create index idx_asignaciones_cv_empresa_id on public.asignaciones_conductor_vehiculo (empresa_id);
create index idx_asignaciones_cv_vehiculo on public.asignaciones_conductor_vehiculo (vehiculo_id, fecha_inicio desc);
create index idx_asignaciones_cv_conductor on public.asignaciones_conductor_vehiculo (conductor_id, fecha_inicio desc);
create index idx_asignaciones_cv_asignado_por on public.asignaciones_conductor_vehiculo (asignado_por);
