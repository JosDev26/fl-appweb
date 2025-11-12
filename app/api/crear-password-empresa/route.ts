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

    // Validar requisitos de contraseña
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      )
    }

    // Buscar empresa
    const { data: empresa, error: selectError } = await supabase
      .from('empresas')
      .select('id, cedula, password, estaRegistrado')
      .eq('cedula', identificacion)
      .single()

    if (selectError || !empresa) {
      return NextResponse.json(
        { error: 'Empresa no encontrada' },
        { status: 404 }
      )
    }

    // Verificar si ya tiene contraseña
    if (empresa.password) {
      return NextResponse.json(
        { error: 'Esta empresa ya tiene una contraseña configurada' },
        { status: 400 }
      )
    }

    // Actualizar contraseña y marcar como registrada
    const { error: updateError } = await supabase
      .from('empresas')
      .update({ 
        password: password,
        estaRegistrado: true,
        updated_at: new Date().toISOString()
      })
      .eq('cedula', identificacion)

    if (updateError) {
      console.error('Error al actualizar empresa:', updateError)
      return NextResponse.json(
        { error: 'Error al crear la contraseña' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Contraseña creada exitosamente'
    })
  } catch (error) {
    console.error('Error al crear contraseña de empresa:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
