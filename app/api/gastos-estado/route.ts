import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkStandardRateLimit } from '@/lib/rate-limit'
import { verifyDevAdminSession } from '@/lib/auth-utils'

// Only log in development
const isDev = process.env.NODE_ENV === 'development'

// GET - Obtener gastos con filtros
// Protected: Requires dev admin authentication
export async function GET(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  // Verify dev admin authentication
  const authResult = await verifyDevAdminSession(request)
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const cedulaCliente = searchParams.get('cedula') || searchParams.get('cliente')
    const estado = searchParams.get('estado')
    const mes = searchParams.get('mes') // Formato: YYYY-MM
    const limit = parseInt(searchParams.get('limit') || '100')

    // Si hay cédula, buscar el ID del cliente primero
    let clienteIds: string[] = []
    if (cedulaCliente) {
      // Buscar en usuarios por cédula
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id')
        .ilike('cedula', `%${cedulaCliente}%`)
      
      // Buscar en empresas por cédula
      const { data: empresas } = await supabase
        .from('empresas')
        .select('id')
        .ilike('cedula', `%${cedulaCliente}%`)
      
      clienteIds = [
        ...(usuarios || []).map((u: any) => u.id),
        ...(empresas || []).map((e: any) => e.id)
      ]
    }

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

    // Filtrar por cliente (usando IDs encontrados por cédula)
    if (cedulaCliente && clienteIds.length > 0) {
      query = query.in('id_cliente', clienteIds)
    } else if (cedulaCliente && clienteIds.length === 0) {
      // No se encontró ningún cliente con esa cédula
      return NextResponse.json({
        success: true,
        gastos: [],
        total: 0,
        message: 'No se encontró ningún cliente con esa cédula'
      })
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
      if (isDev) console.error('Error al obtener gastos:', error)
      return NextResponse.json(
        { error: 'Error al obtener gastos' },
        { status: 500 }
      )
    }

    // Obtener nombres de clientes
    const idsParaNombres = [...new Set((gastos || []).map((g: any) => g.id_cliente).filter(Boolean))]
    
    let clientesMap: Record<string, string> = {}
    if (idsParaNombres.length > 0) {
      // Buscar en usuarios
      const { data: usuarios } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .in('id', idsParaNombres)
      
      // Buscar en empresas
      const { data: empresas } = await supabase
        .from('empresas')
        .select('id, nombre')
        .in('id', idsParaNombres)
      
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
    if (isDev) console.error('Error en GET /api/gastos-estado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// PATCH - Actualizar estado de pago de un gasto
// Protected: Requires dev admin authentication
export async function PATCH(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  // Verify dev admin authentication
  const authResult = await verifyDevAdminSession(request)
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { id, gastoId, estado, nuevoEstado } = body
    
    // Aceptar ambos formatos de parámetros
    const actualId = (id || gastoId || '').toString().trim()
    const actualEstado = estado || nuevoEstado

    // Validate id is not empty (gastos uses text IDs, not UUIDs)
    if (!actualId) {
      return NextResponse.json(
        { error: 'id es requerido' },
        { status: 400 }
      )
    }

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

    const { data, error } = await supabase
      .from('gastos' as any)
      .update({
        estado_pago: actualEstado,
        updated_at: new Date().toISOString()
      })
      .eq('id', actualId)
      .select()
      .maybeSingle()

    if (error) {
      if (isDev) console.error('Error al actualizar gasto:', error)
      return NextResponse.json(
        { error: 'Error al actualizar estado del gasto' },
        { status: 500 }
      )
    }

    // Handle case where no row was found
    if (!data) {
      return NextResponse.json(
        { error: 'Gasto no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Gasto actualizado a estado: ${actualEstado}`,
      gasto: data
    })

  } catch (error) {
    if (isDev) console.error('Error en PATCH /api/gastos-estado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// POST - Actualizar múltiples gastos
// Protected: Requires dev admin authentication
export async function POST(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  // Verify dev admin authentication
  const authResult = await verifyDevAdminSession(request)
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    )
  }

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

    // Actualizar por lista de IDs (gastos uses text IDs from Google Sheets, not UUIDs)
    if (actualIds && actualIds.length > 0) {
      // Validate all IDs are non-empty strings
      const validIds = actualIds.map((id: string) => (id || '').toString().trim()).filter(Boolean)
      if (validIds.length === 0) {
        return NextResponse.json(
          { error: 'No se proporcionaron IDs válidos' },
          { status: 400 }
        )
      }
      query = query.in('id', validIds)
      description = `${validIds.length} gastos seleccionados`
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
      if (isDev) console.error('Error al actualizar gastos:', error)
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
    if (isDev) console.error('Error en POST /api/gastos-estado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
