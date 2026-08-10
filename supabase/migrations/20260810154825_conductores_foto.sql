-- =====================================================================
-- Feature 006 — Foto del Conductor
--
-- conductores, archivos y el bucket documentos ya existen. Esta migración
-- agrega lo que falta (specs/006-foto-conductor/data-model.md, sección
-- "Extensiones sobre el esquema actual"):
--   1. Nuevo valor de enum tipo_archivo: 'foto_conductor' (research.md R2)
--      — en su propia sentencia, sin ninguna manipulación de datos que use
--      el valor nuevo en la misma migración (mismo bloqueo de Postgres que
--      Vehículos ya resolvió al agregar 'foto').
--   2. conductores.foto_archivo_id, mismo criterio que
--      vehiculos.foto_archivo_id: apunta a la foto vigente, sin historial.
--   3. Regeneración de las 4 políticas de storage.objects del bucket
--      documentos, agregando la rama foto_conductor -> conductores, sin
--      tocar las ramas poliza/foto->vehiculos ni licencia->conductores ya
--      existentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Nuevo valor de enum (research.md R2). Sin ninguna manipulación de
--    datos que use 'foto_conductor' en esta misma migración.
-- ---------------------------------------------------------------------
alter type public.tipo_archivo add value 'foto_conductor';

-- ---------------------------------------------------------------------
-- 2. conductores.foto_archivo_id (data-model.md).
-- ---------------------------------------------------------------------
alter table public.conductores
  add column foto_archivo_id uuid references public.archivos(id);

-- ---------------------------------------------------------------------
-- 3. Regenerar las 4 políticas de storage.objects del bucket documentos,
--    agregando la rama foto_conductor -> conductores (research.md R2,
--    data-model.md). Ramas poliza/foto->vehiculos y licencia->conductores
--    ya existentes, sin cambios.
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
            (storage.foldername(name))[1] in ('licencia', 'foto_conductor')
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
            (storage.foldername(name))[1] in ('licencia', 'foto_conductor')
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
            (storage.foldername(name))[1] in ('licencia', 'foto_conductor')
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
            (storage.foldername(name))[1] in ('licencia', 'foto_conductor')
            and private.tiene_permiso('conductores', 'editar')
          )
        )
      )
    )
  );
