-- =====================================================================
-- Feature 012 — Alertas y Dashboard: ajustes de esquema para el job
-- diario de detección de vencimientos (pg_cron + pg_net + Edge Function
-- `generar-alertas`, primera del proyecto). Ver specs/012-alertas-dashboard/
-- research.md (R7, R9) y data-model.md para el detalle de cada decisión.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) schema_14_alertas_ajustes.sql (docs/schema-reference/), tal cual.
-- ---------------------------------------------------------------------

alter table public.alertas
  alter column fecha_vencimiento drop not null;

-- Evita duplicar una alerta abierta (pendiente o enviada) para la misma
-- entidad+tipo — protección extra por si el cron corre dos veces o hay un bug.
create unique index uq_alertas_abiertas
  on public.alertas (empresa_id, tipo, entidad_tipo, entidad_id)
  where estado in ('pendiente', 'enviada');

-- ---------------------------------------------------------------------
-- 2) Extensiones (research.md R7). pg_net/supabase_vault ya estaban
-- instaladas en este entorno local (verificado vía la API de pg-meta);
-- `if not exists` las deja como no-op seguro donde ya existan.
-- ---------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

-- ---------------------------------------------------------------------
-- 3) Corrección de private.registrar_auditoria() (research.md R9).
--
-- Feature 011 la dejó con una versión SIMPLIFICADA (solo para
-- usuario_permisos, que nunca hace update): todo lo que no fuera INSERT
-- caía en accion='eliminar', sin distinguir UPDATE, y sin poblar
-- valores_antes/valores_despues en ese caso. `alertas` sí hace update
-- (marcar como resuelta, FR-009), así que conectarla tal cual habría
-- registrado cada resolución con la acción equivocada y sin detalle
-- antes/después — un incumplimiento silencioso de la constitución §2.
--
-- Se restaura aquí la rama UPDATE→'editar' de la versión original
-- (docs/schema-reference/schema_13_bitacora_auditoria_automatica.sql),
-- sin la rama especial 'cancelar' (solo aplica a cargas_combustible/
-- mantenimientos, que ya tienen su propio trigger dedicado y no pasan
-- por esta función). Es un cambio seguro: usuario_permisos —su único
-- llamador actual— nunca dispara UPDATE, así que su comportamiento no
-- cambia.
-- ---------------------------------------------------------------------

create or replace function private.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accion public.accion_auditoria;
begin
  v_accion := case
    when TG_OP = 'INSERT' then 'crear'
    when TG_OP = 'DELETE' then 'eliminar'
    else 'editar'
  end;

  insert into public.auditoria (empresa_id, usuario_id, entidad, entidad_id, accion, valores_antes, valores_despues)
  values (
    coalesce(new.empresa_id, old.empresa_id),
    private.actor_id(),
    TG_TABLE_NAME,
    coalesce(new.id, old.id),
    v_accion,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

-- `alertas` no tenía ningún trigger de auditoría (no estaba entre las 19
-- tablas originales de schema_13, ni Feature 011 la agregó). Sin `delete`:
-- no tiene ninguna política RLS de esa operación.
create trigger trg_alertas_auditoria
  after insert or update on public.alertas
  for each row execute function private.registrar_auditoria();

-- ---------------------------------------------------------------------
-- 4) Agenda diaria del job (research.md R1, R7).
--
-- El `service_role` key MUST NOT aparecer literal aquí — se lee de
-- Postgres Vault por nombre (`edge_functions_service_role_key`),
-- registrado una sola vez por entorno con `vault.create_secret(...)`,
-- ejecutado a mano fuera de cualquier migración (paso manual, ver
-- specs/012-alertas-dashboard/tasks.md T009).
--
-- La URL sí es literal aquí (no es un secreto), pero SÍ es específica de
-- entorno: en local, pg_net corre dentro del contenedor de Postgres, así
-- que debe resolver el nombre del contenedor de Kong dentro de la red
-- Docker (`supabase_kong_flotillas:8000`, verificado con `docker ps`) —
-- `http://127.0.0.1:<puerto publicado>` NO es alcanzable desde ahí,
-- porque "127.0.0.1" dentro del contenedor se refiere a sí mismo, no al
-- host. En staging/producción, esta URL MUST actualizarse a la real del
-- proyecto (`https://<project-ref>.supabase.co/functions/v1/generar-alertas`)
-- — mismo criterio operativo que el secreto de Vault (T009): un ajuste
-- manual por entorno, no algo que esta migración pueda fijar de antemano
-- para los tres entornos a la vez.
select cron.schedule(
  'generar-alertas-diario',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'http://supabase_kong_flotillas:8000/functions/v1/generar-alertas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'edge_functions_service_role_key'
      ),
      'Content-Type', 'application/json'
    )
  );
  $$
);
