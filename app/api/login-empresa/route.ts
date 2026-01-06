import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { checkAuthRateLimit, resetAuthFailures, incrementAuthFailures } from '@/lib/rate-limit'
import { setCsrfCookies } from '@/lib/csrf'
import { logAuthFailure, logAuthSuccess } from '@/lib/security-logger'

export async function POST(request: NextRequest) {
  // Rate limiting: 5 requests per 10 min + 20 per hour per IP
  // Check rate limit before any application logic
  try {
    const rateLimitResponse = await checkAuthRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse
  } catch (error) {
    console.error('Rate limit check error:', error)
    // If rate limiting fails, allow request to proceed (fail-open)
  }

  try {
    const { identificacion, password } = await request.json()

    if (!identificacion || !password) {
      return NextResponse.json(
        { error: 'Identificación y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // Buscar empresa por cédula
    const { data: empresa, error } = await supabase
      .from('empresas')
      .select('id, nombre, cedula, estaRegistrado, modoPago')
      .eq('cedula', identificacion)
      .single()

    if (error || !empresa) {
      await logAuthFailure(request, 'Empresa not found', identificacion)
      return NextResponse.json(
        { error: 'Identificación o contraseña incorrectas' },
        { status: 401 }
      )
    }

    // Verificar si la empresa está registrada
    if (!empresa.estaRegistrado) {
      await logAuthFailure(request, 'Empresa not registered', identificacion)
      return NextResponse.json(
        { error: 'Empresa no registrada. Debe crear una cuenta primero.' },
        { status: 401 }
      )
    }

    // Crear email interno
    const emailInterno = `${identificacion}@clientes.interno`

    // Hacer login con Supabase Auth
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true
        }
      }
    )

    const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
      email: emailInterno,
      password: password
    })

    if (authError || !authData.session) {
      await logAuthFailure(request, 'Invalid password', identificacion)
      await incrementAuthFailures(empresa.id, 'empresa')
      return NextResponse.json(
        { error: 'Identificación o contraseña incorrectas' },
        { status: 401 }
      )
    }

    // Log successful authentication and reset failure counter
    await logAuthSuccess(request, empresa.id, 'empresa')
    await resetAuthFailures(empresa.id, 'empresa')

    // Login exitoso - Crear respuesta con cookies
    const response = NextResponse.json({
      success: true,
      empresa: {
        id: empresa.id,
        nombre: empresa.nombre,
        cedula: empresa.cedula,
        modoPago: empresa.modoPago || false,
        tipo: 'empresa'
      }
    })

    // Configuración de cookies seguras
    const isProduction = process.env.NODE_ENV === 'production'
    
    // Establecer cookies de sesión con seguridad mejorada
    response.cookies.set('sb-access-token', authData.session.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    })

    response.cookies.set('sb-refresh-token', authData.session.refresh_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    })

    // Set CSRF tokens for protection against cross-site request forgery
    setCsrfCookies(response)

    return response

  } catch (error) {
    console.error('Error en login de empresa:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
