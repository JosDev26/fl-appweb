import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkCasoAccess } from '@/lib/auth-helpers'
import { checkStandardRateLimit } from '@/lib/rate-limit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limiting
    const rateLimitResponse = await checkStandardRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const { id: casoId } = await params

    // IDOR Protection: Validate user has access to this caso using server-side session
    const accessCheck = await checkCasoAccess(request, casoId)
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status }
      )
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
      { error: 'Error al obtener trabajos' },
      { status: 500 }
    )
  }
}
