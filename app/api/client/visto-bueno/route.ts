import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Actualizar darVistoBueno de un cliente o empresa
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { clientId, clientType, darVistoBueno } = body

    if (!clientId || !clientType) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos' },
        { status: 400 }
      )
    }

    if (!['cliente', 'empresa'].includes(clientType)) {
      return NextResponse.json(
        { error: 'Tipo de cliente inválido' },
        { status: 400 }
      )
    }

    if (typeof darVistoBueno !== 'boolean') {
      return NextResponse.json(
        { error: 'darVistoBueno debe ser boolean' },
        { status: 400 }
      )
    }

    // Determinar tabla
    const tabla = clientType === 'empresa' ? 'empresas' : 'usuarios'

    // Actualizar
    const { error } = await supabase
      .from(tabla as any)
      .update({ darVistoBueno })
      .eq('id', clientId)

    if (error) {
      console.error('Error al actualizar darVistoBueno:', error)
      return NextResponse.json(
        { error: 'Error al actualizar' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Visto bueno actualizado exitosamente'
    })

  } catch (error) {
    console.error('Error en PUT /api/client/visto-bueno:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
