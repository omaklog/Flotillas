import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

/**
 * Cliente con `service_role`. SOLO se importa dentro de `server/api/`
 * (constitución §2: la service_role key nunca se expone al cliente).
 * No usar `useSupabaseClient()` para las operaciones que este cliente cubre —
 * ese es el cliente con `anon key` respetando RLS del usuario en sesión.
 */
let client: SupabaseClient<Database> | undefined

export function useSupabaseAdmin(): SupabaseClient<Database> {
  if (client) return client

  const config = useRuntimeConfig()
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = config.supabaseServiceRoleKey as string

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — revisar .env (ver .env.example).'
    )
  }

  client = createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  })

  return client
}

// NOTA para las tareas que implementan endpoints de escritura (T029, T051, T057, T061,
// T066, etc.): `private.actor_id()` (migración 20260806044223) resuelve el actor de
// auditoría vía `set_config('app.actor_id', ...)`. Ese `set_config` NO puede fijarse en
// una llamada `.rpc()`/`.from()` separada de la escritura real — cada llamada de
// supabase-js es una request HTTP a PostgREST con su propia transacción, así que un
// `set_config` en una llamada no sobrevive a la siguiente. Cuando un endpoint necesite
// atribuir la escritura a un actor conocido (ej. el admin que invita a un operario),
// debe hacerlo con una función de Postgres (`security definer`) expuesta como RPC que
// reciba el `actor_id` como parámetro explícito y haga `set_config` + el insert/update
// dentro de la misma función — no con dos llamadas separadas desde este cliente.
// Cuando no hay actor conocido (ej. crear la primera empresa+admin), `actor_id()` cae en
// NULL vía `auditoria.usuario_id` (nullable) y no hace falta nada especial.
