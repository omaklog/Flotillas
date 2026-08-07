import { serverSupabaseUser } from '#supabase/server'
import { renderInvitacionAdministrador } from '../../utils/emails/invitacion-administrador'

interface EmpresaInput {
  nombre: string
  rfc: string
  telefono_oficina_1?: string | null
  telefono_oficina_2?: string | null
  telefono_movil?: string | null
  correo?: string | null
  pais?: string
  moneda?: string
  unidad_distancia: 'km' | 'millas'
  unidad_combustible: 'litros' | 'galones'
}

interface AdministradorInput {
  nombre: string
  correo: string
}

interface RequestBody {
  empresa: EmpresaInput
  administrador: AdministradorInput
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Ver contracts/empresas.md — POST /api/empresas (US1). */
export default defineEventHandler(async (event) => {
  // serverSupabaseUser devuelve el JWT decodificado (getClaims()), no el `User` clásico —
  // el id del usuario viene en `.sub`, no en `.id` (ver app/composables/useAuth.ts).
  const authUser = await serverSupabaseUser(event)
  if (!authUser?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'No autenticado' })
  }

  const admin = useSupabaseAdmin()

  const { data: callerProfile } = await admin
    .from('usuarios')
    .select('rol')
    .eq('auth_user_id', authUser.sub)
    .single()

  if (callerProfile?.rol !== 'superusuario') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Solo el superusuario puede dar de alta empresas'
    })
  }

  const body = await readBody<RequestBody>(event)

  if (
    !body?.empresa?.nombre ||
    !body?.empresa?.rfc ||
    !body?.empresa?.unidad_distancia ||
    !body?.empresa?.unidad_combustible
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'Faltan campos de la empresa' }
    })
  }
  if (
    !body?.administrador?.nombre ||
    !body?.administrador?.correo ||
    !EMAIL_REGEX.test(body.administrador.correo)
  ) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: {
        error: 'validation_error',
        mensaje: 'Faltan o son inválidos los datos del administrador'
      }
    })
  }

  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({
      nombre: body.empresa.nombre,
      rfc: body.empresa.rfc,
      telefono_oficina_1: body.empresa.telefono_oficina_1 ?? null,
      telefono_oficina_2: body.empresa.telefono_oficina_2 ?? null,
      telefono_movil: body.empresa.telefono_movil ?? null,
      correo: body.empresa.correo ?? null,
      pais: body.empresa.pais ?? 'México',
      moneda: body.empresa.moneda ?? 'MXN',
      unidad_distancia: body.empresa.unidad_distancia,
      unidad_combustible: body.empresa.unidad_combustible
    })
    .select('id, nombre')
    .single()

  if (empresaError) {
    if (empresaError.code === '23505') {
      throw createError({
        statusCode: 409,
        statusMessage: 'rfc_duplicado',
        data: { error: 'rfc_duplicado' }
      })
    }
    throw createError({ statusCode: 500, statusMessage: empresaError.message })
  }

  // A partir de aquí, si algo falla se borra la empresa recién creada (acción
  // compensatoria — no es una transacción de BD real, ver contracts/empresas.md).
  try {
    const { data: authAdmin, error: createUserError } = await admin.auth.admin.createUser({
      email: body.administrador.correo,
      email_confirm: false
    })

    if (createUserError || !authAdmin?.user) {
      const yaExiste = createUserError?.message?.toLowerCase().includes('already') ?? false
      throw createError({
        statusCode: yaExiste ? 409 : 500,
        statusMessage: yaExiste
          ? 'correo_en_uso'
          : (createUserError?.message ?? 'error_desconocido'),
        data: yaExiste ? { error: 'correo_en_uso' } : undefined
      })
    }

    const { data: usuario, error: usuarioError } = await admin
      .from('usuarios')
      .insert({
        auth_user_id: authAdmin.user.id,
        empresa_id: empresa.id,
        nombre: body.administrador.nombre,
        correo: body.administrador.correo,
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
      email: body.administrador.correo,
      options: { redirectTo: 'http://localhost:3030/restablecer-password' }
    })

    if (linkError || !linkData?.properties?.action_link) {
      throw createError({
        statusCode: 500,
        statusMessage: linkError?.message ?? 'No se pudo generar el enlace de invitación'
      })
    }

    const { subject, html } = renderInvitacionAdministrador({
      nombreAdministrador: body.administrador.nombre,
      nombreEmpresa: empresa.nombre,
      enlaceInvitacion: linkData.properties.action_link
    })
    await sendMail({ to: body.administrador.correo, subject, html })

    setResponseStatus(event, 201)
    return { empresa_id: empresa.id, usuario_id: usuario.id }
  } catch (err) {
    await admin.from('empresas').delete().eq('id', empresa.id)
    throw err
  }
})
