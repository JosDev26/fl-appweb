import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, wrapWithBaseTemplate, isDryRun } from '@/lib/email'

// ============================================================================
// POST /api/test-email
//
// Envía un correo de PRUEBA al destinatario configurado en
// NOTIFICACION_INACTIVIDAD_EMAIL (o a un destinatario pasado en el body).
//
// Útil para verificar que:
//   - Resend está configurado correctamente (RESEND_API_KEY válida).
//   - El dominio verificado responde.
//   - NOTIFICACION_INACTIVIDAD_EMAIL llega correctamente.
//   - El flag EMAIL_DRY_RUN funciona como se espera.
//
// No depende de que haya expedientes inactivos.
//
// Body opcional (JSON):
//   { "to": "otro@correo.com" }  -> sobreescribe el destinatario
//   { "subject": "Asunto custom" } -> sobreescribe el asunto
//
// Seguridad:
//   - En producción debería protegerse. Por ahora, si CRON_SECRET_TOKEN está
//     configurado, lo valida (igual que /api/sync/auto). Si no, permite acceso
//     (modo dev).
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Auth opcional (igual que /api/sync/auto)
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET_TOKEN
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    // ?force=true fuerza el envío real ignorando EMAIL_DRY_RUN
    const forceSend = request.nextUrl.searchParams.get('force') === 'true'

    // Parsear body (opcional)
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      // body vacío es válido
    }

    // Destinatario: body.to > NOTIFICACION_INACTIVIDAD_EMAIL
    const destinatario = (body.to || process.env.NOTIFICACION_INACTIVIDAD_EMAIL || '').trim()
    if (!destinatario) {
      return NextResponse.json(
        {
          success: false,
          message:
            'No hay destinatario. Configura NOTIFICACION_INACTIVIDAD_EMAIL o envía { "to": "correo@ejemplo.com" } en el body.',
        },
        { status: 400 }
      )
    }

    const subject = body.subject || `[Prueba] Fusion Legal - Test de correo ${new Date().toISOString()}`
    const dryRun = forceSend ? false : isDryRun()

    const contentHtml = `
      <p style="margin: 0 0 15px 0;">Este es un <strong style="color:#19304B;">correo de prueba</strong> del sistema de notificaciones de Fusion Legal.</p>
      <p style="margin: 0 0 20px 0;">Si estás viendo este mensaje, la configuración de Resend funciona correctamente.</p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0fdf4; border-left:4px solid #16a34a; padding:15px; border-radius:5px; color:#166534; margin: 20px 0;">
        <tr>
          <td>
            <strong>Detalles del envío:</strong>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li><strong>Destinatario:</strong> ${escapeHtml(destinatario)}</li>
              <li><strong>Modo dry-run:</strong> ${dryRun ? 'Sí (no se envió realmente)' : 'No (envío real)'}</li>
              <li><strong>Timestamp:</strong> ${new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}</li>
              <li><strong>Endpoint:</strong> /api/test-email</li>
            </ul>
          </td>
        </tr>
      </table>

      <p style="margin-top: 20px; font-size: 13px; color: #64748b;">
        Para probar las notificaciones reales de expedientes inactivos, usa:<br>
        <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">POST /api/expedientes-inactivos/notify</code>
      </p>`

    const html = wrapWithBaseTemplate(contentHtml, {
      title: 'Correo de Prueba',
      subtitle: 'Test de configuración de Resend',
    })

    const text = `Fusion Legal CR - Correo de prueba

Este es un correo de prueba del sistema de notificaciones.

Detalles:
- Destinatario: ${destinatario}
- Modo dry-run: ${dryRun ? 'Sí' : 'No'}
- Timestamp: ${new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}

Si ves este mensaje, Resend funciona correctamente.`

    const result = await sendEmail({
      to: destinatario,
      subject,
      html,
      text,
      forceSend,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          message: `Error enviando correo: ${result.error}`,
          dryRun,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: dryRun
        ? `Correo de prueba (DRY-RUN, no enviado) preparado para ${destinatario}. Revisa los logs.`
        : `Correo de prueba enviado a ${destinatario}`,
      dryRun,
      id: result.id ?? null,
      destinatario,
    })
  } catch (error) {
    console.error('[test-email] Error:', error)
    return NextResponse.json(
      {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Endpoint de prueba de correo activo',
    timestamp: new Date().toISOString(),
    dryRun: isDryRun(),
    destinatarioConfigurado: !!process.env.NOTIFICACION_INACTIVIDAD_EMAIL,
    resendConfigurado: !!process.env.RESEND_API_KEY,
    cronConfigurado: !!process.env.CRON_SECRET_TOKEN,
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
