import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: casoId } = await params

    // Obtener gastos del caso desde Supabase con el nombre del responsable
    const { data: gastos, error } = await supabase
      .from('gastos' as any)
      .select(`
        *,
        funcionarios:id_responsable (
          nombre
        )
      `)
      .eq('id_caso', casoId)
      .order('fecha', { ascending: false })

    if (error) {
      console.error('Error al obtener gastos:', error)
      return NextResponse.json(
        { error: 'Error al obtener gastos' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      gastos: gastos || []
    })

  } catch (error) {
    console.error('Error en GET /api/casos/[id]/gastos:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
