import { renderEmailLayout } from '../mailer'

export interface EmpresaDesactivadaInput {
  nombreAdministrador: string
  nombreEmpresa: string
}

export function renderEmpresaDesactivada(input: EmpresaDesactivadaInput): {
  subject: string
  html: string
} {
  return {
    subject: `${input.nombreEmpresa} fue desactivada en Flotillas`,
    html: renderEmailLayout({
      title: 'Empresa desactivada',
      bodyHtml: `
        <p>Hola ${input.nombreAdministrador},</p>
        <p><strong>${input.nombreEmpresa}</strong> fue desactivada en Flotillas. Ningún usuario de
        la empresa podrá iniciar sesión mientras permanezca en este estado. Ningún dato se
        eliminó.</p>
        <p>Si crees que esto es un error, contacta a soporte.</p>
      `
    })
  }
}
