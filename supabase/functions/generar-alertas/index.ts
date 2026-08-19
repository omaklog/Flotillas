// Primera Edge Function del proyecto (research.md R1/R4 de specs/012-alertas-dashboard/).
// Disparada a diario por `pg_cron`+`pg_net` (migración `alertas_cron`), o directo por HTTP en
// los tests Playwright de esta feature simulando esa corrida. Escanea, con `service_role` (sin
// RLS, cruza todos los tenants en una sola corrida — FR-001), 5 fuentes con condición de "por
// vencer"/"con observaciones", crea una alerta por condición nueva, notifica una sola vez vía
// server/api/alertas/notificar.post.ts (research.md R2 — el correo en sí NO se reimplementa
// aquí), y auto-resuelve alertas cuya condición ya dejó de aplicar (research.md R5).

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const VENTANA_DIAS = 30

interface AlertaNueva {
  empresa_id: string
  tipo: string
  entidad_tipo: string
  entidad_id: string
  fecha_vencimiento: string | null
}

interface ResultadoJob {
  alertasCreadas: number
  alertasResueltas: number
  correosEnviados: number
}

function fechaLimiteISO(): string {
  const limite = new Date()
  limite.setDate(limite.getDate() + VENTANA_DIAS)
  return limite.toISOString().slice(0, 10)
}

/**
 * Inserta una alerta nueva; si ya existe una abierta para la misma entidad+tipo, el índice único
 * parcial `uq_alertas_abiertas` (schema_14, migración `alertas_cron`) rechaza el insert con
 * 23505 — se trata como "ya existe, no hacer nada" (FR-004), no como un error.
 */
async function crearSiNoExiste(
  supabase: SupabaseClient,
  candidata: AlertaNueva
): Promise<string | null> {
  const { data, error } = await supabase
    .from('alertas')
    .insert({ ...candidata, estado: 'pendiente' })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return null
    console.error('Error al crear alerta', candidata, error)
    return null
  }
  return data.id as string
}

/**
 * Llama al endpoint interno de correo (research.md R2). Un fallo aquí (red, 401, 502 porque
 * ningún correo se pudo enviar a pesar de haber destinatarios) NO debe abortar el resto de la
 * corrida — la alerta simplemente queda en `pendiente`, visible in-app (FR-005, hallazgo de
 * `/speckit-analyze`).
 */
async function notificar(
  alertaId: string
): Promise<{ ok: boolean; correosEnviados: number }> {
  const notificarUrl = Deno.env.get('ALERTAS_NOTIFICAR_URL')
  const cronSecret = Deno.env.get('ALERTAS_CRON_SECRET')
  if (!notificarUrl || !cronSecret) {
    console.error('Faltan ALERTAS_NOTIFICAR_URL/ALERTAS_CRON_SECRET en la Edge Function')
    return { ok: false, correosEnviados: 0 }
  }

  try {
    const respuesta = await fetch(notificarUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`
      },
      body: JSON.stringify({ alertaId })
    })

    if (respuesta.status === 204) return { ok: true, correosEnviados: 0 }
    if (respuesta.ok) {
      const cuerpo = await respuesta.json().catch(() => ({ enviados: 0 }))
      return { ok: true, correosEnviados: cuerpo.enviados ?? 0 }
    }
    return { ok: false, correosEnviados: 0 }
  } catch (err) {
    console.error('Error de red llamando a notificar.post.ts', err)
    return { ok: false, correosEnviados: 0 }
  }
}

async function procesarCondiciones(
  supabase: SupabaseClient,
  candidatas: AlertaNueva[]
): Promise<{ creadas: number; correosEnviados: number }> {
  let creadas = 0
  let correosEnviados = 0

  for (const candidata of candidatas) {
    const alertaId = await crearSiNoExiste(supabase, candidata)
    if (!alertaId) continue
    creadas++

    const resultado = await notificar(alertaId)
    correosEnviados += resultado.correosEnviados
    if (resultado.ok) {
      await supabase.from('alertas').update({ estado: 'enviada' }).eq('id', alertaId)
    }
    // si resultado.ok es false, la alerta queda en 'pendiente' tal como se insertó.
  }

  return { creadas, correosEnviados }
}

// ---------------------------------------------------------------------
// Las 5 fuentes (research.md R5).
// ---------------------------------------------------------------------

async function detectarLicencias(supabase: SupabaseClient): Promise<AlertaNueva[]> {
  const { data } = await supabase
    .from('conductores')
    .select('id, empresa_id, fecha_vencimiento_licencia')
    .eq('activo', true)
    .lte('fecha_vencimiento_licencia', fechaLimiteISO())

  return (data ?? []).map((c) => ({
    empresa_id: c.empresa_id,
    tipo: 'licencia',
    entidad_tipo: 'conductores',
    entidad_id: c.id,
    fecha_vencimiento: c.fecha_vencimiento_licencia
  }))
}

async function detectarPolizas(supabase: SupabaseClient): Promise<AlertaNueva[]> {
  const { data } = await supabase
    .from('vehiculos')
    .select('id, empresa_id, fecha_vencimiento_poliza')
    .eq('baja', false)
    .not('fecha_vencimiento_poliza', 'is', null)
    .lte('fecha_vencimiento_poliza', fechaLimiteISO())

  return (data ?? []).map((v) => ({
    empresa_id: v.empresa_id,
    tipo: 'poliza',
    entidad_tipo: 'vehiculos',
    entidad_id: v.id,
    fecha_vencimiento: v.fecha_vencimiento_poliza
  }))
}

async function detectarPermisos(supabase: SupabaseClient): Promise<AlertaNueva[]> {
  const { data } = await supabase
    .from('vehiculo_permisos')
    .select('id, empresa_id, fecha_vencimiento')
    .not('fecha_vencimiento', 'is', null)
    .lte('fecha_vencimiento', fechaLimiteISO())

  return (data ?? []).map((p) => ({
    empresa_id: p.empresa_id,
    tipo: 'permiso',
    entidad_tipo: 'vehiculo_permisos',
    entidad_id: p.id,
    fecha_vencimiento: p.fecha_vencimiento
  }))
}

async function detectarServiciosObligatorios(supabase: SupabaseClient): Promise<AlertaNueva[]> {
  const { data } = await supabase
    .from('servicios_obligatorios')
    .select('id, empresa_id, fecha_vencimiento')
    .lte('fecha_vencimiento', fechaLimiteISO())

  return (data ?? []).map((s) => ({
    empresa_id: s.empresa_id,
    tipo: 'servicio_obligatorio',
    entidad_tipo: 'servicios_obligatorios',
    entidad_id: s.id,
    fecha_vencimiento: s.fecha_vencimiento
  }))
}

async function detectarChecklists(supabase: SupabaseClient): Promise<AlertaNueva[]> {
  const { data } = await supabase
    .from('checklists')
    .select('id, empresa_id')
    .eq('resultado', 'con_observaciones')

  return (data ?? []).map((c) => ({
    empresa_id: c.empresa_id,
    tipo: 'checklist',
    entidad_tipo: 'checklists',
    entidad_id: c.id,
    fecha_vencimiento: null
  }))
}

// ---------------------------------------------------------------------
// Auto-resolución (FR-006, research.md R5 columna "condición de auto-resolución"). `checklist`
// nunca se auto-resuelve — se omite de esta fase a propósito.
// ---------------------------------------------------------------------

interface ReglaResolucion {
  tipo: string
  tabla: string
  siguevigente: (fuente: Record<string, unknown> | null) => boolean
}

const REGLAS_RESOLUCION: ReglaResolucion[] = [
  {
    tipo: 'licencia',
    tabla: 'conductores',
    siguevigente: (f) =>
      !!f &&
      f.activo === true &&
      typeof f.fecha_vencimiento_licencia === 'string' &&
      f.fecha_vencimiento_licencia <= fechaLimiteISO()
  },
  {
    tipo: 'poliza',
    tabla: 'vehiculos',
    siguevigente: (f) =>
      !!f &&
      f.baja === false &&
      typeof f.fecha_vencimiento_poliza === 'string' &&
      f.fecha_vencimiento_poliza <= fechaLimiteISO()
  },
  {
    tipo: 'permiso',
    tabla: 'vehiculo_permisos',
    siguevigente: (f) =>
      !!f && typeof f.fecha_vencimiento === 'string' && f.fecha_vencimiento <= fechaLimiteISO()
  },
  {
    tipo: 'servicio_obligatorio',
    tabla: 'servicios_obligatorios',
    siguevigente: (f) =>
      !!f && typeof f.fecha_vencimiento === 'string' && f.fecha_vencimiento <= fechaLimiteISO()
  }
]

async function resolverAutomaticamente(supabase: SupabaseClient): Promise<number> {
  let resueltas = 0

  for (const regla of REGLAS_RESOLUCION) {
    const { data: abiertas } = await supabase
      .from('alertas')
      .select('id, entidad_id')
      .eq('tipo', regla.tipo)
      .in('estado', ['pendiente', 'enviada'])

    for (const alerta of abiertas ?? []) {
      const { data: fuente } = await supabase
        .from(regla.tabla)
        .select('*')
        .eq('id', alerta.entidad_id)
        .maybeSingle()

      if (!regla.siguevigente(fuente)) {
        await supabase.from('alertas').update({ estado: 'resuelta' }).eq('id', alerta.id)
        resueltas++
      }
    }
  }

  return resueltas
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Solo `service_role` puede disparar esta función (pg_net con el secreto de Vault, o un test
  // que simula la corrida — contracts/alertas-dashboard.md). El runtime de Edge Functions ya
  // exige un JWT válido antes de llegar aquí; esta comprobación adicional restringe
  // específicamente a service_role (un JWT `anon` también sería válido para esa capa previa).
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const autorizacion = req.headers.get('authorization')
  if (!serviceRoleKey || autorizacion !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'no_autenticado' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)

  const fuentes = await Promise.all([
    detectarLicencias(supabase),
    detectarPolizas(supabase),
    detectarPermisos(supabase),
    detectarServiciosObligatorios(supabase),
    detectarChecklists(supabase)
  ])

  let alertasCreadas = 0
  let correosEnviados = 0

  for (const candidatas of fuentes) {
    const resultado = await procesarCondiciones(supabase, candidatas)
    alertasCreadas += resultado.creadas
    correosEnviados += resultado.correosEnviados
  }

  const alertasResueltas = await resolverAutomaticamente(supabase)

  const resultado: ResultadoJob = { alertasCreadas, alertasResueltas, correosEnviados }
  return new Response(JSON.stringify(resultado), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
})
