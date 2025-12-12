import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: casoId } = await params
    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get('clienteId')
    const tipoCliente = searchParams.get('tipoCliente') || 'cliente'

    // Obtener gastos del caso desde Supabase con el nombre del responsable
    const { data: gastos, error } = await supabase
      .from('gastos' as any)
      .select(`
        *,
        funcionarios:id_responsable (
          nombre
        )
      `)
      .eq('id_caso', casoId)
      .order('fecha', { ascending: false })

    if (error) {
      console.error('Error al obtener gastos:', error)
      return NextResponse.json(
        { error: 'Error al obtener gastos' },
        { status: 500 }
      )
    }

    // Si se proporciona clienteId, obtener información de pago por mes
    let comprobantesAprobados: Record<string, boolean> = {}
    let modoPagoActivo = false

    if (clienteId) {
      // Obtener comprobantes aprobados del cliente
      const { data: receipts } = await supabase
        .from('payment_receipts' as any)
        .select('mes_pago, estado')
        .eq('user_id', clienteId)
        .eq('tipo_cliente', tipoCliente)
        .eq('estado', 'aprobado')

      if (receipts) {
        receipts.forEach((r: any) => {
          comprobantesAprobados[r.mes_pago] = true
        })
      }

      // Verificar si el cliente tiene modoPago activo
      const table = tipoCliente === 'empresa' ? 'empresas' : 'usuarios'
      const { data: cliente } = await supabase
        .from(table)
        .select('modoPago')
        .eq('id', clienteId)
        .single()

      modoPagoActivo = cliente?.modoPago || false
    }

    // Agregar estado de pago a cada gasto
    // Usamos la columna estado_pago de la BD si existe, sino calculamos dinámicamente
    const gastosConEstado = (gastos || []).map((gasto: any) => {
      // Si ya tiene estado_pago en la BD, usarlo directamente
      if (gasto.estado_pago && gasto.estado_pago !== 'pendiente') {
        return {
          ...gasto,
          mes_gasto: gasto.fecha ? `${new Date(gasto.fecha).getFullYear()}-${String(new Date(gasto.fecha).getMonth() + 1).padStart(2, '0')}` : null
        }
      }
      
      // Fallback: calcular dinámicamente basado en comprobantes aprobados
      const fechaGasto = gasto.fecha ? new Date(gasto.fecha) : null
      const mesGasto = fechaGasto ? `${fechaGasto.getFullYear()}-${String(fechaGasto.getMonth() + 1).padStart(2, '0')}` : null
      
      const now = new Date()
      const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      
      let estadoPago: 'pagado' | 'pendiente_mes_actual' | 'pendiente_anterior' = 'pendiente_mes_actual'
      
      if (mesGasto && comprobantesAprobados[mesGasto]) {
        estadoPago = 'pagado'
      } else if (mesGasto && mesGasto < mesActual) {
        estadoPago = 'pendiente_anterior'
      } else {
        estadoPago = 'pendiente_mes_actual'
      }

      return {
        ...gasto,
        mes_gasto: mesGasto,
        estado_pago: estadoPago
      }
    })

    return NextResponse.json({
      gastos: gastosConEstado,
      modoPagoActivo
    })

  } catch (error) {
    console.error('Error en GET /api/casos/[id]/gastos:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
