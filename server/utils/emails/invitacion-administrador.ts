import { renderEmailLayout } from '../mailer'

export interface InvitacionAdministradorInput {
  nombreAdministrador: string
  nombreEmpresa: string
  enlaceInvitacion: string
}

export function renderInvitacionAdministrador(input: InvitacionAdministradorInput): {
  subject: string
  html: string
} {
  return {
    subject: `Invitación a administrar ${input.nombreEmpresa} en Flotillas`,
    html: renderEmailLayout({
      title: 'Invitación de administrador',
      bodyHtml: `
        <p>Hola ${input.nombreAdministrador},</p>
        <p>Fuiste invitado como <strong>administrador</strong> de <strong>${input.nombreEmpresa}</strong>
        en Flotillas. Establece tu contraseña para empezar.</p>
      `,
      ctaText: 'Establecer contraseña',
      ctaUrl: input.enlaceInvitacion
    })
  }
}
