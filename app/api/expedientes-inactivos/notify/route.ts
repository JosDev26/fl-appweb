import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { obtenerExpedientesInactivos, type ExpedienteInactivo } from '@/lib/expedientes-inactivos'
import { sendEmail, wrapWithBaseTemplate, isDryRun, parseEmailList } from '@/lib/email'
import { validateCronAuth, isCronAuthConfigured } from '@/lib/cron-auth'

// ============================================================================
// POST /api/expedientes-inactivos/notify
//
// Disparado por Vercel Cron (diario 00:30 UTC, después del sync 00:00).
// También invocable manualmente para pruebas.
//
// Flujo:
//   1. Valida CRON_SECRET / CRON_SECRET_TOKEN (auth del cron).
//   2. Valida NOTIFICACION_INACTIVIDAD_EMAIL (destinatario fijo).
//   3. Obtiene todos los expedientes inactivos (>= 15 días).
//   4. Consulta notificaciones_inactividad para excluir los ya notificados.
//   5. Para cada nuevo inactivo: envía correo + registra envío.
//   6. Devuelve resumen.
//
// Seguridad:
//   - Auth por Bearer token (CRON_SECRET o CRON_SECRET_TOKEN). En producción
//     sin token -> 401 (fail-closed). Ver lib/cron-auth.ts.
//   - Usa supabaseAdmin (service-role) para omitir RLS.
//   - Respeta EMAIL_DRY_RUN de forma estricta: no existe forma de forzar el
//     envío real desde el request (sin bypass tipo ?preview / ?force).
//
// Idempotencia:
//   - Constraint UNIQUE (expediente_id, tipo) en notificaciones_inactividad
//     imposibilita doble notificación incluso bajo concurrencia.
// ============================================================================

const NOTIFICACION_TIPO = 'inactividad_15d'

export async function POST(request: NextRequest) {
  const startedAt = new Date().toISOString()
  const logPrefix = '[expedientes-inactivos/notify]'

  try {
    // 1. Auth del cron (CRON_SECRET o CRON_SECRET_TOKEN; fail-closed en prod)
    const unauthorized = validateCronAuth(request)
    if (unauthorized) return unauthorized

    // 2. Destinatarios (soporta comma-separated en NOTIFICACION_INACTIVIDAD_EMAIL)
    const destinatarios = parseEmailList(process.env.NOTIFICACION_INACTIVIDAD_EMAIL || '')
    if (destinatarios.length === 0) {
      console.error(`${logPrefix} Falta NOTIFICACION_INACTIVIDAD_EMAIL`)
      return NextResponse.json(
        { success: false, message: 'Falta configurar NOTIFICACION_INACTIVIDAD_EMAIL (uno o varios separados por coma)' },
        { status: 500 }
      )
    }
    const destinatariosStr = destinatarios.join(', ')

    const dryRun = isDryRun()
    console.log(`${logPrefix} Iniciando (dryRun=${dryRun}, destinatarios=${destinatarios.length})`)

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
      })
    }

    // 4. Consultar cuáles ya fueron notificados (para no repetir)
    let yaNotificadosSet = new Set<string>()
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

    const pendientes = inactivos.filter(i => !yaNotificadosSet.has(i.id))

    console.log(`${logPrefix} Ya notificados: ${yaNotificadosSet.size} | Pendientes: ${pendientes.length}`)

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
      })
    }

    // 5. Correo consolidado con todos los pendientes
    const enviados: ExpedienteInactivo[] = []
    const errores: { expedienteId: string; error: string }[] = []

    const subject = `[Fusion Legal] ${pendientes.length} expediente(s) inactivo(s) - ${new Date().toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' })}`
    const { html, text } = buildInactivityEmail(pendientes)

    const result = await sendEmail({
      to: destinatarios,
      subject,
      html,
      text,
      priority: 'high',
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
          destinatarios,
        },
        { status: 500 }
      )
    }

    // El envío consolidado fue OK -> registramos tracking por expediente.
    for (const exp of pendientes) {
      try {
        const { error: insertError } = await supabaseAdmin
          .from('notificaciones_inactividad')
          .insert({
            expediente_id: exp.id,
            tipo: NOTIFICACION_TIPO,
            dias_inactivo_notificado: exp.diasInactivo,
            correo_destino: destinatariosStr,
            resend_id: result.id ?? null,
            dry_run: dryRun,
            metadata: {
              asunto: subject,
              expediente_titulo: exp.titulo,
              cliente: exp.clienteNombre,
              destinatarios,
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

    console.log(
      `${logPrefix} Finalizado. Enviados: ${enviados.length}/${pendientes.length} | Errores tracking: ${errores.length}`
    )

    return NextResponse.json({
      success: errores.length === 0,
      message: `Notificación enviada a ${destinatariosStr}: ${enviados.length} expediente(s) nuevo(s), ${yaNotificadosSet.size} ya notificado(s)`,
      timestamp: startedAt,
      total: inactivos.length,
      pendientes: pendientes.length,
      enviados: enviados.length,
      omitidos: yaNotificadosSet.size,
      errores: errores.length,
      erroresDetalle: errores.length > 0 ? errores : undefined,
      resendId: result.id ?? null,
      dryRun,
      destinatarios,
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
  const destinatarios = parseEmailList(process.env.NOTIFICACION_INACTIVIDAD_EMAIL || '')
  return NextResponse.json({
    success: true,
    message: 'Servicio de notificación de expedientes inactivos activo',
    timestamp: new Date().toISOString(),
    dryRun: isDryRun(),
    destinatariosConfigurados: destinatarios.length,
    destinatarios,
    cronAuthConfigurado: isCronAuthConfigured(),
  })
}

// ---------------------------------------------------------------------------
// Constructor del correo consolidado
// ---------------------------------------------------------------------------

function buildInactivityEmail(inactivos: ExpedienteInactivo[]): { html: string; text: string } {
  const fechaCr = new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })
  const total = inactivos.length

  // Dividir en 2 rubros (un expediente puede estar en ambos)
  const inactivosDinero = inactivos
    .filter(e => e.diasInactivoDinero >= 15)
    .sort((a, b) => b.diasInactivoDinero - a.diasInactivoDinero)
  const inactivosActualizacion = inactivos
    .filter(e => e.diasInactivoActualizacion >= 15)
    .sort((a, b) => b.diasInactivoActualizacion - a.diasInactivoActualizacion)

  // ---- Texto plano (fallback) ----
  const formatRubro = (
    lista: ExpedienteInactivo[],
    diasField: 'diasInactivoDinero' | 'diasInactivoActualizacion',
    movField: 'ultimoMovDinero' | 'ultimoMovActualizacion',
    tipoField: 'tipoUltimoMovDinero' | 'tipoUltimoMovActualizacion'
  ): string =>
    lista
      .map(
        (e, i) =>
          `${i + 1}. ${e.clienteNombre} - ${e.titulo ?? '(sin título)'} [${e.expediente ?? e.id}]
   Tipo: ${e.tipoExpediente} | Modalidad: ${e.modalidad_pago ?? 'n/a'} | Etapa: ${e.etapa_actual ?? 'n/a'}
   Días inactivo: ${e[diasField]} | Último movimiento: ${e[movField] ?? 'nunca'} (${e[tipoField] ?? 'sin registro'})`
      )
      .join('\n\n')

  const text = `Fusion Legal CR - Notificación de expedientes inactivos

Se detectaron ${total} expediente(s) inactivos (15+ días) al ${fechaCr}.

=== DESACTUALIZADOS POR DINERO (${inactivosDinero.length}) ===
${inactivosDinero.length ? formatRubro(inactivosDinero, 'diasInactivoDinero', 'ultimoMovDinero', 'tipoUltimoMovDinero') : 'Ninguno.'}

=== DESACTUALIZADOS POR ACTUALIZACIONES (${inactivosActualizacion.length}) ===
${inactivosActualizacion.length ? formatRubro(inactivosActualizacion, 'diasInactivoActualizacion', 'ultimoMovActualizacion', 'tipoUltimoMovActualizacion') : 'Ninguno.'}

Revisa el panel /dev para más detalles.

Saludos,
Fusion Legal CR`

  // ---- HTML con 2 secciones ----
  const diasColor = (d: number) => (d >= 60 ? '#dc2626' : d >= 30 ? '#ea580c' : '#ca8a04')
  const fmtFecha = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('es-CR', { timeZone: 'America/Costa_Rica' })
      : '<em style="color:#94a3b8;">Sin registro</em>'
  const fmtTipo = (t: string | null) =>
    t ? escapeHtml(t) : '<em style="color:#94a3b8;">—</em>'
  const tipoBadge = (e: ExpedienteInactivo) =>
    e.tipoExpediente === 'caso'
      ? '<span style="display:inline-block; background:#7c3aed; color:white; padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:600;">Caso</span>'
      : '<span style="display:inline-block; background:#2563eb; color:white; padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:600;">Solicitud</span>'

  const buildTabla = (
    lista: ExpedienteInactivo[],
    diasField: 'diasInactivoDinero' | 'diasInactivoActualizacion',
    movField: 'ultimoMovDinero' | 'ultimoMovActualizacion',
    tipoField: 'tipoUltimoMovDinero' | 'tipoUltimoMovActualizacion'
  ): string => {
    if (lista.length === 0) {
      return '<p style="margin:0 0 10px 0; color:#64748b; font-size:14px;">Ningún expediente en este rubro.</p>'
    }
    const filas = lista
      .map(e => {
        const d = e[diasField]
        return `<tr>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a;">${escapeHtml(e.clienteNombre)}</td>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#0f172a;">${escapeHtml(e.titulo ?? '(sin título)')}</td>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13px;">${escapeHtml(e.expediente ?? e.id)}</td>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; text-align:center;">${tipoBadge(e)}</td>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13px;">${escapeHtml(e.modalidad_pago ?? 'n/a')}</td>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; text-align:center;"><span style="display:inline-block; background:${diasColor(d)}; color:white; padding:3px 10px; border-radius:9999px; font-weight:600; font-size:13px;">${d}d</span></td>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13px;">${fmtFecha(e[movField])}</td>
          <td style="padding:10px 12px; border-bottom:1px solid #e2e8f0; color:#475569; font-size:13px;">${fmtTipo(e[tipoField])}</td>
        </tr>`
      })
      .join('')
    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 14px;">
      <thead>
        <tr style="background: #19304B; color: white;">
          <th style="padding: 12px; text-align: left; font-weight: 600;">Cliente</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Título</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Expediente</th>
          <th style="padding: 12px; text-align: center; font-weight: 600;">Tipo</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Modalidad</th>
          <th style="padding: 12px; text-align: center; font-weight: 600;">Días</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Último movimiento</th>
          <th style="padding: 12px; text-align: left; font-weight: 600;">Tipo mov</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
      </tbody>
    </table>`
  }

  const contenido = `
    <p style="margin: 0 0 15px 0;">Se detectaron <strong style="color:#19304B;">${total} expediente(s)</strong> inactivos por <strong>15 o más días</strong> al ${fechaCr}.</p>
    <p style="margin: 0 0 20px 0; color:#64748b; font-size:14px;">Revisa el panel <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">/dev &rarr; Expedientes Inactivos</code> para gestionar estos casos.</p>

    <h2 style="margin: 25px 0 12px 0; font-size: 18px; color: #19304B; border-bottom: 2px solid #FAD02C; padding-bottom: 6px;">💰 Desactualizados por dinero (${inactivosDinero.length})</h2>
    <p style="margin: 0 0 12px 0; color:#64748b; font-size:13px;">Sin gastos, servicios profesionales, mensualidades ni pagos en los últimos 15+ días.</p>
    ${buildTabla(inactivosDinero, 'diasInactivoDinero', 'ultimoMovDinero', 'tipoUltimoMovDinero')}

    <h2 style="margin: 30px 0 12px 0; font-size: 18px; color: #19304B; border-bottom: 2px solid #FAD02C; padding-bottom: 6px;">📝 Desactualizados por actualizaciones (${inactivosActualizacion.length})</h2>
    <p style="margin: 0 0 12px 0; color:#64748b; font-size:13px;">Sin actualizaciones escritas (solicitudes) ni trabajos por hora (casos) en los últimos 15+ días.</p>
    ${buildTabla(inactivosActualizacion, 'diasInactivoActualizacion', 'ultimoMovActualizacion', 'tipoUltimoMovActualizacion')}

    <p style="margin-top: 25px; font-size: 13px; color: #64748b;">
      Este correo fue generado automáticamente por el cron diario de Fusion Legal. Cada expediente se notifica una sola vez (tracking en <code style="background:#f1f5f9; padding:2px 6px; border-radius:4px;">notificaciones_inactividad</code>).
    </p>`

  const html = wrapWithBaseTemplate(contenido, {
    title: 'Expedientes Inactivos',
    subtitle: `${total} expediente(s) — Dinero: ${inactivosDinero.length} | Actualizaciones: ${inactivosActualizacion.length}`,
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
