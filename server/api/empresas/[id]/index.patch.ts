import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

interface EmpresaPatchInput {
  nombre?: string
  rfc?: string
  telefono_oficina_1?: string | null
  telefono_oficina_2?: string | null
  telefono_movil?: string | null
  correo?: string | null
  logo_url?: string | null
  pais?: string
  moneda?: string
  unidad_distancia?: 'km' | 'millas'
  unidad_combustible?: 'litros' | 'galones'
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Ver contracts/empresas.md — PATCH /api/empresas/:id (US4). */
export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  if (!authUser?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'No autenticado' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'Falta el id de la empresa' }
    })
  }

  const body = await readBody<EmpresaPatchInput>(event)

  if (body?.nombre !== undefined && body.nombre.trim() === '') {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'El nombre no puede quedar vacío' }
    })
  }
  if (body?.rfc !== undefined && body.rfc.trim() === '') {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'El RFC no puede quedar vacío' }
    })
  }
  if (body?.correo && !EMAIL_REGEX.test(body.correo)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'El correo de la empresa no es válido' }
    })
  }

  // Semántica PATCH real: solo se tocan los campos presentes en el body, para no pisar el
  // resto con `undefined` — por eso se arma a mano en vez de pasar `body` directo a `.update()`.
  const cambios: Database['public']['Tables']['empresas']['Update'] = {}
  if (body?.nombre !== undefined) cambios.nombre = body.nombre
  if (body?.rfc !== undefined) cambios.rfc = body.rfc
  if (body?.telefono_oficina_1 !== undefined) cambios.telefono_oficina_1 = body.telefono_oficina_1
  if (body?.telefono_oficina_2 !== undefined) cambios.telefono_oficina_2 = body.telefono_oficina_2
  if (body?.telefono_movil !== undefined) cambios.telefono_movil = body.telefono_movil
  if (body?.correo !== undefined) cambios.correo = body.correo
  if (body?.logo_url !== undefined) cambios.logo_url = body.logo_url
  if (body?.pais !== undefined) cambios.pais = body.pais
  if (body?.moneda !== undefined) cambios.moneda = body.moneda
  if (body?.unidad_distancia !== undefined) cambios.unidad_distancia = body.unidad_distancia
  if (body?.unidad_combustible !== undefined) cambios.unidad_combustible = body.unidad_combustible

  if (Object.keys(cambios).length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'No se recibió ningún campo para actualizar' }
    })
  }

  // Cliente con la sesión del usuario que llama (no service_role): la propia RLS de
  // `empresas_update` (superusuario, o admin de esa empresa) decide si la escritura procede —
  // así la auditoría atribuye la fila vía `auth.uid()` sin necesidar el mecanismo de
  // `set_config('app.actor_id', ...)` que sí hace falta para escrituras con service_role
  // (ver server/utils/supabaseAdmin.ts).
  const client = await serverSupabaseClient<Database>(event)

  const { data, error } = await client
    .from('empresas')
    .update(cambios)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'rfc_duplicado',
        data: { error: 'rfc_duplicado' }
      })
    }
    // RLS excluye la fila (no es esa empresa, o no es admin/superusuario) → `.single()` no
    // encuentra ninguna fila que actualizar. Se responde 403 genérico, no 404, para no revelar
    // si el id de empresa existe.
    if (error.code === 'PGRST116') {
      throw createError({ statusCode: 403, statusMessage: 'No autorizado' })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
