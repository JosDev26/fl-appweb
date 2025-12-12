import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET - Obtener gastos con filtros
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clienteId = searchParams.get('cliente') || searchParams.get('clienteId')
    const estado = searchParams.get('estado')
    const mes = searchParams.get('mes') // Formato: YYYY-MM
    const limit = parseInt(searchParams.get('limit') || '100')

    let query = supabase
      .from('gastos' as any)
      .select(`
        *,
        funcionarios:id_responsable (
          nombre
        )
      `)
      .order('fecha', { ascending: false })
      .limit(limit)

    // Filtrar por cliente
    if (clienteId) {
      query = query.eq('id_cliente', clienteId)
    }

    // Filtrar por estado (ignorar si es 'todos')
    if (estado && estado !== 'todos') {
      query = query.eq('estado_pago', estado)
    }

    // Filtrar por mes
    if (mes) {
      const [year, month] = mes.split('-')
      const startDate = `${year}-${month}-01`
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]
      query = query.gte('fecha', startDate).lte('fecha', endDate)
    }

    const { data: gastos, error } = await query

    if (error) {
      console.error('Error al obtener gastos:', error)
      return NextResponse.json(
        { error: 'Error al obtener gastos' },
        { status: 500 }
      )
    }

    // Obtener nombres de clientes
    const clienteIds = [...new Set((gastos || []).map((g: any) => g.id_cliente).filter(Boolean))]
    
    let clientesMap: Record<string, string> = {}
    if (clienteIds.length > 0) {
      // Buscar en usuarios
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', clienteIds)
      
      // Buscar en empresas
      const { data: empresas } = await supabase
        .from('empresas')
        .select('id, nombre')
        .in('id', clienteIds)
      
      usuarios?.forEach((u: any) => { clientesMap[u.id] = u.nombre })
      empresas?.forEach((e: any) => { clientesMap[e.id] = e.nombre })
    }

    // Agregar nombre de cliente a cada gasto
    const gastosConCliente = (gastos || []).map((g: any) => ({
      ...g,
      cliente_nombre: clientesMap[g.id_cliente] || 'Sin cliente'
    }))

    return NextResponse.json({
      success: true,
      gastos: gastosConCliente,
      total: gastosConCliente.length
    })

  } catch (error) {
    console.error('Error en GET /api/gastos-estado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// PATCH - Actualizar estado de pago de un gasto
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, gastoId, estado, nuevoEstado } = body
    
    // Aceptar ambos formatos de parámetros
    const actualId = id || gastoId
    const actualEstado = estado || nuevoEstado

    if (!actualId || !actualEstado) {
      return NextResponse.json(
        { error: 'id y estado son requeridos' },
        { status: 400 }
      )
    }

    const estadosValidos = ['pendiente', 'pagado', 'pendiente_mes_actual', 'pendiente_anterior']
    if (!estadosValidos.includes(actualEstado)) {
      return NextResponse.json(
        { error: `Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('gastos' as any)
      .update({
        estado_pago: actualEstado,
        updated_at: new Date().toISOString()
      })
      .eq('id', actualId)
      .select()
      .single()

    if (error) {
      console.error('Error al actualizar gasto:', error)
      return NextResponse.json(
        { error: 'Error al actualizar estado del gasto' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Gasto ${actualId} actualizado a estado: ${actualEstado}`,
      gasto: data
    })

  } catch (error) {
    console.error('Error en PATCH /api/gastos-estado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// POST - Actualizar múltiples gastos
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, clienteId, mes, nuevoEstado, estado, gastoIds, ids } = body
    
    // Aceptar ambos formatos
    const actualEstado = estado || nuevoEstado
    const actualIds = ids || gastoIds

    if (!actualEstado) {
      return NextResponse.json(
        { error: 'estado es requerido' },
        { status: 400 }
      )
    }

    const estadosValidos = ['pendiente', 'pagado', 'pendiente_mes_actual', 'pendiente_anterior']
    if (!estadosValidos.includes(actualEstado)) {
      return NextResponse.json(
        { error: `Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}` },
        { status: 400 }
      )
    }

    let query = supabase
      .from('gastos' as any)
      .update({
        estado_pago: actualEstado,
        updated_at: new Date().toISOString()
      })

    let description = ''

    // Actualizar por lista de IDs
    if (actualIds && actualIds.length > 0) {
      query = query.in('id', actualIds)
      description = `${actualIds.length} gastos seleccionados`
    }
    // Actualizar por cliente y/o mes
    else if (clienteId || mes) {
      if (clienteId) {
        query = query.eq('id_cliente', clienteId)
        description += `cliente ${clienteId}`
      }
      if (mes) {
        const [year, month] = mes.split('-')
        const startDate = `${year}-${month}-01`
        const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]
        query = query.gte('fecha', startDate).lte('fecha', endDate)
        description += (description ? ' y ' : '') + `mes ${mes}`
      }
    } else {
      return NextResponse.json(
        { error: 'Debe proporcionar ids, clienteId o mes' },
        { status: 400 }
      )
    }

    const { data, error } = await query.select()

    if (error) {
      console.error('Error al actualizar gastos:', error)
      return NextResponse.json(
        { error: 'Error al actualizar gastos' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0} gastos de ${description} actualizados a: ${actualEstado}`,
      updated: data?.length || 0
    })

  } catch (error) {
    console.error('Error en POST /api/gastos-estado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
