import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const INACTIVITY_DAYS = 15
const PAGE_SIZE = 20

// Modalidades de pago relevantes (comparación case-insensitive)
const MODALIDADES_ACTIVAS = ['mensualidad', 'pago_unico', 'único pago', 'unico pago', 'etapa', 'etapa finalizada']

// Estados a excluir
const ESTADOS_EXCLUIDOS = ['finalizado', 'pagado', 'cancelado']

function diasDesde(fechaIso: string | null): number {
  if (!fechaIso) return Infinity
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fecha = new Date(fechaIso)
  fecha.setHours(0, 0, 0, 0)
  const diff = hoy.getTime() - fecha.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
    const filtroModalidad = searchParams.get('filtroModalidad') || 'all'
    const filtroCliente = (searchParams.get('filtroCliente') || '').toLowerCase().trim()

    // 1. Obtener solicitudes activas con modalidades relevantes
    const { data: solicitudes, error: solError } = await supabase
      .from('solicitudes')
      .select('id, titulo, id_cliente, modalidad_pago, etapa_actual, estado_pago, expediente, created_at, updated_at')

    if (solError) {
      console.error('[expedientes-inactivos] Error al obtener solicitudes:', solError)
      return NextResponse.json({ error: 'Error al obtener solicitudes' }, { status: 500 })
    }

    // Filtrar por modalidad y estado activos
    const solicitudesActivas = (solicitudes || []).filter(s => {
      const modalidad = (s.modalidad_pago || '').toLowerCase().trim()
      const estado = (s.estado_pago || '').toLowerCase().trim()
      const tieneModalidadActiva = MODALIDADES_ACTIVAS.some(m => modalidad.includes(m) || m.includes(modalidad))
      const estaExcluida = ESTADOS_EXCLUIDOS.some(e => estado === e)
      return tieneModalidadActiva && !estaExcluida
    })

    if (solicitudesActivas.length === 0) {
      return NextResponse.json({ solicitudes: [], total: 0, page, totalPages: 0 })
    }

    const solicitudIds = solicitudesActivas.map(s => s.id)
    const clienteIds = [...new Set(solicitudesActivas.map(s => s.id_cliente).filter(Boolean))]

    // 2. Queries en paralelo para último movimiento
    // NOTA: solo se cuentan movimientos reales de tramitación.
    // - ingresos/pagos excluidos: no indican trabajo en el expediente
    // - solicitudes.updated_at excluido: el sync lo actualiza en CADA ejecución aunque no haya cambios
    const [actResult, gasResult, spResult, usuResult, empResult, ingResult] = await Promise.all([
      // Actualizaciones: último tiempo por id_solicitud
      supabase
        .from('actualizaciones')
        .select('id_solicitud, tiempo')
        .in('id_solicitud', solicitudIds)
        .not('tiempo', 'is', null),

      // Gastos: última fecha donde id_caso es el id de la solicitud
      supabase
        .from('gastos')
        .select('id_caso, fecha')
        .in('id_caso', solicitudIds)
        .not('fecha', 'is', null),

      // Servicios profesionales: por id_solicitud_sheets o id_caso
      supabase
        .from('servicios_profesionales')
        .select('id_solicitud_sheets, id_caso, fecha')
        .or(`id_solicitud_sheets.in.(${solicitudIds.map(id => `"${id}"`).join(',')}),id_caso.in.(${solicitudIds.map(id => `"${id}"`).join(',')})`)
        .not('fecha', 'is', null),

      // Nombres de usuarios (solicitudes.id_cliente = usuarios.id)
      clienteIds.length > 0
        ? supabase
            .from('usuarios')
            .select('id, nombre')
            .in('id', clienteIds)
        : Promise.resolve({ data: [], error: null }),

      // Nombres de empresas
      clienteIds.length > 0
        ? supabase
            .from('empresas')
            .select('id, nombre')
            .in('id', clienteIds)
        : Promise.resolve({ data: [], error: null }),

      // Comprobantes aprobados: último aprobado por cliente, solo para mostrar, NO afecta inactividad
      clienteIds.length > 0
        ? supabase
            .from('payment_receipts')
            .select('user_id, mes_pago, reviewed_at')
            .in('user_id', clienteIds)
            .eq('estado', 'aprobado')
            .not('reviewed_at', 'is', null)
        : Promise.resolve({ data: [], error: null }),
    ])

    // Mapas de último movimiento por solicitud_id
    const ultimoMovMap = new Map<string, { fecha: string; tipo: string }>()

    const actualizarMapa = (solId: string, fecha: string, tipo: string) => {
      const prev = ultimoMovMap.get(solId)
      if (!prev || new Date(fecha) > new Date(prev.fecha)) {
        ultimoMovMap.set(solId, { fecha, tipo })
      }
    }

    // Procesar actualizaciones
    for (const row of (actResult.data || [])) {
      if (row.id_solicitud && row.tiempo) {
        actualizarMapa(row.id_solicitud, row.tiempo, 'Actualización')
      }
    }

    // Procesar gastos
    for (const row of (gasResult.data || [])) {
      if (row.id_caso && row.fecha) {
        actualizarMapa(row.id_caso, row.fecha, 'Gasto')
      }
    }

    // Procesar servicios profesionales
    for (const row of (spResult.data || [])) {
      const solId = row.id_solicitud_sheets || row.id_caso
      if (solId && row.fecha && solicitudIds.includes(solId)) {
        actualizarMapa(solId, row.fecha, 'Servicio Profesional')
      }
    }

    // Mapa de último comprobante aprobado por cliente (user_id)
    const ultimoPagoMap = new Map<string, { fecha: string; mes: string }>()
    for (const rec of (ingResult.data || [])) {
      if (!rec.user_id || !rec.reviewed_at) continue
      const prev = ultimoPagoMap.get(rec.user_id)
      if (!prev || new Date(rec.reviewed_at) > new Date(prev.fecha)) {
        ultimoPagoMap.set(rec.user_id, { fecha: rec.reviewed_at, mes: rec.mes_pago })
      }
    }

    // Mapa de nombres de clientes
    const clienteNombreMap = new Map<string, string>()
    for (const u of (usuResult.data || [])) {
      clienteNombreMap.set(u.id, u.nombre)
    }
    for (const e of (empResult.data || [])) {
      clienteNombreMap.set(e.id, e.nombre)
    }

    // 3. Construir la lista de inactivos
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)

    const inactivos = solicitudesActivas
      .map(sol => {
        const movimiento = ultimoMovMap.get(sol.id) ?? null
        const ultimaFecha = movimiento?.fecha ?? null
        const nuncaTuvoActividad = !ultimaFecha
        const diasInactivo = ultimaFecha
          ? diasDesde(ultimaFecha)
          : diasDesde(sol.created_at)

        return {
          id: sol.id,
          titulo: sol.titulo,
          modalidad_pago: sol.modalidad_pago,
          etapa_actual: sol.etapa_actual,
          estado_pago: sol.estado_pago,
          id_cliente: sol.id_cliente,
          clienteNombre: clienteNombreMap.get(sol.id_cliente ?? '') || 'Sin cliente asignado',
          diasInactivo,
          ultimoMovimiento: ultimaFecha,
          tipoUltimoMovimiento: nuncaTuvoActividad ? null : (movimiento?.tipo ?? null),
          nuncaTuvoActividad,
          ultimoPago: (() => {
            if (!sol.id_cliente) return null
            const rec = ultimoPagoMap.get(sol.id_cliente)
            return rec ? { fecha: rec.fecha, mes: rec.mes } : null
          })(),
        }
      })
      .filter(s => s.diasInactivo >= INACTIVITY_DAYS)
      .sort((a, b) => b.diasInactivo - a.diasInactivo)

    // 4. Aplicar filtros de UI
    let resultado = inactivos

    if (filtroModalidad !== 'all') {
      resultado = resultado.filter(s => {
        const m = (s.modalidad_pago || '').toLowerCase()
        if (filtroModalidad === 'mensualidad') return m.includes('mensual')
        if (filtroModalidad === 'pago_unico') return m.includes('unico') || m.includes('único') || m.includes('pago_unico')
        if (filtroModalidad === 'etapa') return m.includes('etapa')
        return true
      })
    }

    if (filtroCliente) {
      resultado = resultado.filter(s =>
        s.clienteNombre.toLowerCase().includes(filtroCliente)
      )
    }

    // 5. Paginar
    const total = resultado.length
    const totalPages = Math.ceil(total / PAGE_SIZE)
    const offset = (page - 1) * PAGE_SIZE
    const paginado = resultado.slice(offset, offset + PAGE_SIZE)

    return NextResponse.json({
      solicitudes: paginado,
      total,
      page,
      totalPages,
    })
  } catch (error) {
    console.error('[expedientes-inactivos] Error interno:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
