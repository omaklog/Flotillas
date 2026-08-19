import { serverSupabaseClient, serverSupabaseUser } from '#supabase/server'
import type { Database } from '~/types/database.types'

type ReporteClave =
  | 'reporte_mantenimiento'
  | 'reporte_combustible'
  | 'reporte_vencimientos'
  | 'reporte_cumplimiento'

const REPORTES_VALIDOS: ReporteClave[] = [
  'reporte_mantenimiento',
  'reporte_combustible',
  'reporte_vencimientos',
  'reporte_cumplimiento'
]

interface RequestBody {
  reporte: ReporteClave
  formato: 'excel' | 'pdf'
  filtros: { desde?: string; hasta?: string; vehiculoId?: string }
}

/**
 * Ver contracts/reportes.md — POST /api/reportes/auditar-exportacion (FR-017).
 * `auditoria` solo se escribe vía triggers o, como aquí, un endpoint privilegiado —
 * nunca directo desde el cliente (useAuditoria.ts). Exportar un reporte no dispara
 * ningún trigger de negocio (no hay tabla propia, research.md R4), así que este
 * endpoint hace el insert explícito con `service_role`, después de verificar sesión
 * y el permiso `reportes.exportar` server-side (la RLS de `auditoria_insert` solo
 * valida `empresa_id`, no ese permiso).
 */
export default defineEventHandler(async (event) => {
  const authUser = await serverSupabaseUser(event)
  if (!authUser?.sub) {
    throw createError({ statusCode: 401, statusMessage: 'No autenticado' })
  }

  const body = await readBody<RequestBody>(event)

  if (!body?.reporte || !REPORTES_VALIDOS.includes(body.reporte)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'reporte inválido o faltante' }
    })
  }
  if (body.formato !== 'excel' && body.formato !== 'pdf') {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'formato debe ser excel o pdf' }
    })
  }

  // Cliente con la sesión de quien llama (respeta RLS) — solo para resolver el perfil y el
  // permiso, nunca para el insert en auditoria (research.md R4).
  const client = await serverSupabaseClient<Database>(event)

  const { data: perfil } = await client
    .from('usuarios')
    .select('id, empresa_id, rol')
    .eq('auth_user_id', authUser.sub)
    .single()

  if (!perfil?.empresa_id) {
    throw createError({ statusCode: 403, statusMessage: 'Sin empresa asociada' })
  }

  let tienePermisoExportar = perfil.rol === 'admin'
  if (!tienePermisoExportar) {
    const { data: permiso } = await client
      .from('usuario_permisos')
      .select('accion')
      .eq('usuario_id', perfil.id)
      .eq('modulo_clave', 'reportes')
      .in('accion', ['exportar', 'todos'])
      .maybeSingle()
    tienePermisoExportar = !!permiso
  }

  if (!tienePermisoExportar) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Sin permiso reportes.exportar'
    })
  }

  const admin = useSupabaseAdmin()

  const { error: insertError } = await admin.from('auditoria').insert({
    empresa_id: perfil.empresa_id,
    usuario_id: perfil.id,
    entidad: body.reporte,
    entidad_id: crypto.randomUUID(),
    accion: 'exportar',
    valores_despues: { formato: body.formato, filtros: body.filtros ?? {} }
  })

  if (insertError) {
    throw createError({ statusCode: 500, statusMessage: insertError.message })
  }

  setResponseStatus(event, 201)
  return { auditado: true }
})
