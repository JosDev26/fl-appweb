import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

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

export async function POST(request: NextRequest) {
  try {
    const { identificacion, password, tipo } = await request.json()

    if (!identificacion || !password || !tipo) {
      return NextResponse.json(
        { error: 'Identificación, contraseña y tipo son requeridos' },
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

    const tabla = tipo === 'empresa' ? 'empresas' : 'usuarios'
    const emailInterno = `${identificacion}@clientes.interno`

    // 1. Buscar el registro en la base de datos
    const { data: registro, error: selectError } = await supabase
      .from(tabla)
      .select('id, nombre, cedula')
      .eq('cedula', parseInt(identificacion))
      .single()

    if (selectError || !registro) {
      return NextResponse.json(
        { error: `${tipo === 'empresa' ? 'Empresa' : 'Usuario'} no encontrado` },
        { status: 404 }
      )
    }

    // 2. Eliminar usuario existente en Supabase Auth si existe
    const { data: authUsers } = await supabaseAdmin.auth.admin.listUsers()
    const existingAuthUser = authUsers?.users.find(u => u.email === emailInterno)
    
    if (existingAuthUser) {
      await supabaseAdmin.auth.admin.deleteUser(existingAuthUser.id)
      console.log('✅ Usuario existente eliminado de Supabase Auth')
    }

    // 3. Crear nuevo usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailInterno,
      password: password,
      email_confirm: true,
      user_metadata: {
        cedula: parseInt(identificacion),
        nombre: registro.nombre,
        tipo: tipo,
        user_id: registro.id
      }
    })

    if (authError) {
      console.error('Error creando usuario en Supabase Auth:', authError)
      return NextResponse.json(
        { error: 'Error al crear la cuenta de autenticación' },
        { status: 500 }
      )
    }

    // 4. Actualizar registro en la base de datos (solo marcar como registrado)
    const { error: updateError } = await supabase
      .from(tabla)
      .update({
        estaRegistrado: true,
        updated_at: new Date().toISOString()
      })
      .eq('cedula', parseInt(identificacion))

    if (updateError) {
      console.error('Error actualizando registro:', updateError)
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
