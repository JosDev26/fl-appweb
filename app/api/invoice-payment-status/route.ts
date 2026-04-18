import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Marcar factura como pagada
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mesFactura, clientId, clientType, fechaPago } = body

    if (!mesFactura || !clientId || !clientType) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos' },
        { status: 400 }
      )
    }

    // Actualizar estado del plazo de pago
    const { data, error } = await supabase
      .from('invoice_payment_deadlines')
      .update({
        estado_pago: 'pagado',
        fecha_pago: fechaPago || new Date().toISOString()
      })
      .eq('mes_factura', mesFactura)
      .eq('client_id', clientId)
      .eq('client_type', clientType)
      .select()

    if (error) {
      console.error('Error al actualizar estado de pago:', error)
      return NextResponse.json(
        { error: 'Error al actualizar estado de pago' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Estado de pago actualizado exitosamente',
      data: data?.[0]
    })

  } catch (error) {
    console.error('Error en POST /api/invoice-payment-status:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// Obtener plazos de pago
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const clientType = searchParams.get('clientType')
    const estado = searchParams.get('estado')
    const getAllPending = searchParams.get('getAllPending') === 'true'

    let query = supabase.from('invoice_payment_deadlines').select('*')

    // Si se solicitan todos los pendientes
    if (getAllPending) {
      query = query.eq('estado_pago', 'pendiente')
      
      const { data, error } = await query.order('mes_factura', { ascending: false })

      if (error) {
        console.error('Error al obtener plazos pendientes:', error)
        return NextResponse.json(
          { error: 'Error al obtener plazos' },
          { status: 500 }
        )
      }

      // Enriquecer con información del cliente
      const enrichedData = await Promise.all(
        (data || []).map(async (deadline) => {
          let clientInfo = null
          
          if (deadline.client_type === 'cliente') {
            const { data: cliente } = await supabase
              .from('usuarios')
              .select('nombre, cedula')
              .eq('id', deadline.client_id)
              .single()
            clientInfo = cliente
          } else {
            const { data: empresa } = await supabase
              .from('empresas')
              .select('nombre, cedula')
              .eq('id', deadline.client_id)
              .single()
            clientInfo = empresa
          }

          return {
            ...deadline,
            clientName: clientInfo?.nombre || 'Desconocido',
            clientCedula: clientInfo?.cedula || 'N/A'
          }
        })
      )

      return NextResponse.json({
        success: true,
        deadlines: enrichedData,
        count: enrichedData.length
      })
    }

    // Si se filtra por cliente
    if (clientId && clientType) {
      query = query
        .eq('client_id', clientId)
        .eq('client_type', clientType)
    }

    // Si se filtra por estado
    if (estado) {
      query = query.eq('estado_pago', estado)
    }

    const { data, error } = await query.order('mes_factura', { ascending: false })

    if (error) {
      console.error('Error al obtener plazos:', error)
      return NextResponse.json(
        { error: 'Error al obtener plazos' },
        { status: 500 }
      )
    }

    // Enriquecer deadlines editados con el motivo del último cambio
    const enrichedDeadlines = await Promise.all(
      (data || []).map(async (deadline) => {
        if (deadline.editada) {
          const { data: lastVersion } = await supabase
            .from('invoice_versions')
            .select('reason, created_at')
            .eq('invoice_deadline_id', deadline.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          return {
            ...deadline,
            motivo_cambio: lastVersion?.reason || null
          }
        }
        return { ...deadline, motivo_cambio: null }
      })
    )

    return NextResponse.json({
      success: true,
      deadlines: enrichedDeadlines
    })

  } catch (error) {
    console.error('Error en GET /api/invoice-payment-status:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// Actualizar nota de factura
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { mesFactura, clientId, clientType, nota } = body

    if (!mesFactura || !clientId || !clientType) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos' },
        { status: 400 }
      )
    }

    if (nota === undefined) {
      return NextResponse.json(
        { error: 'No hay datos para actualizar' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('invoice_payment_deadlines')
      .update({ nota })
      .eq('mes_factura', mesFactura)
      .eq('client_id', clientId)
      .eq('client_type', clientType)
      .select()

    if (error) {
      console.error('Error al actualizar nota:', error)
      return NextResponse.json(
        { error: 'Error al actualizar plazo' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Nota actualizada exitosamente',
      data: data?.[0]
    })

  } catch (error) {
    console.error('Error en PUT /api/invoice-payment-status:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
