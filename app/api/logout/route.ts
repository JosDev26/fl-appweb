import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Obtener token de las cookies
    const accessToken = request.cookies.get('sb-access-token')?.value

    if (accessToken) {
      // Cerrar sesión en Supabase
      await supabaseClient.auth.signOut()
    }

    // Crear respuesta y eliminar cookies
    const response = NextResponse.json({ success: true })

    response.cookies.delete('sb-access-token')
    response.cookies.delete('sb-refresh-token')

    return response

  } catch (error) {
    console.error('Error en logout:', error)
    return NextResponse.json(
      { error: 'Error cerrando sesión' },
      { status: 500 }
    )
  }
}
