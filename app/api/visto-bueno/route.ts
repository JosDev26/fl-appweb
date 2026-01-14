import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkStandardRateLimit } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const isDev = process.env.NODE_ENV === 'development'

// Dar visto bueno a las horas del mes
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

    // Insertar o actualizar el visto bueno para el cliente principal
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
        { error: 'Error al registrar visto bueno' },
        { status: 500 }
      )
    }

    // Si es empresa, verificar si es principal de un grupo y dar visto bueno a las demás
    let empresasGrupoActualizadas = 0
    if (tipoCliente === 'empresa') {
      try {
        // Buscar si esta empresa es principal de algún grupo
        const { data: grupo, error: grupoError } = await supabase
          .from('grupos_empresas' as any)
          .select('id, nombre')
          .eq('empresa_principal_id', userId)
          .maybeSingle()

        if (!grupoError && grupo) {
          if (isDev) console.log('🏢 Empresa es principal del grupo:', (grupo as any).nombre)
          
          // Obtener las empresas miembros del grupo
          const { data: miembros, error: miembrosError } = await supabase
            .from('grupos_empresas_miembros' as any)
            .select('empresa_id')
            .eq('grupo_id', (grupo as any).id)

          if (!miembrosError && miembros && miembros.length > 0) {
            const empresaIds = (miembros as any[]).map((m: any) => m.empresa_id)
            if (isDev) console.log('🏢 Dando visto bueno a empresas asociadas:', empresaIds)

            // Dar visto bueno a todas las empresas del grupo
            for (const empresaId of empresaIds) {
              const { error: vbError } = await supabase
                .from('visto_bueno_mensual')
                .upsert({
                  client_id: empresaId,
                  client_type: 'empresa',
                  mes: mes,
                  dado: true,
                  fecha_visto_bueno: fechaVistoBueno
                }, {
                  onConflict: 'client_id,client_type,mes'
                })

              if (vbError) {
                if (isDev) console.error(`❌ Error al dar visto bueno a empresa ${empresaId}:`, vbError)
              } else {
                empresasGrupoActualizadas++
                if (isDev) console.log(`✅ Visto bueno dado a empresa ${empresaId}`)
              }
            }
          }
        }
      } catch (grupoError) {
        // No fallar si hay error con grupos, ya se dio visto bueno al principal
        if (isDev) console.error('Error procesando grupo de empresas:', grupoError)
      }
    }

    return NextResponse.json({
      success: true,
      message: empresasGrupoActualizadas > 0 
        ? `Visto bueno registrado para ti y ${empresasGrupoActualizadas} empresas del grupo`
        : 'Visto bueno registrado exitosamente',
      data: data?.[0],
      empresasGrupoActualizadas
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
