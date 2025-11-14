import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id_cliente = searchParams.get('id_cliente')

    if (!id_cliente) {
      return NextResponse.json(
        { error: 'id_cliente es requerido' },
        { status: 400 }
      )
    }

    console.log(`📋 Buscando solicitudes para cliente: ${id_cliente}`)

    // Buscar solicitudes del cliente
    const { data: solicitudes, error } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('id_cliente', id_cliente)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error al buscar solicitudes:', error)
      throw error
    }

    console.log(`✅ Encontradas ${solicitudes?.length || 0} solicitudes`)

    return NextResponse.json({
      solicitudes: solicitudes || [],
      count: solicitudes?.length || 0
    })

  } catch (error) {
    console.error('❌ Error en API de solicitudes:', error)
    return NextResponse.json(
      { 
        error: 'Error al obtener solicitudes',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
