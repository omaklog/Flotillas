import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

interface RequestBody {
  activo: boolean
}

/** Ver contracts/usuarios.md — PATCH /api/usuarios/:id/estado (US8/US9). */
export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  if (!authUser?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'No autenticado' })
  }

  const usuarioId = getRouterParam(event, 'id')
  if (!usuarioId) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'Falta el id del usuario' }
    })
  }

  // Cliente con la sesión de quien llama: RLS de `usuarios_update` ya deja pasar exactamente
  // "admin de la propia empresa" o "superusuario" a nivel de fila — las restricciones MÁS
  // ESTRICTAS del contrato (admin solo toca operarios; superusuario solo toca administradores)
  // se validan a mano abajo, porque RLS por sí sola es más permisiva que eso.
  const client = await serverSupabaseClient<Database>(event)

  const { data: callerProfile } = await client
    .from('usuarios')
    .select('id, empresa_id, rol')
    .eq('auth_user_id', authUser.sub)
    .single()

  if (!callerProfile || (callerProfile.rol !== 'admin' && callerProfile.rol !== 'superusuario')) {
    throw createError({ statusCode: 403, statusMessage: 'No autorizado' })
  }

  const { data: objetivo, error: objetivoError } = await client
    .from('usuarios')
    .select('id, empresa_id, rol, activo')
    .eq('id', usuarioId)
    .single()

  if (objetivoError || !objetivo) {
    throw createError({ statusCode: 404, statusMessage: 'usuario_no_encontrado' })
  }

  if (callerProfile.rol === 'admin' && objetivo.rol !== 'operario') {
    throw createError({ statusCode: 403, statusMessage: 'No autorizado' })
  }
  if (callerProfile.rol === 'superusuario' && objetivo.rol !== 'admin') {
    throw createError({ statusCode: 403, statusMessage: 'No autorizado' })
  }

  const body = await readBody<RequestBody>(event)
  if (typeof body?.activo !== 'boolean') {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: '"activo" debe ser booleano' }
    })
  }

  // Guard rail: no dejar sin administradores activos a una empresa.
  if (objetivo.rol === 'admin' && objetivo.activo && !body.activo) {
    const { count } = await client
      .from('usuarios')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', objetivo.empresa_id!)
      .eq('rol', 'admin')
      .eq('activo', true)

    if ((count ?? 0) <= 1) {
      throw createError({
        statusCode: 409,
        statusMessage: 'ultimo_administrador',
        data: { error: 'ultimo_administrador' }
      })
    }
  }

  const { data: actualizado, error } = await client
    .from('usuarios')
    .update({ activo: body.activo })
    .eq('id', usuarioId)
    .select('id, activo')
    .single()

  if (error || !actualizado) {
    throw createError({ statusCode: 500, statusMessage: error?.message ?? 'error_desconocido' })
  }

  return { id: actualizado.id, activo: actualizado.activo }
})
