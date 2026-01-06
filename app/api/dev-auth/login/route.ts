import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { Resend } from 'resend'
import { checkAuthRateLimit } from '@/lib/rate-limit'

// Validate RESEND_API_KEY before creating client
if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.trim() === '') {
  throw new Error('Missing RESEND_API_KEY environment variable')
}
const resend = new Resend(process.env.RESEND_API_KEY)

// Función para enviar correo con Resend
async function sendAuthCode(email: string, name: string, code: string) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Fusion Legal <noreply@verificaciones.fusionlegalcr.com>',
      to: email,
      replyTo: 'soporte@fusionlegalcr.com', // Agregar reply-to válido
      subject: `Tu código de acceso - ${code.substring(0, 8)}...`,
      text: `Hola ${name},

Tu código de autenticación para el Panel de Administración es:

${code}

Este código expira en 10 minutos y solo puede ser usado una vez.

Si no solicitaste este código, ignora este mensaje.

Saludos,
Fusion Legal CR`,
      html: `
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; padding: 0; background-color: #f8fafc;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
      <tr>
        <td style="background: linear-gradient(135deg, #19304B 0%, #0f1419 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Fusion Legal CR</h1>
        </td>
      </tr>
      <tr>
        <td style="height: 4px; background: linear-gradient(90deg, #FAD02C 0%, #f9c74f 100%);"></td>
      </tr>
      <tr>
        <td style="background: white; padding: 30px; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 15px 0;">Hola <strong style="color: #19304B;">${name}</strong>,</p>
          <p style="margin: 0 0 20px 0;">Recibimos una solicitud de acceso al panel de administración. Usa el siguiente código para completar tu inicio de sesión:</p>
          
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 10px; padding: 25px; text-align: center;">
                <code style="font-size: 16px; font-weight: 600; color: #19304B; letter-spacing: 1px; word-break: break-all; font-family: 'Courier New', monospace; line-height: 1.6;">${code}</code>
              </td>
            </tr>
          </table>
          
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 20px;">
            <tr>
              <td style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; border-radius: 5px; color: #166534;">
                <strong>Instrucciones:</strong>
                <ol style="margin: 10px 0; padding-left: 20px;">
                  <li>Copia el código completo</li>
                  <li>Regresa a la página de login</li>
                  <li>Pega el código en el campo correspondiente</li>
                </ol>
              </td>
            </tr>
          </table>
          
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 20px;">
            <tr>
              <td style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; border-radius: 5px; color: #991b1b;">
                <strong>Importante:</strong> Este código expira en 10 minutos y solo puede ser usado una vez. No lo compartas con nadie.
              </td>
            </tr>
          </table>
          
          <p style="margin-top: 25px; font-size: 13px; color: #64748b;">
            Solicitud realizada el ${new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}
          </p>
          
          <p style="margin-top: 20px;">Saludos,<br><strong style="color: #19304B;">Equipo Fusion Legal CR</strong></p>
        </td>
      </tr>
      <tr>
        <td style="text-align: center; padding: 20px; color: #64748b; font-size: 12px;">
          <p style="margin: 0;">Este es un mensaje automático de seguridad.</p>
          <p style="margin: 5px 0 0 0;">Fusion Legal CR - fusionlegalcr.com</p>
        </td>
      </tr>
    </table>
  </body>
</html>
`
    })

    if (error) {
      console.error('Error de Resend:', error)
      throw new Error(`Error de Resend: ${error.message}`)
    }

    console.log('Email enviado exitosamente:', data)
    return { success: true }
  } catch (error: any) {
    console.error('Error enviando correo:', error)
    return { 
      success: false, 
      error: error.message || 'Error al enviar correo' 
    }
  }
}

export async function POST(request: NextRequest) {
  // Rate limiting: 5 requests per 10 min + 20 per hour per IP
  const rateLimitResponse = await checkAuthRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email y contraseña requeridos' },
        { status: 400 }
      )
    }

    // Buscar admin por email
    const { data: admin, error: adminError } = await supabase
      .from('dev_admins')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('is_active', true)
      .single()

    if (adminError || !admin) {
      // Respuesta genérica para no revelar si el email existe
      return NextResponse.json(
        { success: false, error: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, admin.password_hash)

    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, error: 'Credenciales inválidas' },
        { status: 401 }
      )
    }

    // Verificar límite de códigos activos (máximo 3 códigos no usados)
    const { data: activeCodes } = await supabase
      .from('dev_auth_codes')
      .select('id')
      .eq('admin_id', admin.id)
      .eq('is_active', true)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())

    if (activeCodes && activeCodes.length >= 3) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Demasiados códigos activos. Espera 10 minutos o usa uno existente.' 
        },
        { status: 429 }
      )
    }

    // Generar código único y seguro (64 caracteres hexadecimales)
    const code = crypto.randomBytes(32).toString('hex')

    // Calcular tiempo de expiración (10 minutos)
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 10)

    // Obtener información del request
    const ipAddress = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Guardar código en la base de datos
    const { data: authCode, error: codeError } = await supabase
      .from('dev_auth_codes')
      .insert({
        admin_id: admin.id,
        code,
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent,
        is_active: true
      })
      .select()
      .single()

    if (codeError) {
      console.error('Error guardando código:', codeError)
      throw codeError
    }

    // Enviar código por correo
    const emailResult = await sendAuthCode(admin.email, admin.name, code)

    if (!emailResult.success) {
      // Si falla el envío, eliminar el código de la DB
      await supabase
        .from('dev_auth_codes')
        .delete()
        .eq('id', authCode.id)

      console.error('Fallo al enviar correo:', emailResult.error)
      return NextResponse.json(
        { 
          success: false, 
          error: `Error al enviar el código: ${emailResult.error}` 
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Código de autenticación enviado a tu correo',
      adminId: admin.id,
      expiresIn: 10 // minutos
    })

  } catch (error) {
    console.error('Error en login:', error)
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    )
  }
}
