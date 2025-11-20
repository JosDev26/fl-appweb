import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET - Obtener comprobantes rechazados del usuario
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Usuario no autenticado' },
        { status: 401 }
      )
    }

    // Obtener comprobantes rechazados del usuario
    const { data: rejectedReceipts, error } = await supabase
      .from('payment_receipts' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('estado', 'rechazado')
      .order('reviewed_at', { ascending: false })
      .limit(5)

    if (error) {
      console.error('Error fetching rejected receipts:', error)
      return NextResponse.json(
        { error: 'Error al obtener comprobantes rechazados' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      rejectedReceipts: rejectedReceipts || []
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Error inesperado' },
      { status: 500 }
    )
  }
}
