import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { identificacion } = await request.json()

    // Validar que se proporcione la identificación
    if (!identificacion) {
      return NextResponse.json(
        { error: 'La identificación es requerida' },
        { status: 400 }
      )
    }

    // Buscar el usuario por cédula en la base de datos
    const { data, error } = await supabase
      .from('usuarios')
      .select('id, cedula, nombre, estaRegistrado, password')
      .eq('cedula', parseInt(identificacion))
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error consultando base de datos:', error)
      return NextResponse.json(
        { error: 'Error interno del servidor' },
        { status: 500 }
      )
    }

    // Si no se encuentra el usuario
    if (!data) {
      return NextResponse.json({
        exists: false,
        message: 'Identificación no encontrada'
      })
    }

    // Verificar si ya está registrado (ya tiene contraseña)
    if (data.estaRegistrado || data.password) {
      return NextResponse.json(
        { error: 'Este usuario ya tiene una cuenta creada' },
        { status: 400 }
      )
    }

    // Usuario encontrado y puede crear contraseña
    return NextResponse.json({
      exists: true,
      user: {
        id: data.id,
        nombre: data.nombre,
        cedula: data.cedula
      }
    })

  } catch (error) {
    console.error('Error en validar-identificacion:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}