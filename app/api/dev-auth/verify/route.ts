import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const { code, adminId } = await request.json()

    if (!code || code.length !== 64) {
      return NextResponse.json(
        { success: false, error: 'Código inválido' },
        { status: 400 }
      )
    }

    if (!adminId) {
      return NextResponse.json(
        { success: false, error: 'Admin ID requerido' },
        { status: 400 }
      )
    }

    // Buscar el código
    const { data: authCode, error: fetchError } = await supabase
      .from('dev_auth_codes')
      .select('*, dev_admins(*)')
      .eq('code', code.trim())
      .eq('admin_id', adminId)
      .eq('is_active', true)
      .is('used_at', null)
      .single()

    if (fetchError || !authCode) {
      return NextResponse.json(
        { success: false, error: 'Código no encontrado, ya usado o expirado' },
        { status: 404 }
      )
    }

    // Verificar que no haya expirado
    const now = new Date()
    const expiresAt = new Date(authCode.expires_at)

    if (now > expiresAt) {
      // Desactivar código expirado
      await supabase
        .from('dev_auth_codes')
        .update({ is_active: false })
        .eq('id', authCode.id)

      return NextResponse.json(
        { success: false, error: 'Código expirado. Solicita uno nuevo.' },
        { status: 401 }
      )
    }

    // Verificar que el admin siga activo
    if (!authCode.dev_admins.is_active) {
      return NextResponse.json(
        { success: false, error: 'Usuario desactivado' },
        { status: 403 }
      )
    }

    // Marcar código como usado
    const { error: updateCodeError } = await supabase
      .from('dev_auth_codes')
      .update({
        used_at: now.toISOString(),
        is_active: false
      })
      .eq('id', authCode.id)

    if (updateCodeError) {
      console.error('Error actualizando código:', updateCodeError)
      throw updateCodeError
    }

    // Generar token de sesión único (64 caracteres)
    const sessionToken = crypto.randomBytes(32).toString('hex')

    // Calcular expiración de sesión (8 horas)
    const sessionExpiresAt = new Date()
    sessionExpiresAt.setHours(sessionExpiresAt.getHours() + 8)

    // Obtener información del request
    const ipAddress = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Crear sesión en la base de datos
    const { error: sessionError } = await supabase
      .from('dev_sessions')
      .insert({
        admin_id: authCode.admin_id,
        session_token: sessionToken,
        expires_at: sessionExpiresAt.toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent,
        is_active: true
      })

    if (sessionError) {
      console.error('Error creando sesión:', sessionError)
      throw sessionError
    }

    // Actualizar último login
    await supabase
      .from('dev_admins')
      .update({ last_login: now.toISOString() })
      .eq('id', authCode.admin_id)

    // Establecer cookies seguras
    const cookieStore = await cookies()
    
    cookieStore.set('dev-auth', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8, // 8 horas
      path: '/dev'
    })

    cookieStore.set('dev-admin-id', authCode.admin_id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/dev'
    })

    cookieStore.set('dev-admin-name', authCode.dev_admins.name, {
      httpOnly: false, // Permitir acceso desde cliente para mostrar nombre
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 8,
      path: '/dev'
    })

    return NextResponse.json({
      success: true,
      message: '✅ Acceso concedido',
      admin: {
        id: authCode.dev_admins.id,
        email: authCode.dev_admins.email,
        name: authCode.dev_admins.name
      }
    })

  } catch (error) {
    console.error('Error verificando código:', error)
    return NextResponse.json(
      { success: false, error: 'Error del servidor' },
      { status: 500 }
    )
  }
}
