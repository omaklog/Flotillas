-- =====================================================================
-- Listado de operarios para el administrador (US5/US-1.8, T053).
--
-- El estado "Pendiente" (research.md R9) se deriva de `auth.users.email_confirmed_at`, que
-- PostgREST no expone directo a clientes `anon`/`authenticated` (esquema `auth` no publicado).
-- Se resuelve con una función `security definer` que hace el join, siguiendo el mismo patrón que
-- `private.empresa_id()`/`private.rol()` (schema.sql) para puentear `auth`↔`public` de forma
-- segura.
--
-- No recibe `empresa_id` como parámetro (a diferencia de exponer un filtro libre): siempre
-- escopea a la empresa propia del que llama (`private.empresa_id()`), igual que hace RLS en el
-- resto de las tablas — así no hay forma de pedir el listado de otra empresa aunque el cliente
-- lo intente. Si quien llama no es admin, la condición `private.rol() = 'admin'` filtra todo y
-- devuelve cero filas (falla "cerrado", no con error).
-- =====================================================================

create or replace function public.listar_operarios_propios()
returns table (
  id uuid,
  nombre text,
  correo text,
  activo boolean,
  pendiente boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    u.nombre,
    u.correo,
    u.activo,
    (au.email_confirmed_at is null) as pendiente,
    u.created_at
  from public.usuarios u
  join auth.users au on au.id = u.auth_user_id
  where u.rol = 'operario'
    and u.empresa_id = private.empresa_id()
    and private.rol() = 'admin'
  order by u.created_at desc;
$$;

grant execute on function public.listar_operarios_propios() to anon, authenticated, service_role;
