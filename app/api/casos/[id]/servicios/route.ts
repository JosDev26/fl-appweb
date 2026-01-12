import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkStandardRateLimit } from '@/lib/rate-limit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { id: casoId } = await params

    if (!casoId) {
      return NextResponse.json(
        { error: 'ID de caso requerido' },
        { status: 400 }
      )
    }

    // Obtener servicios profesionales del caso
    const { data: servicios, error } = await supabase
      .from('servicios_profesionales' as any)
      .select(`
        id,
        id_caso,
        id_servicio,
        fecha,
        costo,
        gastos,
        iva,
        total,
        estado_pago,
        funcionarios:id_responsable (nombre),
        lista_servicios:id_servicio (titulo)
      `)
      .eq('id_caso', casoId)
      .order('fecha', { ascending: false })

    if (error) {
      console.error('Error al obtener servicios del caso:', error)
      return NextResponse.json(
        { error: 'Error al obtener servicios' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      servicios: servicios || []
    })

  } catch (error) {
    console.error('Error en GET /api/casos/[id]/servicios:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
