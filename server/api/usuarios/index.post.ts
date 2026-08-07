import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import { renderInvitacionOperario } from '../../utils/emails/invitacion-operario'

interface RequestBody {
  nombre: string
  correo: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Ver contracts/usuarios.md — POST /api/usuarios (US5). */
export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  if (!authUser?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'No autenticado' })
  }

  // Cliente con la sesión de quien llama (no service_role) para leer/insertar en `usuarios` —
  // así RLS decide si procede (solo admin, solo en su propia empresa) y la auditoría atribuye
  // la fila vía `auth.uid()`, sin necesitar `set_config('app.actor_id', ...)`.
  const client = await serverSupabaseClient(event)

  const { data: callerProfile } = await client
    .from('usuarios')
    .select('id, empresa_id, rol')
    .eq('auth_user_id', authUser.sub)
    .single()

  if (callerProfile?.rol !== 'admin' || !callerProfile.empresa_id) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Solo un administrador puede invitar operarios'
    })
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

  const { data: authOperario, error: createUserError } = await admin.auth.admin.createUser({
    email: body.correo,
    email_confirm: false
  })

  if (createUserError || !authOperario?.user) {
    const yaExiste = createUserError?.message?.toLowerCase().includes('already') ?? false
    throw createError({
      statusCode: yaExiste ? 409 : 500,
      statusMessage: yaExiste ? 'correo_en_uso' : (createUserError?.message ?? 'error_desconocido'),
      data: yaExiste ? { error: 'correo_en_uso' } : undefined
    })
  }

  try {
    // Insert vía el cliente del admin (RLS de `usuarios_insert` exige
    // `empresa_id = private.empresa_id() AND rol() = 'admin' AND rol = 'operario'`), no vía
    // service_role — dispara el trigger `otorgar_permisos_default_operario` igual (los
    // triggers no dependen de RLS) y además atribuye la auditoría al admin que invita.
    const { data: usuario, error: usuarioError } = await client
      .from('usuarios')
      .insert({
        auth_user_id: authOperario.user.id,
        empresa_id: callerProfile.empresa_id,
        nombre: body.nombre,
        correo: body.correo,
        rol: 'operario',
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

    const { subject, html } = renderInvitacionOperario({
      nombreOperario: body.nombre,
      enlaceInvitacion: linkData.properties.action_link
    })
    await sendMail({ to: body.correo, subject, html })

    setResponseStatus(event, 201)
    return { usuario_id: usuario.id, pendiente: true }
  } catch (err) {
    // Acción compensatoria: sin fila en `usuarios`, un usuario de `auth.users` huérfano no
    // debe quedar invitable ni ocupando ese correo (mismo patrón que POST /api/empresas).
    await admin.auth.admin.deleteUser(authOperario.user.id)
    throw err
  }
})
