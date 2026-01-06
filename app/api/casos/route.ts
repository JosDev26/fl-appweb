import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkStandardRateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const id_cliente = searchParams.get('id_cliente')

    if (!id_cliente) {
      return NextResponse.json(
        { error: 'ID de cliente requerido' },
        { status: 400 }
      )
    }

    // Buscar casos directamente usando el campo id_cliente de la tabla casos
    const { data: casos, error } = await supabase
      .from('casos')
      .select('*')
      .eq('id_cliente', id_cliente)
    
    if (error) throw error

    return NextResponse.json({ casos: casos || [] })

  } catch (error) {
    console.error('Error al obtener casos:', error)
    return NextResponse.json(
      { error: 'Error al obtener casos' },
      { status: 500 }
    )
  }
}
