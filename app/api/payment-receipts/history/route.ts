import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    const userType = request.headers.get('x-user-type') // 'cliente' o 'empresa'

    if (!userId || !userType) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      )
    }

    // Obtener los comprobantes del usuario
    const { data: comprobantes, error } = await supabase
      .from('payment_receipts' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('tipo_cliente', userType)
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('Error al obtener comprobantes:', error)
      return NextResponse.json(
        { error: 'Error al obtener comprobantes' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      comprobantes: comprobantes || []
    })

  } catch (error) {
    console.error('Error en history endpoint:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
