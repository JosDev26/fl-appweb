import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

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

    // Encriptar la contraseña
    const saltRounds = 12
    const hashedPassword = await bcrypt.hash(password, saltRounds)

    // Actualizar el usuario en la base de datos
    const { error: updateError } = await supabase
      .from('usuarios')
      .update({
        password: hashedPassword,
        estaRegistrado: true
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