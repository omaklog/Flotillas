import { renderEmailLayout } from '../mailer'

export interface InvitacionOperarioInput {
  nombreOperario: string
  enlaceInvitacion: string
}

export function renderInvitacionOperario(input: InvitacionOperarioInput): {
  subject: string
  html: string
} {
  return {
    subject: 'Invitación a Flotillas',
    html: renderEmailLayout({
      title: 'Invitación de operario',
      bodyHtml: `
        <p>Hola ${input.nombreOperario},</p>
        <p>Fuiste invitado a Flotillas para registrar tu actividad de flotilla. Establece tu
        contraseña para empezar.</p>
      `,
      ctaText: 'Establecer contraseña',
      ctaUrl: input.enlaceInvitacion
    })
  }
}
