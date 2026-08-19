import { renderEmailLayout } from '../mailer'

// `alertas.tipo` es `text` libre en la base de datos (no un enum, research.md R5 de
// specs/012-alertas-dashboard/) — este union local es solo para las 5 claves que esta feature
// produce, no una restricción de esquema.
type TipoAlerta = 'licencia' | 'poliza' | 'permiso' | 'servicio_obligatorio' | 'checklist'

const TITULOS: Record<TipoAlerta, string> = {
  licencia: 'Licencia por vencer',
  poliza: 'Póliza por vencer',
  permiso: 'Permiso de vehículo por vencer',
  servicio_obligatorio: 'Servicio obligatorio por vencer',
  checklist: 'Checklist con observaciones sin atender'
}

function esTipoConocido(tipo: string): tipo is TipoAlerta {
  return tipo in TITULOS
}

export interface AlertaVencimientoInput {
  nombreEmpresa: string
  tipo: string
  detalle: string
}

export function renderAlertaVencimiento(input: AlertaVencimientoInput): {
  subject: string
  html: string
} {
  const titulo = esTipoConocido(input.tipo) ? TITULOS[input.tipo] : 'Alerta'
  return {
    subject: `${titulo} — ${input.nombreEmpresa}`,
    html: renderEmailLayout({
      title: titulo,
      bodyHtml: `
        <p>Se generó una nueva alerta para <strong>${input.nombreEmpresa}</strong>:</p>
        <p><strong>${titulo}</strong> — ${input.detalle}</p>
        <p>Consulta el panel de alertas dentro de Flotillas para más detalle.</p>
      `
    })
  }
}
