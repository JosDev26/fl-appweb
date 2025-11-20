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
      const { error: updateReceiptError } = await supabase
        .from('payment_receipts' as any)
        .update({
          estado: 'aprobado',
          reviewed_at: new Date().toISOString(),
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
