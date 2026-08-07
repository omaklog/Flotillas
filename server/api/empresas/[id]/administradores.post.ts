import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'
import { renderInvitacionAdministrador } from '../../../utils/emails/invitacion-administrador'

interface RequestBody {
  nombre: string
  correo: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Ver contracts/empresas.md — POST /api/empresas/:id/administradores (US8). */
export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  if (!authUser?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'No autenticado' })
  }

  const empresaId = getRouterParam(event, 'id')
  if (!empresaId) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'Falta el id de la empresa' }
    })
  }

  // Cliente con la sesión de quien llama: RLS de `usuarios_insert` ya permite al superusuario
  // insertar en cualquier empresa (sin restricción de `rol` como sí aplica para un admin) —
  // atribuye la auditoría vía `auth.uid()` sin necesitar service_role para esta escritura.
  const client = await serverSupabaseClient<Database>(event)

  const { data: callerProfile } = await client
    .from('usuarios')
    .select('rol')
    .eq('auth_user_id', authUser.sub)
    .single()

  if (callerProfile?.rol !== 'superusuario') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Solo el superusuario puede invitar administradores'
    })
  }

  const { data: empresa, error: empresaError } = await client
    .from('empresas')
    .select('id, nombre')
    .eq('id', empresaId)
    .single()

  if (empresaError || !empresa) {
    throw createError({ statusCode: 404, statusMessage: 'empresa_no_encontrada' })
  }

  const body = await readBody<RequestBody>(event)
  if (!body?.nombre || !body?.correo || !EMAIL_REGEX.test(body.correo)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'Faltan o son inválidos nombre/correo' }
    })
  }

  const admin = useSupabaseAdmin()

  const { data: authAdmin, error: createUserError } = await admin.auth.admin.createUser({
    email: body.correo,
    email_confirm: false
  })

  if (createUserError || !authAdmin?.user) {
    const yaExiste = createUserError?.message?.toLowerCase().includes('already') ?? false
    throw createError({
      statusCode: yaExiste ? 409 : 500,
      statusMessage: yaExiste ? 'correo_en_uso' : (createUserError?.message ?? 'error_desconocido'),
      data: yaExiste ? { error: 'correo_en_uso' } : undefined
    })
  }

  try {
    const { data: usuario, error: usuarioError } = await client
      .from('usuarios')
      .insert({
        auth_user_id: authAdmin.user.id,
        empresa_id: empresa.id,
        nombre: body.nombre,
        correo: body.correo,
        rol: 'admin',
        activo: true
      })
      .select('id')
      .single()

    if (usuarioError || !usuario) {
      throw createError({
        statusCode: 500,
        statusMessage: usuarioError?.message ?? 'error_desconocido'
      })
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: body.correo,
      options: { redirectTo: 'http://localhost:3030/restablecer-password' }
    })

    if (linkError || !linkData?.properties?.action_link) {
      throw createError({
        statusCode: 500,
        statusMessage: linkError?.message ?? 'No se pudo generar el enlace de invitación'
      })
    }

    const { subject, html } = renderInvitacionAdministrador({
      nombreAdministrador: body.nombre,
      nombreEmpresa: empresa.nombre,
      enlaceInvitacion: linkData.properties.action_link
    })
    await sendMail({ to: body.correo, subject, html })

    setResponseStatus(event, 201)
    return { usuario_id: usuario.id }
  } catch (err) {
    await admin.auth.admin.deleteUser(authAdmin.user.id)
    throw err
  }
})
