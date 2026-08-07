-- Grants base sobre `public` para los roles del proyecto (anon, authenticated, service_role).
--
-- No estaban en los schema.sql de referencia del usuario y, en esta imagen de Postgres del CLI
-- de Supabase, el default ACL del rol `postgres` (el que ejecuta las migraciones) para tablas de
-- `public` solo trae `Dxtm` (truncate/references/trigger/maintain) — sin SELECT/INSERT/UPDATE/
-- DELETE (confirmado vía `pg_default_acl`; el default ACL de `supabase_admin` sí trae todo, pero
-- las migraciones no corren con ese rol). Sin el privilegio base, RLS ni siquiera llega a
-- evaluarse: Postgres exige el GRANT de la operación antes de aplicar las políticas de la tabla.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- Para que tablas/funciones de migraciones futuras hereden el mismo acceso base sin tener que
-- repetir este bloque cada vez.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
