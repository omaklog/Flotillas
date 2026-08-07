-- =====================================================================
-- Bucket de Supabase Storage para logos de empresa (US-1.4/FR-011, T048).
--
-- Se crea vía migración SQL (`insert into storage.buckets`), no vía
-- `[storage.buckets.*]` en supabase/config.toml — esa sección solo aplica al
-- `supabase start` local (research.md); una migración sí se reproduce con
-- `supabase db push` contra el proyecto de producción.
--
-- Convención de rutas: `<empresa_id>/logo.<ext>` — permite que las políticas de
-- `storage.objects` verifiquen el primer segmento de la ruta
-- (`storage.foldername(name)`) contra `private.empresa_id()`, igual que las
-- políticas de las tablas normales.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos-empresas',
  'logos-empresas',
  true, -- público: `logo_url` se usa directo en <img> y en las plantillas de correo (Nodemailer)
  2097152, -- 2 MiB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- INSERT/UPDATE/DELETE: superusuario, o admin de la empresa dueña de la carpeta
-- (`(storage.foldername(name))[1]` es el primer segmento de la ruta del objeto).
-- SELECT: aunque el bucket es público (lectura anónima vía URL pública sin pasar por RLS),
-- se agrega la misma política de lectura para cubrir accesos autenticados (ej. listar desde
-- Studio o desde el propio admin al editar).
create policy logos_empresas_select on storage.objects
  for select
  using (
    bucket_id = 'logos-empresas'
    and (
      private.es_superusuario()
      or (storage.foldername(name))[1] = private.empresa_id()::text
    )
  );

create policy logos_empresas_insert on storage.objects
  for insert
  with check (
    bucket_id = 'logos-empresas'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[1] = private.empresa_id()::text
        and private.rol() = 'admin'::rol_usuario
      )
    )
  );

create policy logos_empresas_update on storage.objects
  for update
  using (
    bucket_id = 'logos-empresas'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[1] = private.empresa_id()::text
        and private.rol() = 'admin'::rol_usuario
      )
    )
  );

create policy logos_empresas_delete on storage.objects
  for delete
  using (
    bucket_id = 'logos-empresas'
    and (
      private.es_superusuario()
      or (
        (storage.foldername(name))[1] = private.empresa_id()::text
        and private.rol() = 'admin'::rol_usuario
      )
    )
  );
