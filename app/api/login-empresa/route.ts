import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
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
      return NextResponse.json(
        { error: 'Identificación o contraseña incorrectas' },
        { status: 401 }
      )
    }

    // Verificar si la empresa está registrada
    if (!empresa.estaRegistrado) {
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
      return NextResponse.json(
        { error: 'Identificación o contraseña incorrectas' },
        { status: 401 }
      )
    }

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

    // Establecer cookies de sesión
    response.cookies.set('sb-access-token', authData.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    })

    response.cookies.set('sb-refresh-token', authData.session.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    })

    return response

  } catch (error) {
    console.error('Error en login de empresa:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
