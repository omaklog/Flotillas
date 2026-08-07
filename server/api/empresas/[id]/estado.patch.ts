import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'
import { renderEmpresaDesactivada } from '../../../utils/emails/empresa-desactivada'

interface RequestBody {
  activo: boolean
}

/** Ver contracts/empresas.md — PATCH /api/empresas/:id/estado (US7). */
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

  // Cliente con la sesión de quien llama: RLS de `empresas_update` ya permite al superusuario
  // escribir cualquier empresa, y a `usuarios_select` leer sus administradores — no hace falta
  // service_role para nada de este endpoint.
  const client = await serverSupabaseClient<Database>(event)

  const { data: callerProfile } = await client
    .from('usuarios')
    .select('rol')
    .eq('auth_user_id', authUser.sub)
    .single()

  if (callerProfile?.rol !== 'superusuario') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Solo el superusuario puede cambiar el estado de una empresa'
    })
  }

  const body = await readBody<RequestBody>(event)
  if (typeof body?.activo !== 'boolean') {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: '"activo" debe ser booleano' }
    })
  }

  const { data: empresa, error } = await client
    .from('empresas')
    .update({ activo: body.activo })
    .eq('id', id)
    .select('id, nombre, activo')
    .single()

  if (error || !empresa) {
    throw createError({ statusCode: 404, statusMessage: 'empresa_no_encontrada' })
  }

  // FR-008: solo al desactivar (no al reactivar) se notifica a los administradores activos.
  if (!body.activo) {
    const { data: administradores } = await client
      .from('usuarios')
      .select('correo, nombre')
      .eq('empresa_id', id)
      .eq('rol', 'admin')
      .eq('activo', true)

    for (const administrador of administradores ?? []) {
      const { subject, html } = renderEmpresaDesactivada({
        nombreAdministrador: administrador.nombre,
        nombreEmpresa: empresa.nombre
      })
      // Un correo fallido no debe impedir que se notifique al resto de los administradores.
      await sendMail({ to: administrador.correo, subject, html }).catch(() => undefined)
    }
  }

  return { id: empresa.id, activo: empresa.activo }
})
