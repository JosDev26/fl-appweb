import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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
      .select('id, nombre, cedula, password, estaRegistrado')
      .eq('cedula', identificacion)
      .single()

    if (error || !empresa) {
      return NextResponse.json(
        { error: 'Empresa no encontrada' },
        { status: 404 }
      )
    }

    // Verificar si la empresa está registrada
    if (!empresa.estaRegistrado) {
      return NextResponse.json(
        { error: 'Esta empresa no tiene una cuenta activa' },
        { status: 403 }
      )
    }

    // Verificar contraseña
    if (!empresa.password) {
      return NextResponse.json(
        { error: 'Esta empresa no tiene contraseña configurada' },
        { status: 403 }
      )
    }

    if (empresa.password !== password) {
      return NextResponse.json(
        { error: 'Contraseña incorrecta' },
        { status: 401 }
      )
    }

    // Login exitoso
    return NextResponse.json({
      success: true,
      empresa: {
        id: empresa.id,
        nombre: empresa.nombre,
        cedula: empresa.cedula,
        tipo: 'empresa'
      }
    })
  } catch (error) {
    console.error('Error en login de empresa:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
