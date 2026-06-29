import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('dev-auth')?.value

    if (sessionToken) {
      // Desactivar sesión en la base de datos
      await supabaseAdmin
        .from('dev_sessions')
        .update({ is_active: false })
        .eq('session_token', sessionToken)
    }

    // Crear respuesta y eliminar cookies usando Set-Cookie headers
    const response = NextResponse.json({ 
      success: true, 
      message: 'Sesión cerrada exitosamente' 
    })

    // Eliminar cookies - DEBEN coincidir exactamente con los atributos usados al crearlas
    // Las cookies fueron creadas con path: '/' y sameSite: 'strict'
    response.cookies.set('dev-auth', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    })
    
    response.cookies.set('dev-admin-id', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    })
    
    response.cookies.set('dev-admin-name', '', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    })

    return response

  } catch (error) {
    console.error('Error al cerrar sesión:', error)
    return NextResponse.json(
      { success: false, error: 'Error al cerrar sesión' },
      { status: 500 }
    )
  }
}
