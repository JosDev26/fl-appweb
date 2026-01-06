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

    console.log(`📋 Buscando actualizaciones para solicitud: ${solicitudId}`)

    // IDOR Protection: Validate user has access to this solicitud
    const accessCheck = await checkSolicitudAccess(request, solicitudId)
    if (!accessCheck.authorized) {
      return NextResponse.json(
        { error: accessCheck.error },
        { status: accessCheck.status }
      )
    }

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
      { error: 'Error al obtener actualizaciones' },
      { status: 500 }
    )
  }
}
