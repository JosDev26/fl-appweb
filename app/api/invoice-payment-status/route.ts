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
      const today = new Date().toISOString().split('T')[0]
      
      // Primero actualizar vencidos
      await supabase
        .from('invoice_payment_deadlines')
        .update({ estado_pago: 'vencido' })
        .eq('estado_pago', 'pendiente')
        .lt('fecha_vencimiento', today)

      // Luego obtener todos los pendientes y vencidos
      query = query.in('estado_pago', ['pendiente', 'vencido'])
      
      const { data, error } = await query.order('fecha_vencimiento', { ascending: true })

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

          // Calcular días restantes
          const today = new Date()
          const vencimiento = new Date(deadline.fecha_vencimiento)
          const diasRestantes = Math.ceil((vencimiento.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

          return {
            ...deadline,
            clientName: clientInfo?.nombre || 'Desconocido',
            clientCedula: clientInfo?.cedula || 'N/A',
            diasRestantes
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

    const { data, error } = await query.order('fecha_vencimiento', { ascending: false })

    if (error) {
      console.error('Error al obtener plazos:', error)
      return NextResponse.json(
        { error: 'Error al obtener plazos' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      deadlines: data || []
    })

  } catch (error) {
    console.error('Error en GET /api/invoice-payment-status:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// Actualizar configuración de plazo
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { mesFactura, clientId, clientType, diasPlazo, nota } = body

    if (!mesFactura || !clientId || !clientType) {
      return NextResponse.json(
        { error: 'Faltan parámetros requeridos' },
        { status: 400 }
      )
    }

    const updateData: any = {}
    
    if (diasPlazo !== undefined) {
      // Recalcular fecha de vencimiento
      const { data: deadline } = await supabase
        .from('invoice_payment_deadlines')
        .select('fecha_emision')
        .eq('mes_factura', mesFactura)
        .eq('client_id', clientId)
        .eq('client_type', clientType)
        .single()

      if (deadline) {
        const nuevaFechaVencimiento = new Date(deadline.fecha_emision)
        nuevaFechaVencimiento.setDate(nuevaFechaVencimiento.getDate() + parseInt(diasPlazo))
        
        updateData.dias_plazo = parseInt(diasPlazo)
        updateData.fecha_vencimiento = nuevaFechaVencimiento.toISOString().split('T')[0]
      }
    }

    if (nota !== undefined) {
      updateData.nota = nota
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No hay datos para actualizar' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('invoice_payment_deadlines')
      .update(updateData)
      .eq('mes_factura', mesFactura)
      .eq('client_id', clientId)
      .eq('client_type', clientType)
      .select()

    if (error) {
      console.error('Error al actualizar plazo:', error)
      return NextResponse.json(
        { error: 'Error al actualizar plazo' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Plazo actualizado exitosamente',
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
