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

    // Obtener información del caso
    const { data: caso, error } = await supabase
      .from('casos')
      .select('*')
      .eq('id', casoId)
      .single()

    if (error) throw error

    // Si no se encuentra el caso
    if (!caso) {
      return NextResponse.json(
        { error: 'Caso no encontrado' },
        { status: 404 }
      )
    }

    // Si se proporciona id_cliente, verificar que coincida
    if (requestIdCliente && caso.id_cliente !== requestIdCliente) {
      return NextResponse.json(
        { error: 'No tienes permiso para acceder a este caso' },
        { status: 403 }
      )
    }

    return NextResponse.json({ caso })

  } catch (error) {
    console.error('Error al obtener caso:', error)
    return NextResponse.json(
      { 
        error: 'Error al obtener caso',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
