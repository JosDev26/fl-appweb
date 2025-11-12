import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: casoId } = await params

    // Verificar si se proporcionó un id_cliente para validar acceso (opcional)
    const searchParams = request.nextUrl.searchParams
    const requestIdCliente = searchParams.get('id_cliente')

    // Si se proporciona id_cliente, verificar que el caso pertenezca a ese cliente
    if (requestIdCliente) {
      const { data: caso, error: casoError } = await supabase
        .from('casos')
        .select('id_cliente')
        .eq('id', casoId)
        .single()

      if (casoError) throw casoError

      if (caso && caso.id_cliente !== requestIdCliente) {
        return NextResponse.json(
          { error: 'No tienes permiso para acceder a los trabajos de este caso' },
          { status: 403 }
        )
      }
    }

    // Obtener trabajos del caso
    const { data: trabajos, error } = await supabase
      .from('trabajos_por_hora')
      .select('*')
      .eq('caso_asignado', casoId)
      .order('fecha', { ascending: false })

    if (error) throw error

    return NextResponse.json({ trabajos: trabajos || [] })

  } catch (error) {
    console.error('Error al obtener trabajos del caso:', error)
    return NextResponse.json(
      { 
        error: 'Error al obtener trabajos',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
