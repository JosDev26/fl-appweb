import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

// Cliente de Supabase con service_role para crear usuarios
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
      .select('id, nombre, cedula, password, estaRegistrado')
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

    // Crear email interno basado en identificación
    const emailInterno = `${identificacion}@clientes.interno`

    // 1. Crear usuario en Supabase Auth (maneja la contraseña de forma segura)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailInterno,
      password: password,
      email_confirm: true,
      user_metadata: {
        cedula: identificacion,
        nombre: empresa.nombre,
        tipo: 'empresa',
        user_id: empresa.id
      }
    })

    if (authError) {
      console.error('Error creando empresa en Supabase Auth:', authError)
      return NextResponse.json(
        { error: 'Error al crear la cuenta de autenticación' },
        { status: 500 }
      )
    }

    // 2. Actualizar la empresa en nuestra tabla (solo marcar como registrado)
    const { error: updateError } = await supabase
      .from('empresas')
      .update({ 
        estaRegistrado: true,
        correo: emailInterno,
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
