import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET - Obtener todos los comprobantes pendientes y usuarios con modoPago=true
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Obtener comprobantes
    const { data: receipts, error: receiptsError } = await supabase
      .from('payment_receipts' as any)
      .select('*')
      .order('uploaded_at', { ascending: false })

    console.log('Receipts query result:', { receipts, receiptsError })

    // 2. Obtener usuarios con modoPago = true
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuarios')
      .select('id, nombre, cedula, correo, modoPago')
      .eq('modoPago', true)

    console.log('Usuarios query result:', { count: usuarios?.length, usuariosError })

    // 3. Obtener empresas con modoPago = true  
    const { data: empresas, error: empresasError } = await supabase
      .from('empresas')
      .select('id, nombre, cedula, correo, modoPago')
      .eq('modoPago', true)

    console.log('Empresas query result:', { count: empresas?.length, empresasError })

    // 4. Combinar datos
    const clientesConModoPago = [
      ...((usuarios as any[]) || []).map(u => ({ ...u, tipo: 'cliente' as const })),
      ...((empresas as any[]) || []).map(e => ({ ...e, tipo: 'empresa' as const }))
    ]

    return NextResponse.json({
      success: true,
      data: {
        receipts: receipts || [],
        clientesConModoPago
      }
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Error inesperado' },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Aprobar o rechazar un comprobante
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { receiptId, action, nota } = body

    if (!receiptId || !action) {
      return NextResponse.json(
        { error: 'receiptId y action son requeridos' },
        { status: 400 }
      )
    }

    if (!['aprobar', 'rechazar'].includes(action)) {
      return NextResponse.json(
        { error: 'action debe ser "aprobar" o "rechazar"' },
        { status: 400 }
      )
    }

    // 1. Obtener el comprobante
    const { data: receipt, error: fetchError } = await supabase
      .from('payment_receipts' as any)
      .select('*')
      .eq('id', receiptId)
      .single()

    if (fetchError || !receipt) {
      return NextResponse.json(
        { error: 'Comprobante no encontrado' },
        { status: 404 }
      )
    }

    const userId = (receipt as any).user_id
    const tipoCliente = (receipt as any).tipo_cliente

    if (action === 'aprobar') {
      // Aprobar: Actualizar estado y desactivar modoPago
      const fechaAprobacion = new Date().toISOString()
      const { error: updateReceiptError } = await supabase
        .from('payment_receipts' as any)
        .update({
          estado: 'aprobado',
          reviewed_at: fechaAprobacion,
          nota_revision: nota || null
        })
        .eq('id', receiptId)

      if (updateReceiptError) {
        console.error('Error updating receipt:', updateReceiptError)
        return NextResponse.json(
          { error: 'Error al actualizar comprobante' },
          { status: 500 }
        )
      }

      // Desactivar modoPago
      const tabla = tipoCliente === 'empresa' ? 'empresas' : 'usuarios'
      const { error: updateModoPagoError } = await supabase
        .from(tabla as any)
        .update({ modoPago: false } as any)
        .eq('id', userId)

      if (updateModoPagoError) {
        console.error('Error updating modo_pago:', updateModoPagoError)
        return NextResponse.json(
          { error: 'Error al desactivar modo pago' },
          { status: 500 }
        )
      }

      // Actualizar solicitudes con modalidad mensual
      // IMPORTANTE: Los gastos NO se incluyen en monto_pagado
      console.log('💰 Actualizando solicitudes mensualidades del cliente:', userId)
      try {
        const { data: solicitudesMensuales, error: solicitudesError } = await supabase
          .from('solicitudes')
          .select('*')
          .eq('id_cliente', userId)
          .ilike('modalidad_pago', 'mensualidad')

        if (solicitudesError) {
          console.error('❌ Error al obtener solicitudes:', solicitudesError)
        } else if (solicitudesMensuales && solicitudesMensuales.length > 0) {
          console.log(`📋 Encontradas ${solicitudesMensuales.length} solicitudes mensualidades`)
          
          for (const solicitud of solicitudesMensuales) {
            // Calcular pago realizado SOLO de la cuota (SIN gastos)
            const montoCuota = solicitud.monto_por_cuota || 0
            
            // El pago realizado es solo el monto de la cuota
            // Los gastos se pagan aparte y NO se suman a monto_pagado
            const pagoRealizado = montoCuota
            const nuevoMontoPagado = (solicitud.monto_pagado || 0) + pagoRealizado
            
            // El total_a_pagar debe ser costo_neto + IVA (sin gastos)
            const costoNeto = solicitud.costo_neto || 0
            let iva = 0
            if (solicitud.se_cobra_iva) {
              iva = solicitud.monto_iva || (costoNeto * 0.13)
            }
            const totalAPagar = costoNeto + iva
            const nuevoSaldoPendiente = Math.max(0, totalAPagar - nuevoMontoPagado)
            
            // Actualizar la solicitud
            const { error: updateError } = await supabase
              .from('solicitudes')
              .update({
                monto_pagado: nuevoMontoPagado,
                saldo_pendiente: nuevoSaldoPendiente,
                updated_at: fechaAprobacion
              })
              .eq('id', solicitud.id)
            
            if (updateError) {
              console.error(`❌ Error al actualizar solicitud ${solicitud.id}:`, updateError)
            } else {
              console.log(`✅ Solicitud ${solicitud.id} actualizada:`, {
                titulo: solicitud.titulo,
                montoCuota,
                pagoRealizado,
                nuevoMontoPagado,
                totalAPagar,
                nuevoSaldoPendiente,
                nota: 'Gastos NO incluidos en monto_pagado'
              })
            }
          }
        } else {
          console.log('ℹ️ No se encontraron solicitudes mensualidades para actualizar')
        }
      } catch (err) {
        console.error('❌ Error al actualizar solicitudes:', err)
      }

      // Marcar factura como pagada directamente en la base de datos
      const mesPago = (receipt as any).mes_pago
      console.log('🔍 Intentando actualizar factura con mes_pago:', mesPago, 'userId:', userId, 'tipoCliente:', tipoCliente)
      
      if (mesPago) {
        try {
          // Primero verificar si existe el registro
          const { data: existingDeadline, error: checkError } = await supabase
            .from('invoice_payment_deadlines' as any)
            .select('*')
            .eq('mes_factura', mesPago)
            .eq('client_id', userId)
            .eq('client_type', tipoCliente)
            .single()

          console.log('🔍 Búsqueda de factura existente:', { 
            encontrada: !!existingDeadline, 
            error: checkError?.message,
            datos: existingDeadline 
          })

          if (existingDeadline) {
            const { error: invoiceError } = await supabase
              .from('invoice_payment_deadlines' as any)
              .update({
                estado_pago: 'pagado',
                fecha_pago: fechaAprobacion
              })
              .eq('mes_factura', mesPago)
              .eq('client_id', userId)
              .eq('client_type', tipoCliente)

            if (invoiceError) {
              console.error('❌ Error al actualizar estado de factura:', invoiceError)
            } else {
              console.log('✅ Estado de factura actualizado a pagado:', { mesPago, userId, tipoCliente })
            }
          } else {
            console.warn('⚠️ No se encontró factura para actualizar. Posibles causas:', {
              mesPago,
              userId,
              tipoCliente,
              checkError: checkError?.message
            })
          }
        } catch (err) {
          console.error('❌ Error al actualizar estado de factura:', err)
        }
      } else {
        console.warn('⚠️ El comprobante no tiene mes_pago asociado')
      }

      return NextResponse.json({
        success: true,
        message: 'Comprobante aprobado y modo pago desactivado'
      })

    } else {
      // Rechazar: Actualizar estado con nota
      if (!nota) {
        return NextResponse.json(
          { error: 'La nota de rechazo es requerida' },
          { status: 400 }
        )
      }

      console.log('Rechazando comprobante:', { receiptId, nota })

      const { error: updateReceiptError } = await supabase
        .from('payment_receipts' as any)
        .update({
          estado: 'rechazado',
          reviewed_at: new Date().toISOString(),
          nota_revision: nota
        })
        .eq('id', receiptId)

      if (updateReceiptError) {
        console.error('Error updating receipt:', updateReceiptError)
        return NextResponse.json(
          { error: 'Error al actualizar comprobante' },
          { status: 500 }
        )
      }

      console.log('Comprobante rechazado exitosamente:', receiptId)

      return NextResponse.json({
        success: true,
        message: 'Comprobante rechazado'
      })
    }

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Error inesperado' },
      { status: 500 }
    )
  }
}
