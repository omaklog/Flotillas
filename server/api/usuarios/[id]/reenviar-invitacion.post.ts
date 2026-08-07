import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'
import { renderInvitacionOperario } from '../../../utils/emails/invitacion-operario'

/** Ver contracts/usuarios.md — POST /api/usuarios/:id/reenviar-invitacion (US9). */
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

  const client = await serverSupabaseClient<Database>(event)

  const { data: callerProfile } = await client
    .from('usuarios')
    .select('rol')
    .eq('auth_user_id', authUser.sub)
    .single()

  if (callerProfile?.rol !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Solo un administrador puede reenviar invitaciones'
    })
  }

  // RLS de `usuarios_select` ya escopea a la propia empresa del admin que llama.
  const { data: operario, error: operarioError } = await client
    .from('usuarios')
    .select('id, auth_user_id, correo, nombre, activo')
    .eq('id', usuarioId)
    .eq('rol', 'operario')
    .single()

  if (operarioError || !operario) {
    throw createError({ statusCode: 404, statusMessage: 'usuario_no_encontrado' })
  }

  if (!operario.activo) {
    throw createError({
      statusCode: 409,
      statusMessage: 'usuario_no_pendiente',
      data: { error: 'usuario_no_pendiente' }
    })
  }

  const admin = useSupabaseAdmin()

  // `email_confirmed_at` vive en `auth.users`, no en `public.usuarios` — solo accesible vía la
  // API de administración (research.md R9).
  const { data: authUsuario, error: getUserError } = await admin.auth.admin.getUserById(
    operario.auth_user_id
  )
  if (getUserError || !authUsuario?.user) {
    throw createError({
      statusCode: 500,
      statusMessage: getUserError?.message ?? 'error_desconocido'
    })
  }
  if (authUsuario.user.email_confirmed_at) {
    throw createError({
      statusCode: 409,
      statusMessage: 'usuario_no_pendiente',
      data: { error: 'usuario_no_pendiente' }
    })
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: operario.correo,
    options: { redirectTo: 'http://localhost:3030/restablecer-password' }
  })

  if (linkError || !linkData?.properties?.action_link) {
    throw createError({
      statusCode: 500,
      statusMessage: linkError?.message ?? 'No se pudo generar el enlace de invitación'
    })
  }

  const { subject, html } = renderInvitacionOperario({
    nombreOperario: operario.nombre,
    enlaceInvitacion: linkData.properties.action_link
  })
  await sendMail({ to: operario.correo, subject, html })

  return { id: operario.id, reenviado: true }
})
