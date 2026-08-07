import nodemailer, { type Transporter } from 'nodemailer'

/**
 * Transporte Nodemailer sobre SMTP (research.md R6): en local apunta al Inbucket de
 * `supabase start` (ver .env.example); en producción, a Resend (smtp.resend.com) —
 * cambiar de proveedor es solo cambiar credenciales, no código, por ser SMTP estándar.
 * Solo se importa dentro de `server/` — nunca en código que se envía al cliente.
 */
let transport: Transporter | undefined

export function useMailer(): Transporter {
  if (transport) return transport

  const config = useRuntimeConfig()
  const host = config.smtpHost as string
  const port = Number(config.smtpPort)
  const user = config.smtpUser as string
  const password = config.smtpPassword as string

  if (!host || !port) {
    throw new Error('Faltan SMTP_HOST/SMTP_PORT — revisar .env (ver .env.example).')
  }

  transport = nodemailer.createTransport({
    host,
    port,
    // Inbucket local no usa TLS ni auth; Resend en producción sí (puerto 465/587).
    secure: port === 465,
    auth: user && password ? { user, pass: password } : undefined
  })

  return transport
}

export interface SendMailInput {
  to: string
  subject: string
  html: string
}

export async function sendMail(input: SendMailInput) {
  const mailer = useMailer()
  await mailer.sendMail({
    from: 'Flotillas <no-reply@flotillas.local>',
    to: input.to,
    subject: input.subject,
    html: input.html
  })
}

export interface EmailLayoutInput {
  title: string
  bodyHtml: string
  ctaText?: string
  ctaUrl?: string
}

/**
 * Plantilla base con el sistema de diseño del proyecto (docs/design-system.md —
 * "Precision Fleet Systems"). Los clientes de correo no soportan @font-face de archivos
 * locales, así que Inter se referencia vía Google Fonts con fallback a sans-serif; el
 * resto de los tokens (color primario, radios) sí se aplican inline.
 */
export function renderEmailLayout({ title, bodyHtml, ctaText, ctaUrl }: EmailLayoutInput): string {
  const cta =
    ctaText && ctaUrl
      ? `<tr>
          <td style="padding-top:24px;">
            <a href="${ctaUrl}"
               style="display:inline-block;background:#03224d;color:#ffffff;text-decoration:none;
                      padding:12px 24px;border-radius:4px;font-weight:600;font-size:14px;">
              ${ctaText}
            </a>
          </td>
        </tr>`
      : ''

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:32px 16px;background:#f8f9fa;font-family:'Inter',Arial,sans-serif;color:#191c1d;">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e2e8f0;">
      <tr>
        <td style="padding:32px;">
          <table role="presentation" width="100%">
            <tr>
              <td style="font-size:20px;font-weight:600;color:#03224d;padding-bottom:16px;">
                Flotillas
              </td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:24px;color:#191c1d;">
                ${bodyHtml}
              </td>
            </tr>
            ${cta}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
