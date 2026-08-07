-- =====================================================================
-- Seed de desarrollo local — Feature 001 (T023)
--
-- Solo corre con `supabase db reset` / `supabase start` contra el proyecto LOCAL.
-- No se ejecuta en producción/staging: ahí el primer superusuario se da de alta a
-- mano, una sola vez, siguiendo el mismo patrón (ver Assumptions en spec.md — esta
-- feature no incluye una pantalla de "alta de superusuario").
--
-- Credenciales de desarrollo (NO usar fuera de local):
--   correo:      superusuario@flotillas.local
--   contraseña:  Flotillas#2026Dev
-- =====================================================================

do $$
declare
  v_auth_id uuid := 'a0000000-0000-0000-0000-000000000001';
begin
  if not exists (select 1 from auth.users where email = 'superusuario@flotillas.local') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_auth_id,
      'authenticated',
      'authenticated',
      'superusuario@flotillas.local',
      crypt('Flotillas#2026Dev', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(),
      now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      v_auth_id::text,
      v_auth_id,
      jsonb_build_object('sub', v_auth_id::text, 'email', 'superusuario@flotillas.local'),
      'email',
      now(),
      now(),
      now()
    );

    insert into public.usuarios (auth_user_id, empresa_id, nombre, correo, rol, activo)
    values (v_auth_id, null, 'Superusuario', 'superusuario@flotillas.local', 'superusuario', true);
  end if;
end $$;
