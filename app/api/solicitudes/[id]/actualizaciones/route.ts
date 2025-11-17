import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: solicitudId } = await params

    console.log(`📋 Buscando actualizaciones para solicitud: ${solicitudId}`)

    const { data: actualizaciones, error } = await supabase
      .from('actualizaciones')
      .select('*')
      .eq('id_solicitud', solicitudId)
      .order('tiempo', { ascending: false })

    if (error) {
      throw error
    }

    console.log(`✅ Se encontraron ${actualizaciones?.length || 0} actualizaciones`)

    return NextResponse.json({ actualizaciones: actualizaciones || [] })

  } catch (error) {
    console.error('❌ Error al obtener actualizaciones:', error)
    return NextResponse.json(
      {
        error: 'Error al obtener actualizaciones',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
