import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { obtenerExpedientesInactivos, type ExpedienteInactivo } from '@/lib/expedientes-inactivos'
import { sendEmail, wrapWithBaseTemplate, isDryRun } from '@/lib/email'

// ============================================================================
// POST /api/expedientes-inactivos/notify
//
// Disparado por Vercel Cron (diario 00:30 UTC, después del sync 00:00).
// También invocable manualmente para pruebas.
//
// Query params:
//   ?preview=true  -> Modo preview: envía correo real (ignora EMAIL_DRY_RUN),
//                     NO registra tracking, NO filtra los ya notificados.
//                     Útil para ver el formato del correo sin afectar al cron.
//
// Flujo (modo normal):
//   1. Valida CRON_SECRET_TOKEN (auth del cron).
//   2. Valida NOTIFICACION_INACTIVIDAD_EMAIL (destinatario fijo).
//   3. Obtiene todos los expedientes inactivos (>= 15 días).
//   4. Consulta notificaciones_inactividad para excluir los ya notificados.
//   5. Para cada nuevo inactivo: envía correo + registra envío.
//   6. Devuelve resumen.
//
// Seguridad:
//   - Auth por Bearer token (CRON_SECRET_TOKEN). Si no está configurado,
//     permite acceso (modo desarrollo, igual que /api/sync/auto).
//   - Usa supabaseAdmin (service-role) para omitir RLS.
//
// Idempotencia (modo normal):
//   - Constraint UNIQUE (expediente_id, tipo) en notificaciones_inactividad
//     imposibilita doble notificación incluso bajo concurrencia.
//   - Modo preview NO es idempotente: no toca la tabla, así que puede
//     dispararse cuantas veces se quiera sin afectar al cron.
// ============================================================================

const NOTIFICACION_TIPO = 'inactividad_15d'

export async function POST(request: NextRequest) {
  const startedAt = new Date().toISOString()
  const logPrefix = '[expedientes-inactivos/notify]'

  // Modo preview: ?preview=true
  const previewMode = request.nextUrl.searchParams.get('preview') === 'true'

  try {
    // 1. Auth del cron
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.CRON_SECRET_TOKEN
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
    }

    // 2. Destinatario fijo
    const destinatario = process.env.NOTIFICACION_INACTIVIDAD_EMAIL
    if (!destinatario || destinatario.trim() === '') {
      console.error(`${logPrefix} Falta NOTIFICACION_INACTIVIDAD_EMAIL`)
      return NextResponse.json(
        { success: false, message: 'Falta configurar NOTIFICACION_INACTIVIDAD_EMAIL' },
        { status: 500 }
      )
    }

    // En modo preview, forzamos dryRun=false (envío real) e ignoramos el tracking.
    const dryRun = previewMode ? false : isDryRun()
    console.log(`${logPrefix} Iniciando (dryRun=${dryRun}, preview=${previewMode})`)

    // 3. Obtener expedientes inactivos
    const inactivos = await obtenerExpedientesInactivos(supabaseAdmin)
    console.log(`${logPrefix} Inactivos encontrados: ${inactivos.length}`)

    if (inactivos.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay expedientes inactivos',
        timestamp: startedAt,
        total: 0,
        enviados: 0,
        omitidos: 0,
        errores: 0,
        dryRun,
        preview: previewMode,
      })
    }

    // 4. Consultar cuáles ya fueron notificados (para no repetir)
    //    EN MODO PREVIEW: saltamos este paso -> enviamos TODOS los inactivos.
    let yaNotificadosSet = new Set<string>()
    if (!previewMode) {
      const expedienteIds = inactivos.map(i => i.id)
      const { data: yaNotificados, error: notifError } = await supabaseAdmin
        .from('notificaciones_inactividad')
        .select('expediente_id')
        .in('expediente_id', expedienteIds)
        .eq('tipo', NOTIFICACION_TIPO)

      if (notifError) {
        console.error(`${logPrefix} Error consultando notificaciones previas:`, notifError)
        // No abortamos: intentamos notificar todos (el constraint UNIQUE protegerá)
      }

      yaNotificadosSet = new Set((yaNotificados ?? []).map((n: any) => n.expediente_id))
    }

    const pendientes = previewMode ? inactivos : inactivos.filter(i => !yaNotificadosSet.has(i.id))

    console.log(
      `${logPrefix} Ya notificados: ${yaNotificadosSet.size} | Pendientes: ${pendientes.length}${previewMode ? ' (preview: todos)' : ''}`
    )

    if (pendientes.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Todos los expedientes inactivos ya fueron notificados',
        timestamp: startedAt,
        total: inactivos.length,
        enviados: 0,
        omitidos: yaNotificadosSet.size,
        errores: 0,
        dryRun,
        preview: previewMode,
      })
    }

    // 5. Correo consolidado con todos los pendientes
    const enviados: ExpedienteInactivo[] = []
    const errores: { expedienteId: string; error: string }[] = []

    const subject = `[Fusion Legal] ${pendientes.length} expediente(s) inactivo(s) - ${new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' })}${previewMode ? ' [PREVIEW]' : ''}`
    const { html, text } = buildInactivityEmail(pendientes)

    const result = await sendEmail({
      to: destinatario,
      subject,
      html,
      text,
      priority: 'high',
      // En modo preview, forzamos el envío real ignorando EMAIL_DRY_RUN
      forceSend: previewMode,
    })

    if (!result.success) {
      console.error(`${logPrefix} Falló el envío consolidado: ${result.error}`)
      return NextResponse.json(
        {
          success: false,
          message: `Error enviando correo: ${result.error}`,
          timestamp: startedAt,
          total: inactivos.length,
          enviados: 0,
          omitidos: yaNotificadosSet.size,
          errores: pendientes.length,
          dryRun,
          preview: previewMode,
        },
        { status: 500 }
      )
    }

    // El envío consolidado fue OK
    // EN MODO PREVIEW: NO registramos tracking (es solo para ver el formato).
    if (!previewMode) {
      for (const exp of pendientes) {
        try {
          const { error: insertError } = await supabaseAdmin
            .from('notificaciones_inactividad')
            .insert({
              expediente_id: exp.id,
              tipo: NOTIFICACION_TIPO,
              dias_inactivo_notificado: exp.diasInactivo,
              correo_destino: destinatario,
              resend_id: result.id ?? null,
              dry_run: dryRun,
              metadata: {
                asunto: subject,
                expediente_titulo: exp.titulo,
                cliente: exp.clienteNombre,
              },
            })

          if (insertError) {
            // Si es violación del UNIQUE, significa que otro proceso ya lo
            // notificó concurrentemente -> no es un error real.
            if (insertError.code === '23505') {
              console.warn(`${logPrefix} ${exp.id} ya notificado concurrentemente, omitiendo tracking`)
            } else {
              console.error(`${logPrefix} Error registrando tracking para ${exp.id}:`, insertError)
              errores.push({ expedienteId: exp.id, error: insertError.message })
            }
            continue
          }
          enviados.push(exp)
        } catch (err: any) {
          console.error(`${logPrefix} Excepción registrando tracking para ${exp.id}:`, err)
          errores.push({ expedienteId: exp.id, error: err?.message || 'Error desconocido' })
        }
      }
    } else {
      // Preview: todos "enviados" (sin tracking)
      enviados.push(...pendientes)
    }

    console.log(
      `${logPrefix} Finalizado. Enviados: ${enviados.length}/${pendientes.length} | Errores tracking: ${errores.length}${previewMode ? ' (preview: sin tracking)' : ''}`
    )

    return NextResponse.json({
      success: errores.length === 0,
      message: previewMode
        ? `[PREVIEW] Correo enviado a ${destinatario} con ${pendientes.length} expediente(s). NO se registró tracking.`
        : `Notificación enviada a ${destinatario}: ${enviados.length} expediente(s) nuevo(s), ${yaNotificadosSet.size} ya notificado(s)`,
      timestamp: startedAt,
      total: inactivos.length,
      pendientes: pendientes.length,
      enviados: enviados.length,
      omitidos: yaNotificadosSet.size,
      errores: errores.length,
      erroresDetalle: errores.length > 0 ? errores : undefined,
      resendId: result.id ?? null,
      dryRun,
      preview: previewMode,
    })
  } catch (error) {
    console.error(`${logPrefix} Error interno:`, error)
    return NextResponse.json(
      {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        timestamp: startedAt,
      },
      { status: 500 }
    )
  }
}

// Endpoint GET para verificar estado del servicio (igual que /api/sync/auto)
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Servicio de notificación de expedientes inactivos activo',
    timestamp: new Date().toISOString(),
    dryRun: isDryRun(),
    destinatarioConfigurado: !!process.env.NOTIFICACION_INACTIVIDAD_EMAIL,
    cronConfigurado: !!process.env.CRON_SECRET_TOKEN,
  })
}

// ---------------------------------------------------------------------------
// Constructor del correo consolidado
// ---------------------------------------------------------------------------

function buildInactivityEmail(inactivos: ExpedienteInactivo[]): { html: string; text: string } {
  const fechaCr = new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
  const total = inactivos.length

  // Texto plano (fallback)
  const text = `Fusion Legal CR - Notificación de expedientes inactivos

Se detectaron ${total} expediente(s) sin actividad por 15 o más días al ${fechaCr}:

${inactivos
  .map(
    (e, i) =>
      `${i + 1}. ${e.clienteNombre} - ${e.titulo ?? '(sin título)'} [${e.expediente ?? e.id}]
   Modalidad: ${e.modalidad_pago ?? 'n/a'} | Etapa: ${e.etapa_actual ?? 'n/a'}
   Días inactivo: ${e.diasInactivo} | Último movimiento: ${e.ultimoMovimiento ?? 'nunca'} (${e.tipoUltimoMovimiento ?? 'sin registro'})`
  )
  .join('\n\n')}

Revisa el panel /dev para más detalles.

Saludos,
Fusion Legal CR`

  // HTML con tabla
  const filas = inactivos
    .map(e => {
      const diasColor =
        e.diasInactivo >= 60 ? '#dc2626' : e.diasInactivo >= 30 ? '#ea580c' : '#ca8a04'
      const ultimoMov = e.ultimoMovimiento
        ? new Date(e.ultimoMovimiento).toLocaleDateString('es-CR', {
            timeZone: 'America/Costa_Rica',
          })
        : '<em style="color:#94a3b8;">Sin actividad registrada</em>'
      const tipoMov = e.tipoUltimoMovimiento
        ? escapeHtml(e.tipoUltimoMovimiento)
        : '<em style="color:#94a3b8;">—</em>'

      return `<tr>
        <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a;">${escapeHtml(e.clienteNombre)}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a;">${escapeHtml(e.titulo ?? '(sin título)')}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13px;">${escapeHtml(e.expediente ?? e.id)}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13px;">${escapeHtml(e.modalidad_pago ?? 'n/a')}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13px;">${escapeHtml(e.etapa_actual ?? 'n/a')}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; text-align:center;"><span style="display:inline-block; background:${diasColor}; color:white; padding:3px 10px; border-radius:9999px; font-weight:600; font-size:13px;">${e.diasInactivo}d</span></td>
        <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13px;">${ultimoMov}</td>
        <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13px;">${tipoMov}</td>
      </tr>`
    })
    .join('')

  const contenido = `
    <p style="margin: 0 0 15px 0;">Se detectaron <strong style="color:#19304B;">${total} expediente(s)</strong> sin actividad por <strong>15 o más días</strong> al ${fechaCr}.</p>
    <p style="margin: 0 0 20px 0; color:#64748b; font-size:14px;">Revisa el panel <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">/dev &rarr; Expedientes Inactivos</code> para gestionar estos casos.</p>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 14px;">
      <thead>
        <tr style="background: #19304B; color: white;">
          <th style="padding: 12px; text-align: left; font-weight: 600;">Cliente</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Título</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Expediente</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Modalidad</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Etapa</th>
          <th style="padding: 12px; text-align: center; font-weight: 600;">Días</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Último movimiento</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Tipo</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
      </tbody>
    </table>

    <p style="margin-top: 25px; font-size: 13px; color: #64748b;">
      Este correo fue generado automáticamente por el cron diario de Fusion Legal. Cada expediente se notifica una sola vez (tracking en <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">notificaciones_inactividad</code>).
    </p>`

  const html = wrapWithBaseTemplate(contenido, {
    title: 'Expedientes Inactivos',
    subtitle: `${total} caso(s) sin actividad por 15+ días`,
  })

  return { html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
