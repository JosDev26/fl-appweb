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

    // Enriquecer con motivo_cambio para comprobantes editados
    const enriched = await Promise.all(
      (comprobantes || []).map(async (c: any) => {
        if (c.editada) {
          const { data: version } = await supabase
            .from('comprobante_versions' as any)
            .select('reason')
            .eq('receipt_id', c.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          return { ...c, motivo_cambio: (version as any)?.reason || null }
        }
        return { ...c, motivo_cambio: null }
      })
    )

    return NextResponse.json({
      success: true,
      comprobantes: enriched
    })

  } catch (error) {
    console.error('Error en history endpoint:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
