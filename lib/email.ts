import { Resend } from 'resend'

// ============================================================================
// Servicio centralizado de envío de correos (Resend)
//
// - Cliente Resend validado fail-fast (patrón de dev-auth/login).
// - Plantilla base HTML reutilizable con paleta FL (#19304B + #FAD02C).
// - Flag EMAIL_DRY_RUN: si es 'true' se loguea en lugar de enviar (testing).
// - Función sendEmail() reutilizable por todos los endpoints.
// ============================================================================

const FROM_ADDRESS = 'Fusion Legal <noreply@verificaciones.fusionlegalcr.com>'
const REPLY_TO = 'soporte@fusionlegalcr.com'

export type EmailPriority = 'high' | 'normal' | 'low'

export interface SendEmailParams {
  /** Destinatario único (string) o múltiples (string[] o string separado por comas). */
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  priority?: EmailPriority
  /**
   * Fuerza el envío real ignorando EMAIL_DRY_RUN.
   * Útil para modos preview/test donde se quiere enviar un correo real
   * sin importar el flag global de dry-run.
   */
  forceSend?: boolean
}

export interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
  dryRun?: boolean
}

// Validación fail-fast: si falta la API key, el módulo no debe arrancar.
function validateApiKey(): string {
  const key = process.env.RESEND_API_KEY
  if (!key || key.trim() === '') {
    throw new Error('Missing RESEND_API_KEY environment variable')
  }
  return key
}

// El cliente se crea de forma perezosa para evitar fallos en tests que mockean
// el módulo 'resend' y nunca llaman a sendEmail().
let _resend: Resend | null = null
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(validateApiKey())
  }
  return _resend
}

export function isDryRun(): boolean {
  return process.env.EMAIL_DRY_RUN === 'true'
}

// ---------------------------------------------------------------------------
// Plantilla base reutilizable
// ---------------------------------------------------------------------------

export interface EmailSectionBase {
  heading?: string
  bodyHtml: string
}

/**
 * Construye el HTML completo de un correo envolviendo el contenido en la
 * plantilla base de Fusion Legal (paleta azul #19304B + acento amarillo #FAD02C).
 */
export function wrapWithBaseTemplate(contentHtml: string, options?: {
  title?: string
  subtitle?: string
}): string {
  const title = options?.title ?? 'Fusion Legal CR'
  const subtitle = options?.subtitle ?? ''
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
      <tr>
        <td style="background: linear-gradient(135deg, #19304B 0%, #0f1419 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <table role="presentation" width="56" height="56" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto 12px; background: #FAD02C; border-radius: 50%;">
            <tr>
              <td align="center" valign="middle" style="color: #19304B; font-size: 22px; font-weight: bold;">FL</td>
            </tr>
          </table>
          <h1 style="margin: 0; font-size: 22px; font-weight: 600;">${escapeHtml(title)}</h1>
          ${subtitle ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #cbd5e1;">${escapeHtml(subtitle)}</p>` : ''}
        </td>
      </tr>
      <tr>
        <td style="height: 4px; background: linear-gradient(90deg, #FAD02C 0%, #f9c74f 100%); line-height: 4px; font-size: 4px;">&nbsp;</td>
      </tr>
      <tr>
        <td style="background: white; padding: 30px; border-radius: 0 0 12px 12px;">
          ${contentHtml}
        </td>
      </tr>
      <tr>
        <td style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
          <p style="margin: 0;">Este es un mensaje automático.</p>
          <p style="margin: 5px 0 0 0;">Fusion Legal CR - fusionlegalcr.com &middot; &copy; ${year}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

/**
 * Normaliza el campo `to` a un array de correos válidos.
 * Acepta: string único, string separado por comas, o string[].
 * Elimina espacios y vacíos.
 */
export function parseEmailList(to: string | string[]): string[] {
  const input = Array.isArray(to) ? to : [to]
  return input
    .flatMap(s => s.split(','))
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { subject, html, text, replyTo = REPLY_TO, priority = 'normal', forceSend = false } = params

  const recipients = parseEmailList(params.to)
  if (recipients.length === 0) {
    return { success: false, error: 'Faltan campos requeridos (to, subject, html)' }
  }
  if (!subject || !html) {
    return { success: false, error: 'Faltan campos requeridos (to, subject, html)' }
  }

  // Modo dry-run: no toca la API de Resend. Útil para pruebas y dev.
  // forceSend lo bypassa (modo preview).
  if (!forceSend && isDryRun()) {
    const toPreview = recipients.join(', ')
    console.log(`[email:dry-run] (no enviado) To: ${toPreview} | Subject: ${subject} | Priority: ${priority}`)
    if (text) {
      console.log(`[email:dry-run] Text preview:\n${text.slice(0, 500)}${text.length > 500 ? '...' : ''}`)
    }
    return { success: true, dryRun: true }
  }

  try {
    const resend = getResend()
    // Resend acepta `to` como string o string[]. Si hay un solo destinatario
    // pasamos string; si hay varios, pasamos array.
    const toField = recipients.length === 1 ? recipients[0] : recipients
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: toField as any,
      replyTo,
      subject,
      html,
      ...(text ? { text } : {}),
    })

    if (error) {
      console.error('[email] Error de Resend:', error)
      return { success: false, error: error.message }
    }

    const toLog = recipients.join(', ')
    console.log(`[email] Correo enviado a ${toLog} | id=${data?.id ?? 'n/a'}`)
    return { success: true, id: data?.id, dryRun: false }
  } catch (err: any) {
    console.error('[email] Excepción enviando correo:', err)
    return { success: false, error: err?.message || 'Error desconocido al enviar correo' }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Expuesto para tests que necesiten reiniciar el cliente cacheado.
export function __resetResendClientForTests(): void {
  _resend = null
}
