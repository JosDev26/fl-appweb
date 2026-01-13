import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { checkAuthRateLimit } from '@/lib/rate-limit'
import { validatePassword } from '@/lib/validators/password'
import { validateIdentification, buildInternalEmail } from '@/lib/validators/identification'

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

export async function POST(request: NextRequest) {
  // Rate limiting: 5 requests per 10 min + 20 per hour per IP
  const rateLimitResponse = await checkAuthRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { identificacion, password } = await request.json()

    // Validar y sanitizar identificación
    const idValidation = validateIdentification(identificacion)
    if (!idValidation.isValid) {
      return NextResponse.json(
        { error: idValidation.error },
        { status: 400 }
      )
    }
    const sanitizedIdentificacion = idValidation.sanitized

    // Validar la contraseña con el validador compartido
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: 'Contraseña inválida', details: passwordValidation.errors },
        { status: 400 }
      )
    }

    // Buscar el usuario por cédula (usando parámetro sanitizado)
    const { data: usuario, error: searchError } = await supabase
      .from('usuarios')
      .select('id, cedula, nombre, estaRegistrado, password')
      .eq('cedula', sanitizedIdentificacion)
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

    // Crear email interno basado en identificación sanitizada
    const emailInterno = buildInternalEmail(sanitizedIdentificacion)

    // 1. Crear usuario en Supabase Auth (maneja la contraseña de forma segura)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailInterno,
      password: password,
      email_confirm: true, // Auto-confirmar email
      user_metadata: {
        cedula: sanitizedIdentificacion,
        nombre: usuario.nombre,
        tipo: 'cliente',
        user_id: usuario.id
      }
    })

    if (authError) {
      console.error('Error creando usuario en Supabase Auth:', authError)
      
      // Manejar error de email ya registrado
      if (authError.code === 'email_exists' || authError.message?.includes('already been registered')) {
        return NextResponse.json(
          { error: 'Este usuario ya tiene una cuenta registrada. Si olvidó su contraseña, use la opción de recuperar contraseña.' },
          { status: 409 }
        )
      }
      
      return NextResponse.json(
        { error: 'Error al crear la cuenta de autenticación' },
        { status: 500 }
      )
    }

    // Guardar el ID del usuario creado para posible rollback
    const createdUserId = authData.user?.id

    // 2. Actualizar el usuario en nuestra tabla (solo marcar como registrado)
    // NO sobrescribir el correo - los usuarios ya tienen su correo real
    const { error: updateError } = await supabase
      .from('usuarios')
      .update({
        estaRegistrado: true
      })
      .eq('id', usuario.id)

    if (updateError) {
      console.error('Error actualizando usuario:', updateError)
      
      // Rollback: eliminar usuario de Auth si la actualización en DB falla
      if (createdUserId) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(createdUserId)
          console.log('Rollback: Usuario eliminado de Auth debido a error en DB')
        } catch (deleteError) {
          console.error('Error en rollback al eliminar usuario de Auth:', deleteError)
        }
      }
      
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