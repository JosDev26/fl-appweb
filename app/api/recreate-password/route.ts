import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import { checkAuthRateLimit } from '@/lib/rate-limit'
import { validatePassword } from '@/lib/validators/password'
import { validateIdentification, buildInternalEmail } from '@/lib/validators/identification'

// Tipos de cliente permitidos
const ALLOWED_TIPOS = ['empresa', 'cliente'] as const
type TipoCliente = typeof ALLOWED_TIPOS[number]

// Cliente de Supabase con service_role
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

/**
 * Busca un usuario por email usando paginación
 * Supabase Auth no soporta filtrado por email en listUsers, así que iteramos
 */
async function findAuthUserByEmail(email: string): Promise<{ id: string } | null> {
  const perPage = 100
  let page = 1
  const maxPages = 50 // Límite de seguridad para evitar loops infinitos
  
  while (page <= maxPages) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage
    })
    
    if (error) {
      console.error('Error listando usuarios en página', page, ':', error)
      break
    }
    
    const users = data?.users || []
    
    // Si no hay más usuarios, terminar
    if (users.length === 0) {
      break
    }
    
    // Buscar el usuario por email
    const found = users.find(u => u.email === email)
    if (found) {
      return { id: found.id }
    }
    
    // Si hay menos usuarios que el perPage, es la última página
    if (users.length < perPage) {
      break
    }
    
    page++
  }
  
  return null
}

export async function POST(request: NextRequest) {
  // Rate limiting: 5 requests per 10 min + 20 per hour per IP
  const rateLimitResponse = await checkAuthRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { identificacion, password, tipo } = await request.json()

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

    // Validar tipo contra whitelist
    if (!tipo || !ALLOWED_TIPOS.includes(tipo)) {
      return NextResponse.json(
        { error: `Tipo inválido. Debe ser uno de: ${ALLOWED_TIPOS.join(', ')}` },
        { status: 400 }
      )
    }
    const validatedTipo = tipo as TipoCliente

    // Mapear tipo a tabla
    const tabla = validatedTipo === 'empresa' ? 'empresas' : 'usuarios'
    const emailInterno = buildInternalEmail(sanitizedIdentificacion)

    // 1. Buscar el registro en la base de datos
    const { data: registro, error: selectError } = await supabase
      .from(tabla)
      .select('id, nombre, cedula')
      .eq('cedula', sanitizedIdentificacion)
      .single()

    if (selectError || !registro) {
      return NextResponse.json(
        { error: `${validatedTipo === 'empresa' ? 'Empresa' : 'Usuario'} no encontrado` },
        { status: 404 }
      )
    }

    // 2. Buscar y eliminar usuario existente en Supabase Auth si existe (con paginación)
    const existingAuthUser = await findAuthUserByEmail(emailInterno)
    
    if (existingAuthUser) {
      try {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id)
        if (deleteError) {
          console.error('Error eliminando usuario existente de Auth:', deleteError)
          return NextResponse.json(
            { error: 'Error al preparar la recreación de contraseña. Intente nuevamente.' },
            { status: 500 }
          )
        }
        console.log('✅ Usuario existente eliminado de Supabase Auth:', existingAuthUser.id)
      } catch (deleteError) {
        console.error('Error eliminando usuario existente de Auth:', deleteError)
        return NextResponse.json(
          { error: 'Error al preparar la recreación de contraseña' },
          { status: 500 }
        )
      }
    }

    // 3. Crear nuevo usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailInterno,
      password: password,
      email_confirm: true,
      user_metadata: {
        cedula: sanitizedIdentificacion,
        nombre: registro.nombre,
        tipo: validatedTipo,
        user_id: registro.id
      }
    })

    if (authError) {
      console.error('Error creando usuario en Supabase Auth:', authError)
      
      // Manejar error de email ya registrado
      if (authError.code === 'email_exists' || authError.message?.includes('already been registered')) {
        return NextResponse.json(
          { error: 'Esta cuenta ya está registrada. Si olvidó su contraseña, use la opción de recuperar contraseña.' },
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

    // 4. Actualizar registro en la base de datos (solo marcar como registrado)
    const { error: updateError } = await supabase
      .from(tabla)
      .update({
        estaRegistrado: true,
        updated_at: new Date().toISOString()
      })
      .eq('cedula', sanitizedIdentificacion)

    if (updateError) {
      console.error('Error actualizando registro:', updateError)
      
      // Rollback: eliminar usuario de Auth si la actualización en DB falla
      if (createdUserId) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(createdUserId)
          console.log('Rollback: Usuario eliminado de Auth debido a error en DB')
        } catch (rollbackError) {
          console.error('Error en rollback al eliminar usuario de Auth:', rollbackError)
        }
      }
      
      return NextResponse.json(
        { error: 'Error al actualizar la contraseña' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Contraseña recreada exitosamente. Ahora puedes iniciar sesión.'
    })

  } catch (error) {
    console.error('Error en recreate-password:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
