import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: solicitudId } = await params

    // Obtenemos los gastos asociados directamente al id de la solicitud
    const { data: gastos, error: gastosError } = await supabase
      .from('gastos' as any)
      .select(`
        *,
        funcionarios:id_responsable (
          nombre
        )
      `)
      .eq('id_caso', solicitudId)
      .order('fecha', { ascending: false })

    if (gastosError) {
      console.error('Error al obtener gastos:', gastosError)
      return NextResponse.json(
        { error: 'Error al obtener gastos' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      gastos: gastos || []
    })

  } catch (error) {
    console.error('❌ Error al obtener gastos de solicitud:', error)
    return NextResponse.json(
      {
        error: 'Error al obtener gastos',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
