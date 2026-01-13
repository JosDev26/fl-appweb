import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyDevAdminSession } from '@/lib/auth-utils'
import { checkStandardRateLimit } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================================
// POST: Forzar aprobación de visto bueno (admin override)
// ============================================================================

export async function POST(request: NextRequest) {
  // Rate limiting: 50 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    // Verificar autenticación de admin
    const authResult = await verifyDevAdminSession(request)
    if (!authResult.valid) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { clientId, clientType, mes } = body

    // Validar campos requeridos
    if (!clientId || !clientType || !mes) {
      return NextResponse.json(
        { error: 'clientId, clientType y mes son requeridos' },
        { status: 400 }
      )
    }

    // Validar clientType
    if (!['cliente', 'empresa'].includes(clientType)) {
      return NextResponse.json(
        { error: 'clientType debe ser "cliente" o "empresa"' },
        { status: 400 }
      )
    }

    // Validar formato de mes
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return NextResponse.json(
        { error: 'Formato de mes inválido. Use YYYY-MM' },
        { status: 400 }
      )
    }

    // Validar formato de clientId
    if (clientId.length > 50 || !/^[a-zA-Z0-9-_]+$/.test(clientId)) {
      return NextResponse.json(
        { error: 'ID de cliente inválido' },
        { status: 400 }
      )
    }

    // Verificar si existe un archivo de rechazo que debemos eliminar
    // Note: Using 'as any' because visto_bueno_mensual is not in generated Supabase types yet
    const { data: existingRecord } = await (supabase as any)
      .from('visto_bueno_mensual')
      .select('archivo_rechazo_path')
      .eq('client_id', clientId)
      .eq('client_type', clientType)
      .eq('mes', mes)
      .maybeSingle()

    // Si había un archivo de rechazo, eliminarlo del storage
    if (existingRecord?.archivo_rechazo_path) {
      await supabase
        .storage
        .from('visto-bueno-rechazos')
        .remove([existingRecord.archivo_rechazo_path])
    }

    // Forzar aprobación
    const { data, error } = await (supabase as any)
      .from('visto_bueno_mensual')
      .upsert({
        client_id: clientId,
        client_type: clientType,
        mes: mes,
        estado: 'aprobado',
        dado: true,
        fecha_visto_bueno: new Date().toISOString(),
        // Limpiar datos de rechazo
        motivo_rechazo: null,
        archivo_rechazo_path: null,
        fecha_rechazo: null
      }, {
        onConflict: 'client_id,client_type,mes'
      })
      .select()
      .single()

    if (error) {
      console.error('Error al forzar aprobación:', error)
      return NextResponse.json(
        { error: 'Error al forzar aprobación' },
        { status: 500 }
      )
    }

    // Log de auditoría
    console.log(`[ADMIN_FORCE_APPROVE] Admin ${authResult.adminId} forzó aprobación para ${clientType}:${clientId} mes ${mes}`)

    return NextResponse.json({
      success: true,
      message: 'Aprobación forzada exitosamente',
      data: {
        id: data?.id,
        clientId,
        clientType,
        mes,
        estado: 'aprobado',
        fechaVistoBueno: data?.fecha_visto_bueno
      }
    })

  } catch (error) {
    console.error('Error en POST /api/visto-bueno/admin/forzar:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
