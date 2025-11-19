import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

// Cliente de Supabase con service_role para crear usuarios
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Necesitas agregar esta variable
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Función para validar la contraseña
function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  if (password.length < 8) {
    errors.push('La contraseña debe tener al menos 8 caracteres')
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra mayúscula')
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('La contraseña debe contener al menos una letra minúscula')
  }
  
  if (!/\d/.test(password)) {
    errors.push('La contraseña debe contener al menos un número')
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('La contraseña debe contener al menos un carácter especial')
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

export async function POST(request: NextRequest) {
  try {
    const { identificacion, password } = await request.json()

    // Validar que se proporcionen todos los datos
    if (!identificacion || !password) {
      return NextResponse.json(
        { error: 'La identificación y contraseña son requeridas' },
        { status: 400 }
      )
    }

    // Validar la contraseña
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: 'Contraseña inválida', details: passwordValidation.errors },
        { status: 400 }
      )
    }

    // Buscar el usuario por cédula
    const { data: usuario, error: searchError } = await supabase
      .from('usuarios')
      .select('id, cedula, nombre, estaRegistrado, password')
      .eq('cedula', parseInt(identificacion))
      .single()

    if (searchError || !usuario) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    // Verificar si ya está registrado
    if (usuario.estaRegistrado || usuario.password) {
      return NextResponse.json(
        { error: 'Este usuario ya tiene una contraseña configurada' },
        { status: 400 }
      )
    }

    // Crear email interno basado en identificación
    const emailInterno = `${identificacion}@clientes.interno`

    // 1. Crear usuario en Supabase Auth (maneja la contraseña de forma segura)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailInterno,
      password: password,
      email_confirm: true, // Auto-confirmar email
      user_metadata: {
        cedula: identificacion,
        nombre: usuario.nombre,
        tipo: 'cliente',
        user_id: usuario.id
      }
    })

    if (authError) {
      console.error('Error creando usuario en Supabase Auth:', authError)
      return NextResponse.json(
        { error: 'Error al crear la cuenta de autenticación' },
        { status: 500 }
      )
    }

    // 2. Actualizar el usuario en nuestra tabla (solo marcar como registrado)
    const { error: updateError } = await supabase
      .from('usuarios')
      .update({
        estaRegistrado: true,
        correo: emailInterno // Guardar el email interno
      })
      .eq('id', usuario.id)

    if (updateError) {
      console.error('Error actualizando usuario:', updateError)
      return NextResponse.json(
        { error: 'Error al guardar la contraseña' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Contraseña creada exitosamente'
    })

  } catch (error) {
    console.error('Error en crear-password:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}