import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import crypto from 'crypto'
import { checkEmailRateLimit } from '@/lib/rate-limit'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  // Rate limiting: 3 requests per hour per IP (prevents email spam)
  const rateLimitResponse = await checkEmailRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { correoReportes } = await request.json()

    if (!correoReportes || !correoReportes.trim()) {
      return NextResponse.json(
        { error: 'El correo es requerido' },
        { status: 400 }
      )
    }

    const correoNormalizado = correoReportes.trim().toLowerCase()

    // Buscar en usuarios primero (usuarios usan el campo "correo", no "correo_reportes")
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('cedula, nombre, correo')
      .ilike('correo', correoNormalizado)
      .single()

    // Si no está en usuarios, buscar en empresas (empresas usan "correo_reportes")
    let registro: { cedula: string; nombre: string; correo_destino: string; tipo: string } | null = 
      usuario ? { cedula: usuario.cedula, nombre: usuario.nombre, correo_destino: usuario.correo, tipo: 'usuario' } : null

    if (!registro) {
      const { data: empresa } = await supabaseAdmin
        .from('empresas')
        .select('cedula, nombre, correo_reportes')
        .ilike('correo_reportes', correoNormalizado)
        .single()

      if (empresa) {
        registro = { cedula: empresa.cedula, nombre: empresa.nombre, correo_destino: empresa.correo_reportes, tipo: 'empresa' }
      }
    }

    // IMPORTANTE: Siempre responder con éxito para no revelar si existe o no
    if (!registro) {
      console.log(`[Recuperar Password] Correo no encontrado: ${correoNormalizado}`)
      // Respuesta genérica - NO revelar que no existe
      return NextResponse.json({
        success: true,
        message: 'Si el correo está registrado, recibirás un enlace de recuperación.'
      })
    }

    // Generar token seguro
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    // Eliminar tokens anteriores para este usuario
    await supabaseAdmin
      .from('password_reset_tokens')
      .delete()
      .eq('cedula', registro.cedula)
      .eq('tipo', registro.tipo)

    // Crear nuevo token
    const { error: insertError } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({
        token,
        cedula: registro.cedula,
        tipo: registro.tipo,
        correo_reportes: registro.correo_destino,
        expires_at: expiresAt.toISOString()
      })

    if (insertError) {
      console.error('Error insertando token:', insertError)
      return NextResponse.json({
        success: true,
        message: 'Si el correo está registrado, recibirás un enlace de recuperación.'
      })
    }

    // Construir URL de reset - usar la URL del request o variable de entorno
    const requestUrl = new URL(request.url)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${requestUrl.protocol}//${requestUrl.host}`
    
    if (!baseUrl) {
      console.error('ERROR: No se pudo determinar la URL base')
      return NextResponse.json({
        success: true,
        message: 'Si el correo está registrado, recibirás un enlace de recuperación.'
      })
    }
    const resetUrl = `${baseUrl}/reset-password?token=${token}`

    // Enviar email
    try {
      await resend.emails.send({
        from: 'Fusion Legal <noreply@verificaciones.fusionlegalcr.com>',
        to: registro.correo_destino,
        subject: 'Recuperación de contraseña - Fusion Legal',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 500px; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, #19304B 0%, #0f1419 100%); padding: 30px; text-align: center;">
                        <table width="60" height="60" cellpadding="0" cellspacing="0" style="margin: 0 auto 15px; background: #FAD02C; border-radius: 50%;">
                          <tr>
                            <td align="center" valign="middle" style="color: #19304B; font-size: 24px; font-weight: bold;">FL</td>
                          </tr>
                        </table>
                        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 600;">Recuperación de Contraseña</h1>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 30px;">
                        <p style="color: #333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                          Hola <strong>${registro.nombre || 'Usuario'}</strong>,
                        </p>
                        <p style="color: #666; font-size: 15px; line-height: 1.6; margin: 0 0 25px;">
                          Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón de abajo para crear una nueva contraseña:
                        </p>
                        
                        <div style="text-align: center; margin: 30px 0;">
                          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #FAD02C 0%, #f9c74f 100%); color: #19304B; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(250, 208, 44, 0.3);">
                            Restablecer Contraseña
                          </a>
                        </div>
                        
                        <p style="color: #999; font-size: 13px; line-height: 1.5; margin: 25px 0 0; padding-top: 20px; border-top: 1px solid #eee;">
                          ⏰ Este enlace expirará en <strong>1 hora</strong>.<br>
                          🔒 Si no solicitaste este cambio, puedes ignorar este correo.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background: #f9f9f9; padding: 20px; text-align: center; border-top: 1px solid #eee;">
                        <p style="color: #999; font-size: 12px; margin: 0;">
                          © ${new Date().getFullYear()} Fusion Legal. Todos los derechos reservados.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `
      })

      console.log(`[Recuperar Password] Email enviado a: ${registro.correo_destino}`)
    } catch (emailError) {
      console.error('Error enviando email:', emailError)
      // No revelar el error al usuario
    }

    return NextResponse.json({
      success: true,
      message: 'Si el correo está registrado, recibirás un enlace de recuperación.'
    })

  } catch (error) {
    console.error('Error en recuperar-password:', error)
    return NextResponse.json({
      success: true,
      message: 'Si el correo está registrado, recibirás un enlace de recuperación.'
    })
  }
}
