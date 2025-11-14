import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: solicitudId } = await params

    console.log(`📋 Buscando solicitud: ${solicitudId}`)

    const { data: solicitud, error } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('id', solicitudId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Solicitud no encontrada' },
          { status: 404 }
        )
      }
      throw error
    }

    console.log(`✅ Solicitud encontrada`)

    return NextResponse.json({ solicitud })

  } catch (error) {
    console.error('❌ Error al obtener solicitud:', error)
    return NextResponse.json(
      {
        error: 'Error al obtener solicitud',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
