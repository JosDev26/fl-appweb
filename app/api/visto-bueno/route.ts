import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkStandardRateLimit } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================================
// POST: Dar visto bueno (aprobar) las horas del mes
// ============================================================================
export async function POST(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const userId = request.headers.get('x-user-id')
    const tipoCliente = request.headers.get('x-tipo-cliente')

    if (!userId || !tipoCliente) {
      return NextResponse.json(
        { error: 'Headers requeridos no proporcionados' },
        { status: 400 }
      )
    }

    // Validar formato de userId
    if (userId.length > 50 || !/^[a-zA-Z0-9-_]+$/.test(userId)) {
      return NextResponse.json(
        { error: 'ID de usuario inválido' },
        { status: 400 }
      )
    }

    if (!['cliente', 'empresa'].includes(tipoCliente)) {
      return NextResponse.json(
        { error: 'Tipo de cliente inválido' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { mes, fechaSimulada } = body

    if (!mes) {
      return NextResponse.json(
        { error: 'Mes es requerido' },
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

    // Usar fecha simulada si se proporciona, sino usar fecha actual
    const fechaVistoBueno = fechaSimulada || new Date().toISOString()

    // Verificar si hay un archivo de rechazo previo que debemos eliminar
    // Note: Using 'as any' because visto_bueno_mensual is not in generated Supabase types yet
    const { data: existingRecord } = await (supabase as any)
      .from('visto_bueno_mensual')
      .select('archivo_rechazo_path')
      .eq('client_id', userId)
      .eq('client_type', tipoCliente)
      .eq('mes', mes)
      .maybeSingle()

    // Si había un archivo de rechazo, eliminarlo del storage
    if (existingRecord?.archivo_rechazo_path) {
      await supabase
        .storage
        .from('visto-bueno-rechazos')
        .remove([existingRecord.archivo_rechazo_path])
    }

    // Insertar o actualizar el visto bueno
    // Al aprobar: limpiar motivo, archivo y fecha de rechazo
    const { data, error } = await (supabase as any)
      .from('visto_bueno_mensual')
      .upsert({
        client_id: userId,
        client_type: tipoCliente,
        mes: mes,
        estado: 'aprobado',
        dado: true,
        fecha_visto_bueno: fechaVistoBueno,
        // Limpiar datos de rechazo previo
        motivo_rechazo: null,
        archivo_rechazo_path: null,
        fecha_rechazo: null
      }, {
        onConflict: 'client_id,client_type,mes'
      })
      .select()

    if (error) {
      console.error('Error al dar visto bueno:', error.message, error.details, error.hint)
      return NextResponse.json(
        { error: 'Error al registrar visto bueno' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Visto bueno registrado exitosamente',
      data: data?.[0]
    })

  } catch (error) {
    console.error('Error en POST /api/visto-bueno:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// ============================================================================
// GET: Obtener estado del visto bueno del mes (incluye detalles de rechazo)
// ============================================================================
export async function GET(request: Request) {
  try {
    const userId = request.headers.get('x-user-id')
    const tipoCliente = request.headers.get('x-tipo-cliente')

    if (!userId || !tipoCliente) {
      return NextResponse.json(
        { error: 'Headers requeridos no proporcionados' },
        { status: 400 }
      )
    }

    // Validar formato de userId
    if (userId.length > 50 || !/^[a-zA-Z0-9-_]+$/.test(userId)) {
      return NextResponse.json(
        { error: 'ID de usuario inválido' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const mes = searchParams.get('mes')

    if (!mes) {
      return NextResponse.json(
        { error: 'Mes es requerido' },
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

    // Buscar el visto bueno
    // Note: Using 'as any' because visto_bueno_mensual is not in generated Supabase types yet
    const { data, error } = await (supabase as any)
      .from('visto_bueno_mensual')
      .select('*')
      .eq('client_id', userId)
      .eq('client_type', tipoCliente)
      .eq('mes', mes)
      .maybeSingle()

    if (error) {
      console.error('Error al obtener visto bueno:', error)
      return NextResponse.json(
        { error: 'Error al obtener visto bueno' },
        { status: 500 }
      )
    }

    // Si no hay registro, retornar estado pendiente
    if (!data) {
      return NextResponse.json({
        success: true,
        estado: 'pendiente',
        dado: false,
        fecha_visto_bueno: null,
        fecha_rechazo: null,
        motivo_rechazo: null,
        archivo_url: null
      })
    }

    // Generar URL firmada para archivo de rechazo si existe
    let archivoUrl: string | null = null
    if (data.archivo_rechazo_path) {
      const { data: signedUrlData } = await supabase
        .storage
        .from('visto-bueno-rechazos')
        .createSignedUrl(data.archivo_rechazo_path, 3600) // 1 hora
      
      archivoUrl = signedUrlData?.signedUrl || null
    }

    return NextResponse.json({
      success: true,
      estado: data.estado || (data.dado ? 'aprobado' : 'pendiente'),
      dado: data.dado || false,
      fecha_visto_bueno: data.fecha_visto_bueno || null,
      fecha_rechazo: data.fecha_rechazo || null,
      motivo_rechazo: data.motivo_rechazo || null,
      archivo_url: archivoUrl
    })

  } catch (error) {
    console.error('Error en GET /api/visto-bueno:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
