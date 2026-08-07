import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

interface PermisoInput {
  modulo_clave: string
  accion: string
}

interface RequestBody {
  permisos: PermisoInput[]
}

function clave(p: { modulo_clave: string; accion: string }): string {
  return `${p.modulo_clave}|${p.accion}`
}

/** Ver contracts/usuarios.md — PUT /api/usuarios/:id/permisos (US6). */
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

  // Cliente con la sesión de quien llama: RLS decide qué puede leer/escribir (solo admin, solo
  // en su propia empresa) y atribuye `otorgado_por`/auditoría vía `auth.uid()`.
  const client = await serverSupabaseClient<Database>(event)

  const { data: callerProfile } = await client
    .from('usuarios')
    .select('id, empresa_id, rol')
    .eq('auth_user_id', authUser.sub)
    .single()

  if (callerProfile?.rol !== 'admin') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Solo un administrador puede asignar permisos'
    })
  }

  // RLS de `usuarios_select` excluye la fila si el operario no es de la empresa de este admin —
  // 404 genérico (no distingue "no existe" de "no es tuyo", igual que otros endpoints).
  const { data: operario, error: operarioError } = await client
    .from('usuarios')
    .select('id, empresa_id, rol')
    .eq('id', usuarioId)
    .single()

  if (operarioError || !operario || operario.rol !== 'operario') {
    throw createError({ statusCode: 404, statusMessage: 'usuario_no_encontrado' })
  }

  const body = await readBody<RequestBody>(event)
  const permisosSolicitados = body?.permisos ?? []

  const [{ data: modulos }, { data: accionesDisponibles }] = await Promise.all([
    client.from('modulos').select('clave'),
    client.from('acciones_disponibles').select('modulo_clave, accion')
  ])

  const modulosValidos = new Set((modulos ?? []).map((m) => m.clave))
  const paresValidos = new Set((accionesDisponibles ?? []).map((a) => clave(a)))

  for (const permiso of permisosSolicitados) {
    const valido =
      permiso.accion === 'todos'
        ? modulosValidos.has(permiso.modulo_clave)
        : paresValidos.has(clave(permiso))
    if (!valido) {
      throw createError({
        statusCode: 422,
        statusMessage: 'validation_error',
        data: {
          error: 'validation_error',
          mensaje: `Combinación inválida: ${permiso.modulo_clave}/${permiso.accion}`
        }
      })
    }
  }

  const { data: permisosActuales } = await client
    .from('usuario_permisos')
    .select('modulo_clave, accion')
    .eq('usuario_id', usuarioId)

  const clavesActuales = new Set((permisosActuales ?? []).map((p) => clave(p)))
  const clavesSolicitadas = new Set(permisosSolicitados.map((p) => clave(p)))

  // Diff explícito (insertar lo que falta, borrar lo que sobra) — no delete-all+insert-all —
  // para no pisar `created_at`/`otorgado_por` de permisos que no cambiaron (ver contracts/usuarios.md).
  const aInsertar = permisosSolicitados.filter((p) => !clavesActuales.has(clave(p)))
  const aBorrar = [...clavesActuales].filter((c) => !clavesSolicitadas.has(c))

  if (aInsertar.length > 0) {
    const { error } = await client.from('usuario_permisos').insert(
      aInsertar.map((p) => ({
        empresa_id: operario.empresa_id,
        usuario_id: usuarioId,
        modulo_clave: p.modulo_clave,
        accion: p.accion,
        otorgado_por: callerProfile.id
      }))
    )
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  }

  for (const c of aBorrar) {
    const [moduloClave, accion] = c.split('|')
    const { error } = await client
      .from('usuario_permisos')
      .delete()
      .eq('usuario_id', usuarioId)
      .eq('modulo_clave', moduloClave)
      .eq('accion', accion)
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return { usuario_id: usuarioId, actualizado: true }
})
