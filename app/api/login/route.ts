import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

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
      .select('id, cedula, nombre, estaRegistrado, password')
      .eq('cedula', parseInt(identificacion))
      .single()

    if (error || !user) {
      return NextResponse.json(
        { error: 'Identificación o contraseña incorrectas' },
        { status: 401 }
      )
    }

    // Verificar si el usuario está registrado
    if (!user.estaRegistrado || !user.password) {
      return NextResponse.json(
        { error: 'Usuario no registrado. Debe crear una cuenta primero.' },
        { status: 401 }
      )
    }

    // Verificar la contraseña
    const passwordMatch = await bcrypt.compare(password, user.password)
    
    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Identificación o contraseña incorrectas' },
        { status: 401 }
      )
    }

    // Login exitoso
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        nombre: user.nombre,
        cedula: user.cedula
      }
    })

  } catch (error) {
    console.error('Error en login:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}