import { renderAlertaVencimiento } from '../../utils/emails/alerta-vencimiento'
import type { Database } from '~/types/database.types'

interface RequestBody {
  alertaId: string
}

type SupabaseAdmin = ReturnType<typeof useSupabaseAdmin>
type Alerta = Database['public']['Tables']['alertas']['Row']

/**
 * Construye una descripción legible de la entidad de origen de la alerta, para el cuerpo del
 * correo — mejor esfuerzo: si la fila de origen ya no existe (research.md R5, algunas fuentes
 * admiten borrado físico), cae a una descripción genérica en vez de fallar.
 */
async function obtenerDetalleEntidad(admin: SupabaseAdmin, alerta: Alerta): Promise<string> {
  switch (alerta.tipo) {
    case 'licencia': {
      const { data } = await admin
        .from('conductores')
        .select('nombre, apellidos')
        .eq('id', alerta.entidad_id)
        .maybeSingle()
      return data ? `${data.nombre} ${data.apellidos}` : 'un conductor'
    }
    case 'poliza': {
      const { data } = await admin
        .from('vehiculos')
        .select('marca, modelo, placa')
        .eq('id', alerta.entidad_id)
        .maybeSingle()
      return data ? `${data.marca} ${data.modelo} (placa ${data.placa})` : 'un vehículo'
    }
    case 'permiso': {
      const { data } = await admin
        .from('vehiculo_permisos')
        .select('vehiculo_id')
        .eq('id', alerta.entidad_id)
        .maybeSingle()
      if (!data) return 'un vehículo'
      const { data: vehiculo } = await admin
        .from('vehiculos')
        .select('placa')
        .eq('id', data.vehiculo_id)
        .maybeSingle()
      return vehiculo ? `el vehículo con placa ${vehiculo.placa}` : 'un vehículo'
    }
    case 'servicio_obligatorio': {
      const { data } = await admin
        .from('servicios_obligatorios')
        .select('vehiculo_id')
        .eq('id', alerta.entidad_id)
        .maybeSingle()
      if (!data) return 'un vehículo'
      const { data: vehiculo } = await admin
        .from('vehiculos')
        .select('placa')
        .eq('id', data.vehiculo_id)
        .maybeSingle()
      return vehiculo ? `el vehículo con placa ${vehiculo.placa}` : 'un vehículo'
    }
    case 'checklist': {
      const { data } = await admin
        .from('checklists')
        .select('vehiculo_id')
        .eq('id', alerta.entidad_id)
        .maybeSingle()
      if (!data) return 'un vehículo'
      const { data: vehiculo } = await admin
        .from('vehiculos')
        .select('placa')
        .eq('id', data.vehiculo_id)
        .maybeSingle()
      return vehiculo ? `el vehículo con placa ${vehiculo.placa}` : 'un vehículo'
    }
    default:
      return ''
  }
}

/**
 * Endpoint interno (research.md R2 de specs/012-alertas-dashboard/): la Edge Function
 * `generar-alertas` (service_role, sin RLS) lo llama por cada alerta recién creada, para
 * reutilizar `sendMail()`/`renderEmailLayout()` (server/utils/mailer.ts, Feature 001) en vez de
 * reimplementar el envío de correo en Deno. Protegido por secreto compartido —
 * `ALERTAS_CRON_SECRET`, distinto de SUPABASE_SERVICE_ROLE_KEY — nunca abierto sin autenticar
 * (constitución §3). Ver contracts/alertas-dashboard.md.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const secretoEsperado = config.alertasCronSecret as string | undefined
  const autorizacion = getHeader(event, 'authorization')

  if (!secretoEsperado || autorizacion !== `Bearer ${secretoEsperado}`) {
    throw createError({ statusCode: 401, statusMessage: 'No autenticado' })
  }

  const body = await readBody<RequestBody>(event)
  if (!body?.alertaId) {
    throw createError({
      statusCode: 422,
      statusMessage: 'validation_error',
      data: { error: 'validation_error', mensaje: 'Falta alertaId' }
    })
  }

  const admin = useSupabaseAdmin()

  const { data: alerta, error: alertaError } = await admin
    .from('alertas')
    .select('*')
    .eq('id', body.alertaId)
    .single()

  if (alertaError || !alerta) {
    throw createError({ statusCode: 404, statusMessage: 'alerta_no_encontrada' })
  }

  const { data: empresa } = await admin
    .from('empresas')
    .select('nombre')
    .eq('id', alerta.empresa_id)
    .single()

  const { data: administradores } = await admin
    .from('usuarios')
    .select('correo, nombre')
    .eq('empresa_id', alerta.empresa_id)
    .eq('rol', 'admin')
    .eq('activo', true)

  // Edge Cases de spec.md (US-12.1/AC6): sin administradores activos, la alerta igual queda
  // visible in-app — no es un error, solo no hay a quién notificar.
  if (!administradores || administradores.length === 0) {
    setResponseStatus(event, 204)
    return null
  }

  const detalle = await obtenerDetalleEntidad(admin, alerta)
  const { subject, html } = renderAlertaVencimiento({
    nombreEmpresa: empresa?.nombre ?? '',
    tipo: alerta.tipo,
    detalle
  })

  let enviados = 0
  for (const destinatario of administradores) {
    try {
      await sendMail({ to: destinatario.correo, subject, html })
      enviados++
    } catch {
      // Un destinatario con envío fallido no debe impedir notificar al resto.
    }
  }

  // FR-005/Edge Cases (hallazgo de /speckit-analyze): si había administradores pero el envío
  // falló para todos, es una falla real del paso de notificación — la Edge Function que llama
  // este endpoint debe verla como error y dejar la alerta en `pendiente`, no en `enviada`.
  if (enviados === 0) {
    throw createError({ statusCode: 502, statusMessage: 'no_se_pudo_notificar' })
  }

  return { enviados }
})
