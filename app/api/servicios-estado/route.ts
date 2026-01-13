import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkStandardRateLimit } from '@/lib/rate-limit'
import { isValidUUID, verifyDevAdminSession } from '@/lib/auth-utils'

// Only log in development
const isDev = process.env.NODE_ENV === 'development'

// Maximum batch size for bulk operations
const MAX_BATCH_SIZE = 500

// Validate mes format (YYYY-MM)
function isValidMes(mes: string | null | undefined): boolean {
  if (!mes) return false
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
}

// GET - Obtener servicios profesionales con filtros
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
    // Trim and normalize params - treat whitespace-only as null
    const cedulaRaw = searchParams.get('cedula') || searchParams.get('cliente')
    const cedulaCliente = cedulaRaw ? cedulaRaw.trim() || null : null
    const estado = searchParams.get('estado')
    const mesRaw = searchParams.get('mes') // Formato: YYYY-MM
    const mes = mesRaw ? mesRaw.trim() || null : null
    const limitParam = searchParams.get('limit')
    
    // Validate and clamp limit between 1 and 500
    let limit = 100
    if (limitParam) {
      const parsed = parseInt(limitParam, 10)
      if (!isNaN(parsed)) {
        limit = Math.max(1, Math.min(parsed, MAX_BATCH_SIZE))
      }
    }

    // Validate mes format if provided (mes is already trimmed, null if empty)
    if (mes && !isValidMes(mes)) {
      return NextResponse.json(
        { error: 'Formato de mes inválido. Use YYYY-MM' },
        { status: 400 }
      )
    }

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
      .from('servicios_profesionales' as any)
      .select('*')
      .order('fecha', { ascending: false })
      .limit(limit)

    // Filtrar por cliente (usando IDs encontrados por cédula)
    if (cedulaCliente && clienteIds.length > 0) {
      query = query.in('id_cliente', clienteIds)
    } else if (cedulaCliente && clienteIds.length === 0) {
      // No se encontró ningún cliente con esa cédula
      return NextResponse.json({
        success: true,
        servicios: [],
        total: 0,
        message: 'No se encontró ningún cliente con esa cédula'
      })
    }

    // Filtrar por estado (ignorar si es 'todos')
    if (estado && estado !== 'todos') {
      query = query.eq('estado_pago', estado)
    }

    // Filtrar por mes (with UTC dates)
    if (mes) {
      const [year, month] = mes.split('-')
      const startDate = `${year}-${month}-01`
      // Calculate last day of month properly in UTC
      const lastDay = new Date(Date.UTC(parseInt(year), parseInt(month), 0)).getUTCDate()
      const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
      query = query.gte('fecha', startDate).lte('fecha', endDate)
    }

    const { data: servicios, error } = await query

    if (error) {
      if (isDev) console.error('Error al obtener servicios profesionales:', error)
      return NextResponse.json(
        { error: 'Error al obtener servicios profesionales' },
        { status: 500 }
      )
    }

    // Obtener nombres de funcionarios responsables
    const funcionariosIds = [...new Set((servicios || []).map((s: any) => s.id_responsable).filter(Boolean))]
    let funcionariosMap: Record<string, string> = {}
    if (funcionariosIds.length > 0) {
      const { data: funcionarios } = await supabase
        .from('funcionarios')
        .select('id, nombre')
        .in('id', funcionariosIds)
      
      funcionarios?.forEach((f: any) => { funcionariosMap[f.id] = f.nombre })
    }

    // Obtener títulos de servicios
    const serviciosIds = [...new Set((servicios || []).map((s: any) => s.id_servicio).filter(Boolean))]
    let serviciosMap: Record<string, string> = {}
    if (serviciosIds.length > 0) {
      const { data: listaServicios } = await supabase
        .from('lista_servicios' as any)
        .select('id, titulo')
        .in('id', serviciosIds)
      
      listaServicios?.forEach((ls: any) => { serviciosMap[ls.id] = ls.titulo })
    }

    // Obtener nombres de clientes
    const idsParaNombres = [...new Set((servicios || []).map((s: any) => s.id_cliente).filter(Boolean))]
    
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

    // Agregar nombres a cada servicio
    const serviciosConCliente = (servicios || []).map((s: any) => ({
      ...s,
      cliente_nombre: clientesMap[s.id_cliente] || 'Sin cliente',
      servicio_titulo: serviciosMap[s.id_servicio] || 'Sin título',
      funcionarios: s.id_responsable ? { nombre: funcionariosMap[s.id_responsable] } : null,
      lista_servicios: s.id_servicio ? { titulo: serviciosMap[s.id_servicio] } : null
    }))

    return NextResponse.json({
      success: true,
      servicios: serviciosConCliente,
      total: serviciosConCliente.length
    })

  } catch (error) {
    if (isDev) console.error('Error en GET /api/servicios-estado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// PATCH - Actualizar estado de pago de un servicio profesional
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
    const { id, servicioId, estado, nuevoEstado } = body
    
    // Aceptar ambos formatos de parámetros
    const actualId = id || servicioId
    const actualEstado = estado || nuevoEstado

    // Validate UUID format
    if (!actualId || !isValidUUID(actualId)) {
      return NextResponse.json(
        { error: 'id inválido' },
        { status: 400 }
      )
    }

    if (!actualEstado) {
      return NextResponse.json(
        { error: 'estado es requerido' },
        { status: 400 }
      )
    }

    // Estados válidos para servicios profesionales
    const estadosValidos = ['pendiente', 'pagado', 'cancelado']
    if (!estadosValidos.includes(actualEstado)) {
      return NextResponse.json(
        { error: `Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}` },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('servicios_profesionales' as any)
      .update({
        estado_pago: actualEstado,
        updated_at: new Date().toISOString()
      })
      .eq('id', actualId)
      .select()
      .maybeSingle()

    if (error) {
      if (isDev) console.error('Error al actualizar servicio profesional:', error)
      return NextResponse.json(
        { error: 'Error al actualizar estado del servicio' },
        { status: 500 }
      )
    }

    // Handle case where no row was found
    if (!data) {
      return NextResponse.json(
        { error: 'Servicio no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Servicio actualizado a estado: ${actualEstado}`,
      servicio: data
    })

  } catch (error) {
    if (isDev) console.error('Error en PATCH /api/servicios-estado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// POST - Actualizar múltiples servicios profesionales
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
    const { action, clienteId, mes, nuevoEstado, estado, servicioIds, ids } = body
    
    // Aceptar ambos formatos
    const actualEstado = estado || nuevoEstado
    const actualIds = ids || servicioIds

    if (!actualEstado) {
      return NextResponse.json(
        { error: 'estado es requerido' },
        { status: 400 }
      )
    }

    // Estados válidos para servicios profesionales
    const estadosValidos = ['pendiente', 'pagado', 'cancelado']
    if (!estadosValidos.includes(actualEstado)) {
      return NextResponse.json(
        { error: `Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate mes format if provided (ignore empty strings)
    if (mes && mes.trim() !== '' && !isValidMes(mes)) {
      return NextResponse.json(
        { error: 'Formato de mes inválido. Use YYYY-MM' },
        { status: 400 }
      )
    }

    // Validate clienteId if provided
    if (clienteId && !isValidUUID(clienteId)) {
      return NextResponse.json(
        { error: 'clienteId inválido' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('servicios_profesionales' as any)
      .update({
        estado_pago: actualEstado,
        updated_at: new Date().toISOString()
      })

    let description = ''

    // Actualizar por lista de IDs
    if (actualIds && Array.isArray(actualIds) && actualIds.length > 0) {
      // Validate batch size
      if (actualIds.length > MAX_BATCH_SIZE) {
        return NextResponse.json(
          { error: `Máximo ${MAX_BATCH_SIZE} servicios por operación` },
          { status: 400 }
        )
      }
      
      // Validate all IDs are UUIDs
      const invalidIds = actualIds.filter((id: any) => typeof id !== 'string' || !isValidUUID(id))
      if (invalidIds.length > 0) {
        return NextResponse.json(
          { error: 'Uno o más IDs son inválidos' },
          { status: 400 }
        )
      }
      
      query = query.in('id', actualIds)
      description = `${actualIds.length} servicios seleccionados`
    }
    // Actualizar por cliente y/o mes
    else if (clienteId || mes) {
      // Require clienteId when mes is provided (to prevent accidental mass updates)
      if (mes && !clienteId) {
        return NextResponse.json(
          { error: 'Debe proporcionar clienteId cuando usa filtro por mes para evitar actualizaciones masivas accidentales' },
          { status: 400 }
        )
      }
      if (clienteId) {
        query = query.eq('id_cliente', clienteId)
        description += `cliente ${clienteId.substring(0, 8)}...`
      }
      if (mes) {
        const [year, month] = mes.split('-')
        const startDate = `${year}-${month}-01`
        const lastDay = new Date(Date.UTC(parseInt(year), parseInt(month), 0)).getUTCDate()
        const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`
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
      if (isDev) console.error('Error al actualizar servicios:', error)
      return NextResponse.json(
        { error: 'Error al actualizar servicios' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${data?.length || 0} servicios de ${description} actualizados a: ${actualEstado}`,
      updated: data?.length || 0
    })

  } catch (error) {
    if (isDev) console.error('Error en POST /api/servicios-estado:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
