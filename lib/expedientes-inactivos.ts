import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Lógica de expedientes inactivos — extraída de app/api/expedientes-inactivos/route.ts
//
// Centraliza el cálculo de inactividad para que:
//   - El endpoint GET /api/expedientes-inactivos (panel /dev) lo use para listar.
//   - El endpoint POST /api/expedientes-inactivos/notify (cron) lo use para notificar.
//   - Los tests puedan importar las funciones puras (diasDesde, filtros, etc.)
//     sin tocar Supabase.
// ============================================================================

export const INACTIVITY_DAYS = 15
export const PAGE_SIZE = 20

export const MODALIDADES_ACTIVAS = [
  'mensualidad',
  'pago_unico',
  'único pago',
  'unico pago',
  'etapa',
  'etapa finalizada',
]

export const ESTADOS_EXCLUIDOS = ['finalizado', 'pagado', 'cancelado']

export interface SolicitudBase {
  id: string
  titulo: string | null
  id_cliente: string | null
  modalidad_pago: string | null
  etapa_actual: string | null
  estado_pago: string | null
  expediente: string | null
  created_at: string | null
  updated_at: string | null
}

export interface ExpedienteInactivo {
  id: string
  titulo: string | null
  modalidad_pago: string | null
  etapa_actual: string | null
  estado_pago: string | null
  id_cliente: string | null
  clienteNombre: string
  expediente: string | null
  diasInactivo: number
  ultimoMovimiento: string | null
  tipoUltimoMovimiento: string | null
  nuncaTuvoActividad: boolean
  ultimoPago: { fecha: string; mes: string } | null
}

// ---------------------------------------------------------------------------
// Funciones puras (testeables sin BD)
// ---------------------------------------------------------------------------

/**
 * Días transcurridos desde `fechaIso` hasta hoy (medianoche a medianoche).
 * Devuelve `Infinity` si la fecha es nula.
 */
export function diasDesde(fechaIso: string | null): number {
  if (!fechaIso) return Infinity
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fecha = new Date(fechaIso)
  fecha.setHours(0, 0, 0, 0)
  const diff = hoy.getTime() - fecha.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

/** True si la modalidad está en MODALIDADES_ACTIVAS (comparación case-insensitive, substring bidireccional). */
export function tieneModalidadActiva(modalidadPago: string | null): boolean {
  const modalidad = (modalidadPago || '').toLowerCase().trim()
  if (!modalidad) return false
  return MODALIDADES_ACTIVAS.some(m => modalidad.includes(m) || m.includes(modalidad))
}

/** True si el estado está en ESTADOS_EXCLUIDOS (comparación case-insensitive exacta). */
export function estaExcluidoPorEstado(estadoPago: string | null): boolean {
  const estado = (estadoPago || '').toLowerCase().trim()
  if (!estado) return false
  return ESTADOS_EXCLUIDOS.some(e => estado === e)
}

/** Filtra las solicitudes activas por modalidad y estado (no excluido). */
export function filtrarSolicitudesActivas<T extends SolicitudBase>(solicitudes: T[]): T[] {
  return solicitudes.filter(
    s => tieneModalidadActiva(s.modalidad_pago) && !estaExcluidoPorEstado(s.estado_pago)
  )
}

export type TipoMovimiento = 'Actualización' | 'Gasto' | 'Servicio Profesional'

export interface MovimientoRow {
  id_solicitud?: string | null
  id_caso?: string | null
  id_solicitud_sheets?: string | null
  tiempo?: string | null
  fecha?: string | null
}

/**
 * Construye un mapa `solicitud_id -> { fecha, tipo }` con la fecha más reciente
 * de actividad por expediente, a partir de actualizaciones, gastos y
 * servicios profesionales. Solo se incluyen ids que estén en `solicitudIds`.
 */
export function construirMapaUltimoMovimiento(
  actualizaciones: MovimientoRow[],
  gastos: MovimientoRow[],
  serviciosProfesionales: MovimientoRow[],
  solicitudIds: string[]
): Map<string, { fecha: string; tipo: TipoMovimiento }> {
  const map = new Map<string, { fecha: string; tipo: TipoMovimiento }>()

  const actualizar = (solId: string, fecha: string, tipo: TipoMovimiento) => {
    if (!solicitudIds.includes(solId)) return
    const prev = map.get(solId)
    if (!prev || new Date(fecha) > new Date(prev.fecha)) {
      map.set(solId, { fecha, tipo })
    }
  }

  for (const row of actualizaciones) {
    if (row.id_solicitud && row.tiempo) {
      actualizar(row.id_solicitud, row.tiempo, 'Actualización')
    }
  }
  for (const row of gastos) {
    if (row.id_caso && row.fecha) {
      actualizar(row.id_caso, row.fecha, 'Gasto')
    }
  }
  for (const row of serviciosProfesionales) {
    const solId = row.id_solicitud_sheets || row.id_caso
    if (solId && row.fecha) {
      actualizar(solId, row.fecha, 'Servicio Profesional')
    }
  }

  return map
}

/** Construye la lista final de inactivos a partir de las solicitudes activas y el mapa de movimientos. */
export function construirListaInactivos<T extends SolicitudBase>(
  solicitudesActivas: T[],
  ultimoMovMap: Map<string, { fecha: string; tipo: TipoMovimiento }>,
  clienteNombreMap: Map<string, string>,
  ultimoPagoMap: Map<string, { fecha: string; mes: string }>,
  inactivityDays: number = INACTIVITY_DAYS
): ExpedienteInactivo[] {
  return solicitudesActivas
    .map(sol => {
      const movimiento = ultimoMovMap.get(sol.id) ?? null
      const ultimaFecha = movimiento?.fecha ?? null
      const nuncaTuvoActividad = !ultimaFecha
      const diasInactivo = ultimaFecha ? diasDesde(ultimaFecha) : diasDesde(sol.created_at)

      return {
        id: sol.id,
        titulo: sol.titulo,
        modalidad_pago: sol.modalidad_pago,
        etapa_actual: sol.etapa_actual,
        estado_pago: sol.estado_pago,
        id_cliente: sol.id_cliente,
        clienteNombre: clienteNombreMap.get(sol.id_cliente ?? '') || 'Sin cliente asignado',
        expediente: sol.expediente,
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
    .filter(s => s.diasInactivo >= inactivityDays)
    .sort((a, b) => b.diasInactivo - a.diasInactivo)
}

// ---------------------------------------------------------------------------
// Filtros de UI + paginación (usados solo por el endpoint GET del panel /dev)
// ---------------------------------------------------------------------------

export type FiltroModalidad = 'all' | 'mensualidad' | 'pago_unico' | 'etapa'

export function aplicarFiltrosUi(
  inactivos: ExpedienteInactivo[],
  filtroModalidad: FiltroModalidad,
  filtroCliente: string
): ExpedienteInactivo[] {
  let resultado = inactivos

  if (filtroModalidad !== 'all') {
    resultado = resultado.filter(s => {
      const m = (s.modalidad_pago || '').toLowerCase()
      if (filtroModalidad === 'mensualidad') return m.includes('mensual')
      if (filtroModalidad === 'pago_unico')
        return m.includes('unico') || m.includes('único') || m.includes('pago_unico')
      if (filtroModalidad === 'etapa') return m.includes('etapa')
      return true
    })
  }

  const cliente = filtroCliente.toLowerCase().trim()
  if (cliente) {
    resultado = resultado.filter(s => s.clienteNombre.toLowerCase().includes(cliente))
  }

  return resultado
}

export function paginar<T>(items: T[], page: number, pageSize: number = PAGE_SIZE) {
  const total = items.length
  const totalPages = Math.ceil(total / pageSize)
  const offset = Math.max(0, (page - 1) * pageSize)
  const paginado = items.slice(offset, offset + pageSize)
  return { paginado, total, totalPages, page }
}

// ---------------------------------------------------------------------------
// Orquestador: ejecuta las queries contra Supabase y devuelve los inactivos.
// Recibe el cliente para permitir mocks en tests.
// ---------------------------------------------------------------------------

export interface ObtenerInactivosOptions {
  /** Umbral de días de inactividad. Default INACTIVITY_DAYS (15). */
  inactivityDays?: number
}

/**
 * Consulta Supabase y devuelve TODOS los expedientes inactivos (sin paginar,
 * sin filtros de UI). Ordenados por diasInactivo descendente.
 *
 * El endpoint del panel debe llamar esto y luego aplicar aplicarFiltrosUi + paginar.
 * El endpoint de notificaciones llama esto y filtra los ya notificados.
 */
export async function obtenerExpedientesInactivos(
  supabase: SupabaseClient,
  options: ObtenerInactivosOptions = {}
): Promise<ExpedienteInactivo[]> {
  const inactivityDays = options.inactivityDays ?? INACTIVITY_DAYS

  // 1. Obtener todas las solicitudes
  const { data: solicitudes, error: solError } = await supabase
    .from('solicitudes')
    .select(
      'id, titulo, id_cliente, modalidad_pago, etapa_actual, estado_pago, expediente, created_at, updated_at'
    )

  if (solError) {
    throw new Error(`Error al obtener solicitudes: ${solError.message}`)
  }

  const solicitudesActivas = filtrarSolicitudesActivas((solicitudes ?? []) as SolicitudBase[])
  if (solicitudesActivas.length === 0) return []

  const solicitudIds = solicitudesActivas.map(s => s.id)
  const clienteIds = [...new Set(solicitudesActivas.map(s => s.id_cliente).filter(Boolean))] as string[]

  // 2. Queries en paralelo para último movimiento + nombres + últimos pagos
  const [actResult, gasResult, spResult, usuResult, empResult, ingResult] = await Promise.all([
    supabase
      .from('actualizaciones')
      .select('id_solicitud, tiempo')
      .in('id_solicitud', solicitudIds)
      .not('tiempo', 'is', null),

    supabase
      .from('gastos')
      .select('id_caso, fecha')
      .in('id_caso', solicitudIds)
      .not('fecha', 'is', null),

    supabase
      .from('servicios_profesionales')
      .select('id_solicitud_sheets, id_caso, fecha')
      .or(
        `id_solicitud_sheets.in.(${solicitudIds.map(id => `"${id}"`).join(',')}),id_caso.in.(${solicitudIds
          .map(id => `"${id}"`)
          .join(',')})`
      )
      .not('fecha', 'is', null),

    clienteIds.length > 0
      ? supabase.from('usuarios').select('id, nombre').in('id', clienteIds)
      : Promise.resolve({ data: [], error: null } as any),

    clienteIds.length > 0
      ? supabase.from('empresas').select('id, nombre').in('id', clienteIds)
      : Promise.resolve({ data: [], error: null } as any),

    clienteIds.length > 0
      ? supabase
          .from('payment_receipts')
          .select('user_id, mes_pago, reviewed_at')
          .in('user_id', clienteIds)
          .eq('estado', 'aprobado')
          .not('reviewed_at', 'is', null)
      : Promise.resolve({ data: [], error: null } as any),
  ])

  // 3. Mapa último movimiento
  const ultimoMovMap = construirMapaUltimoMovimiento(
    (actResult.data ?? []) as MovimientoRow[],
    (gasResult.data ?? []) as MovimientoRow[],
    (spResult.data ?? []) as MovimientoRow[],
    solicitudIds
  )

  // 4. Mapa último pago aprobado por cliente (informativo, no afecta inactividad)
  const ultimoPagoMap = new Map<string, { fecha: string; mes: string }>()
  for (const rec of (ingResult.data ?? []) as any[]) {
    if (!rec.user_id || !rec.reviewed_at) continue
    const prev = ultimoPagoMap.get(rec.user_id)
    if (!prev || new Date(rec.reviewed_at) > new Date(prev.fecha)) {
      ultimoPagoMap.set(rec.user_id, { fecha: rec.reviewed_at, mes: rec.mes_pago })
    }
  }

  // 5. Mapa nombres de clientes
  const clienteNombreMap = new Map<string, string>()
  for (const u of (usuResult.data ?? []) as any[]) {
    clienteNombreMap.set(u.id, u.nombre)
  }
  for (const e of (empResult.data ?? []) as any[]) {
    clienteNombreMap.set(e.id, e.nombre)
  }

  // 6. Construir lista de inactivos
  return construirListaInactivos(
    solicitudesActivas,
    ultimoMovMap,
    clienteNombreMap,
    ultimoPagoMap,
    inactivityDays
  )
}
