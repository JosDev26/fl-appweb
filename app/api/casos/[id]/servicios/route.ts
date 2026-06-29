import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkStandardRateLimit } from '@/lib/rate-limit'
import { verifyDevAdminSession } from '@/lib/auth-utils'

const isDev = process.env.NODE_ENV === 'development'
// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  // Authentication: Verify dev admin session
  const authResult = await verifyDevAdminSession(request)
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    )
  }

  try {
    const { id: casoId } = await params

    // Validate casoId exists
    if (!casoId) {
      return NextResponse.json(
        { error: 'ID de caso requerido' },
        { status: 400 }
      )
    }

    // Validate casoId is a valid UUID format
    if (!isValidUUID(casoId)) {
      return NextResponse.json(
        { error: 'ID de caso inválido' },
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
      if (isDev) {
        console.error('Error al obtener servicios del caso:', error)
      } else {
        console.error('Error al obtener servicios del caso:', error?.message || 'Unknown error')
      }
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
    if (isDev) {
      console.error('Error en GET /api/casos/[id]/servicios:', error)
    } else {
      console.error('Error en GET /api/casos/[id]/servicios:', error instanceof Error ? error.message : 'Unknown error')
    }
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
