import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { checkAuthRateLimit } from '@/lib/rate-limit'
import { validatePassword } from '@/lib/validators/password'
import { validateIdentification, buildInternalEmail } from '@/lib/validators/identification'

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

    // Validar contraseña con el validador compartido
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        { error: 'Contraseña inválida', details: passwordValidation.errors },
        { status: 400 }
      )
    }

    // Buscar empresa (usando parámetro sanitizado)
    const { data: empresa, error: selectError } = await supabase
      .from('empresas')
      .select('id, nombre, cedula, password, estaRegistrado')
      .eq('cedula', sanitizedIdentificacion)
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

    // Crear email interno basado en identificación sanitizada
    const emailInterno = buildInternalEmail(sanitizedIdentificacion)

    // 1. Crear usuario en Supabase Auth (maneja la contraseña de forma segura)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailInterno,
      password: password,
      email_confirm: true,
      user_metadata: {
        cedula: sanitizedIdentificacion,
        nombre: empresa.nombre,
        tipo: 'empresa',
        user_id: empresa.id
      }
    })

    if (authError) {
      console.error('Error creando empresa en Supabase Auth:', authError)
      
      // Manejar error de email ya registrado
      if (authError.code === 'email_exists' || authError.message?.includes('already been registered')) {
        return NextResponse.json(
          { error: 'Esta empresa ya tiene una cuenta registrada. Si olvidó su contraseña, use la opción de recuperar contraseña.' },
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

    // 2. Actualizar la empresa en nuestra tabla (solo marcar como registrado)
    // El correo interno solo existe en Supabase Auth, no se guarda en la tabla
    const { error: updateError } = await supabase
      .from('empresas')
      .update({ 
        estaRegistrado: true,
        updated_at: new Date().toISOString()
      })
      .eq('cedula', sanitizedIdentificacion)

    if (updateError) {
      console.error('Error al actualizar empresa:', updateError)
      
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
