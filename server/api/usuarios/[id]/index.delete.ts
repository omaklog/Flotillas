import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

/** Ver contracts/usuarios.md — DELETE /api/usuarios/:id (US9, FR-024/FR-025). */
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
      statusMessage: 'Solo un administrador puede eliminar operarios'
    })
  }

  // RLS de `usuarios_select` ya escopea a la propia empresa del admin que llama.
  const { data: operario, error: operarioError } = await client
    .from('usuarios')
    .select('id, auth_user_id')
    .eq('id', usuarioId)
    .eq('rol', 'operario')
    .single()

  if (operarioError || !operario) {
    throw createError({ statusCode: 404, statusMessage: 'usuario_no_encontrado' })
  }

  // Punto de extensión: solo se revisan las tablas de negocio que YA existen en schema.sql y
  // traen una columna de autoría (`creado_por`/`responsable_id`) — `servicios_obligatorios` no
  // tiene ninguna columna que referencie `usuarios` en el esquema actual (a pesar de que el
  // contrato/spec la menciona), así que no hay nada que revisar ahí todavía. Cuando existan más
  // módulos con atribución a un operario, sumar su chequeo aquí.
  const [{ count: cargas }, { count: mantenimientos }, { count: checklists }] = await Promise.all([
    client
      .from('cargas_combustible')
      .select('id', { count: 'exact', head: true })
      .eq('creado_por', usuarioId),
    client
      .from('mantenimientos')
      .select('id', { count: 'exact', head: true })
      .eq('creado_por', usuarioId),
    client
      .from('checklists')
      .select('id', { count: 'exact', head: true })
      .eq('responsable_id', usuarioId)
  ])

  if ((cargas ?? 0) > 0 || (mantenimientos ?? 0) > 0 || (checklists ?? 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'tiene_operaciones_registradas',
      data: { error: 'tiene_operaciones_registradas', sugerencia: 'desactivar' }
    })
  }

  // service_role: eliminar en `auth.users` requiere la API de administración. `usuarios.auth_user_id`
  // tiene `on delete cascade`, así que la fila de `public.usuarios` (y sus `usuario_permisos`,
  // también en cascada) se borran solas — un solo `deleteUser` basta.
  const admin = useSupabaseAdmin()
  const { error: deleteError } = await admin.auth.admin.deleteUser(operario.auth_user_id)
  if (deleteError) {
    throw createError({ statusCode: 500, statusMessage: deleteError.message })
  }

  return { id: usuarioId, eliminado: true }
})
