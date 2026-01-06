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

    // Obtener información del caso con el nombre de la materia
    const { data: caso, error } = await supabase
      .from('casos')
      .select(`
        *,
        materias:materia (
          nombre
        )
      `)
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

    return NextResponse.json({ caso })

  } catch (error) {
    console.error('Error al obtener caso:', error)
    return NextResponse.json(
      { error: 'Error al obtener caso' },
      { status: 500 }
    )
  }
}
