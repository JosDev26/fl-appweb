import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkAuthRateLimit } from '@/lib/rate-limit'

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

// GET: Validar token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token no proporcionado' },
        { status: 400 }
      )
    }

    // Buscar token válido
    const { data: tokenData, error } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !tokenData) {
      return NextResponse.json(
        { valid: false, error: 'El enlace ha expirado o no es válido' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      valid: true,
      tipo: tokenData.tipo
    })

  } catch (error) {
    console.error('Error validando token:', error)
    return NextResponse.json(
      { valid: false, error: 'Error al validar el enlace' },
      { status: 500 }
    )
  }
}

// POST: Cambiar contraseña
export async function POST(request: NextRequest) {
  // Rate limiting: 5 requests per 10 min + 20 per hour per IP
  const rateLimitResponse = await checkAuthRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json(
        { error: 'Token y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // Validar requisitos de contraseña
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      )
    }

    // Buscar y validar token
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('*')
      .eq('token', token)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (tokenError || !tokenData) {
      return NextResponse.json(
        { error: 'El enlace ha expirado o no es válido. Solicita uno nuevo.' },
        { status: 400 }
      )
    }

    const { cedula, tipo } = tokenData
    const tabla = tipo === 'empresa' ? 'empresas' : 'usuarios'
    const emailInterno = `${cedula}@clientes.interno`

    // Buscar si existe usuario en Supabase Auth
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingAuthUser = authUsers?.users.find(u => u.email === emailInterno)

    if (existingAuthUser) {
      // Actualizar contraseña del usuario existente
      const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
        existingAuthUser.id,
        { password }
      )

      if (updateAuthError) {
        console.error('Error actualizando contraseña en Auth:', updateAuthError)
        return NextResponse.json(
          { error: 'Error al actualizar la contraseña' },
          { status: 500 }
        )
      }
    } else {
      // Usuario no existe en Auth - crear uno nuevo
      const { data: registro } = await supabaseAdmin
        .from(tabla)
        .select('id, nombre')
        .eq('cedula', cedula)
        .single()

      const { error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
        email: emailInterno,
        password: password,
        email_confirm: true,
        user_metadata: {
          cedula: cedula,
          nombre: registro?.nombre || '',
          tipo: tipo,
          user_id: registro?.id
        }
      })

      if (createAuthError) {
        console.error('Error creando usuario en Auth:', createAuthError)
        return NextResponse.json(
          { error: 'Error al crear la cuenta' },
          { status: 500 }
        )
      }

      // Marcar como registrado en la tabla
      await supabaseAdmin
        .from(tabla)
        .update({
          estaRegistrado: true,
          updated_at: new Date().toISOString()
        })
        .eq('cedula', cedula)
    }

    // Marcar token como usado
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('token', token)

    console.log(`[Reset Password] Contraseña actualizada para cedula: ${cedula}`)

    return NextResponse.json({
      success: true,
      message: 'Contraseña actualizada correctamente'
    })

  } catch (error) {
    console.error('Error en reset-password:', error)
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    )
  }
}
