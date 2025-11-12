import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { identificacion } = await request.json()

    if (!identificacion) {
      return NextResponse.json(
        { error: 'Identificación es requerida' },
        { status: 400 }
      )
    }

    // Buscar empresa por cédula
    const { data: empresa, error } = await supabase
      .from('empresas')
      .select('id, cedula, estaRegistrado, password')
      .eq('cedula', identificacion)
      .single()

    if (error || !empresa) {
      return NextResponse.json(
        { exists: false, message: 'Empresa no encontrada en el sistema' },
        { status: 200 }
      )
    }

    // Verificar si la empresa está registrada pero ya tiene contraseña
    if (empresa.estaRegistrado && empresa.password) {
      return NextResponse.json(
        { 
          exists: false, 
          message: 'Esta empresa ya tiene una cuenta. Por favor inicie sesión.',
          hasAccount: true
        },
        { status: 200 }
      )
    }

    // Empresa existe y puede crear cuenta
    return NextResponse.json({
      exists: true,
      message: 'Empresa encontrada. Puede proceder a crear su contraseña.'
    })
  } catch (error) {
    console.error('Error al validar identificación de empresa:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
