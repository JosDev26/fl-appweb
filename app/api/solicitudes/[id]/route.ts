import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkSolicitudAccess } from '@/lib/auth-helpers'
import { checkStandardRateLimit } from '@/lib/rate-limit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Rate limiting
    const rateLimitResponse = await checkStandardRateLimit(request)
    if (rateLimitResponse) return rateLimitResponse

    const { id: solicitudId } = await params

    console.log(`📋 Buscando solicitud: ${solicitudId}`)

    // IDOR Protection: Validate user has access to this solicitud
    const accessCheck = await checkSolicitudAccess(request, solicitudId)
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status }
      )
    }

    // Primero obtenemos la solicitud
    const { data: solicitud, error } = await supabase
      .from('solicitudes')
      .select(`
        *,
        materias:materia (
          nombre
        )
      `)
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

    // Luego obtenemos el iva_perc del cliente si existe
    let ivaPerc = null
    if (solicitud.id_cliente) {
      const { data: cliente } = await supabase
        .from('usuarios')
        .select('iva_perc')
        .eq('id', solicitud.id_cliente)
        .single()
      
      if (cliente) {
        ivaPerc = cliente.iva_perc
      }
    }

    console.log(`✅ Solicitud encontrada`)

    return NextResponse.json({ 
      solicitud: {
        ...solicitud,
        cliente: ivaPerc !== null ? { iva_perc: ivaPerc } : null
      }
    })

  } catch (error) {
    console.error('❌ Error al obtener solicitud:', error)
    return NextResponse.json(
      { error: 'Error al obtener solicitud' },
      { status: 500 }
    )
  }
}
