import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { identificacion, password } = await request.json()

    // Validar que se proporcionen ambos campos
    if (!identificacion || !password) {
      return NextResponse.json(
        { error: 'Identificación y contraseña son requeridas' },
        { status: 400 }
      )
    }

    // Buscar el usuario por cédula en la base de datos
    const { data: user, error } = await supabase
      .from('usuarios')
      .select('id, cedula, nombre, estaRegistrado, modoPago')
      .eq('cedula', identificacion)
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: 'Identificación o contraseña incorrectas' },
        { status: 401 }
      )
    }

    // Verificar si el usuario está registrado
    if (!user.estaRegistrado) {
      return NextResponse.json(
        { error: 'Usuario no registrado. Debe crear una cuenta primero.' },
        { status: 401 }
      )
    }

    // Crear email interno
    const emailInterno = `${identificacion}@clientes.interno`

    // Hacer login con Supabase Auth (esto crea cookies HTTP-Only automáticamente)
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
      return NextResponse.json(
        { error: 'Identificación o contraseña incorrectas' },
        { status: 401 }
      )
    }

    // Login exitoso - Crear respuesta con cookies
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        nombre: user.nombre,
        cedula: user.cedula,
        modoPago: user.modoPago || false,
        tipo: 'cliente'
      }
    })

    // Establecer cookies de sesión de Supabase
    response.cookies.set('sb-access-token', authData.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/'
    })

    response.cookies.set('sb-refresh-token', authData.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 días
      path: '/'
    })

    return response

  } catch (error) {
    console.error('Error en login:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}