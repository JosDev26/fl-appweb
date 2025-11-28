import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET - Obtener estado del último comprobante del usuario
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

    // Obtener el comprobante más reciente del usuario
    const { data: lastReceipt, error } = await supabase
      .from('payment_receipts' as any)
      .select('*')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      console.error('Error fetching payment status:', error)
      return NextResponse.json(
        { error: 'Error al obtener estado de pago' },
        { status: 500 }
      )
    }

    // Si no hay comprobantes, retornar null
    if (!lastReceipt) {
      return NextResponse.json({
        success: true,
        lastReceipt: null
      })
    }

    return NextResponse.json({
      success: true,
      lastReceipt: {
        id: (lastReceipt as any).id,
        estado: (lastReceipt as any).estado,
        nota_revision: (lastReceipt as any).nota_revision,
        monto_declarado: (lastReceipt as any).monto_declarado,
        mes_pago: (lastReceipt as any).mes_pago,
        uploaded_at: (lastReceipt as any).uploaded_at,
        reviewed_at: (lastReceipt as any).reviewed_at
      }
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Error inesperado' },
      { status: 500 }
    )
  }
}
