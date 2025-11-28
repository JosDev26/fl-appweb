import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Dar visto bueno a las horas del mes
export async function POST(request: Request) {
  try {
    const userId = request.headers.get('x-user-id')
    const tipoCliente = request.headers.get('x-tipo-cliente')

    if (!userId || !tipoCliente) {
      return NextResponse.json(
        { error: 'Headers requeridos no proporcionados' },
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

    // Usar fecha simulada si se proporciona, sino usar fecha actual
    const fechaVistoBueno = fechaSimulada || new Date().toISOString()

    // Insertar o actualizar el visto bueno
    const { data, error } = await supabase
      .from('visto_bueno_mensual')
      .upsert({
        client_id: userId,
        client_type: tipoCliente,
        mes: mes,
        dado: true,
        fecha_visto_bueno: fechaVistoBueno
      }, {
        onConflict: 'client_id,client_type,mes'
      })
      .select()

    if (error) {
      console.error('Error al dar visto bueno:', error.message, error.details, error.hint)
      return NextResponse.json(
        { error: `Error al registrar visto bueno: ${error.message}` },
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

// Obtener estado del visto bueno del mes
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

    const { searchParams } = new URL(request.url)
    const mes = searchParams.get('mes')

    if (!mes) {
      return NextResponse.json(
        { error: 'Mes es requerido' },
        { status: 400 }
      )
    }

    // Buscar el visto bueno
    const { data, error } = await supabase
      .from('visto_bueno_mensual')
      .select('*')
      .eq('client_id', userId)
      .eq('client_type', tipoCliente)
      .eq('mes', mes)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error al obtener visto bueno:', error)
      return NextResponse.json(
        { error: 'Error al obtener visto bueno' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      dado: data?.dado || false,
      fecha_visto_bueno: data?.fecha_visto_bueno || null
    })

  } catch (error) {
    console.error('Error en GET /api/visto-bueno:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
