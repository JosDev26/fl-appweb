import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================================
// Lógica de expedientes inactivos — extraída de app/api/expedientes-inactivos/route.ts
//
// Centraliza el cálculo de inactividad para que:
//   - El endpoint GET /api/expedientes-inactivos (panel /dev) lo use para listar.
//   - El endpoint POST /api/expedientes-inactivos/notify (cron) lo use para notificar.
//   - Los tests puedan importar las funciones puras (diasDesde, filtros, etc.)
//     sin tocar Supabase.
//
// Modelo de 2 rubros:
//   - DINERO: gastos, servicios_profesionales, trabajos_por_hora (casos),
//             mensualidad_pagos y payment_receipts (solicitud_caso_id_pagados).
//   - ACTUALIZACIONES: actualizaciones (solicitudes) y trabajos_por_hora (casos,
//                      donde el tph es la actualización del caso).
//
// Expedientes trackeados: solicitudes (modalidad activa) + casos (trabajados por hora).
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
export const ESTADOS_EXCLUIDOS_CASOS = ['finalizado', 'cancelado']

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

export interface CasoBase {
  id: string
  nombre: string | null
  estado: string | null
  expediente: string | null
  id_cliente: string | null
  created_at: string | null
}

export interface ExpedienteInactivo {
  id: string
  tipoExpediente: 'solicitud' | 'caso'
  titulo: string | null
  modalidad_pago: string | null
  etapa_actual: string | null
  estado_pago: string | null
  id_cliente: string | null
  clienteNombre: string
  expediente: string | null
  // Rubro Dinero
  diasInactivoDinero: number
  ultimoMovDinero: string | null
  tipoUltimoMovDinero: string | null
  // Rubro Actualizaciones
  diasInactivoActualizacion: number
  ultimoMovActualizacion: string | null
  tipoUltimoMovActualizacion: string | null
  // Overall (compat panel): días desde la última actividad de cualquier tipo (más reciente de ambos rubros)
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

/** True si el estado del caso está en ESTADOS_EXCLUIDOS_CASOS (case-insensitive exacto). */
export function estaCasoExcluido(estado: string | null): boolean {
  const e = (estado || '').toLowerCase().trim()
  if (!e) return false
  return ESTADOS_EXCLUIDOS_CASOS.some(x => e === x)
}

/** Filtra las solicitudes activas por modalidad y estado (no excluido). */
export function filtrarSolicitudesActivas<T extends SolicitudBase>(solicitudes: T[]): T[] {
  return solicitudes.filter(
    s => tieneModalidadActiva(s.modalidad_pago) && !estaExcluidoPorEstado(s.estado_pago)
  )
}

/** Filtra los casos activos (estado no excluido). */
export function filtrarCasosActivos<T extends CasoBase>(casos: T[]): T[] {
  return casos.filter(c => !estaCasoExcluido(c.estado))
}

export type TipoMovimiento =
  | 'Actualización'
  | 'Gasto'
  | 'Servicio Profesional'
  | 'Trabajo por Hora'
  | 'Pago'
  | 'Mensualidad'

export interface MovimientoRow {
  id_solicitud?: string | null
  id_caso?: string | null
  id_solicitud_sheets?: string | null
  caso_asignado?: string | null
  tiempo?: string | null
  fecha?: string | null
}

export interface MovEntry {
  fecha: string
  tipo: TipoMovimiento
}

/**
 * Expande los comprobantes aprobados en tuplas (expId, fecha) a partir del
 * JSONB solicitud_caso_id_pagados = { solicitudes: [...], casos: [...] }.
 * Solo incluye ids que estén en solicitudIds o casoIds.
 */
export function expandReceiptsToTuples(
  receipts: { reviewed_at: string | null; solicitud_caso_id_pagados: any }[],
  solicitudIds: string[],
  casoIds: string[]
): { expId: string; fecha: string }[] {
  const validSols = new Set(solicitudIds)
  const validCasos = new Set(casoIds)
  const tuples: { expId: string; fecha: string }[] = []
  for (const r of receipts) {
    if (!r.reviewed_at) continue
    const pagados = r.solicitud_caso_id_pagados
    if (!pagados || typeof pagados !== 'object') continue
    const sols = Array.isArray(pagados.solicitudes) ? pagados.solicitudes : []
    const cas = Array.isArray(pagados.casos) ? pagados.casos : []
    for (const id of sols) {
      if (typeof id === 'string' && validSols.has(id)) tuples.push({ expId: id, fecha: r.reviewed_at })
    }
    for (const id of cas) {
      if (typeof id === 'string' && validCasos.has(id)) tuples.push({ expId: id, fecha: r.reviewed_at })
    }
  }
  return tuples
}

function mergeInto(
  map: Map<string, MovEntry>,
  id: string | null | undefined,
  fecha: string | null | undefined,
  tipo: TipoMovimiento,
  validIds: Set<string>
): void {
  if (!id || !fecha) return
  if (!validIds.has(id)) return
  const prev = map.get(id)
  if (!prev || new Date(fecha) > new Date(prev.fecha)) {
    map.set(id, { fecha, tipo })
  }
}

/**
 * Construye el mapa de último movimiento de DINERO por expediente.
 * Combina gastos, servicios_profesionales, mensualidad_pagos y
 * comprobantes aprobados (receiptTuples).
 *
 * NOTA: trabajos_por_hora NO alimenta el rubro dinero (solo actualizaciones).
 */
export function construirMapaUltimoMovDinero(
  gastos: MovimientoRow[],
  serviciosProfesionales: MovimientoRow[],
  mensualidadPagos: { solicitud_id?: string | null; created_at?: string | null }[],
  receiptTuples: { expId: string; fecha: string }[],
  solicitudIds: string[],
  casoIds: string[]
): Map<string, MovEntry> {
  const validIds = new Set([...solicitudIds, ...casoIds])
  const map = new Map<string, MovEntry>()

  for (const g of gastos) mergeInto(map, g.id_caso, g.fecha, 'Gasto', validIds)
  for (const s of serviciosProfesionales) {
    const id = s.id_solicitud_sheets || s.id_caso
    mergeInto(map, id, s.fecha, 'Servicio Profesional', validIds)
  }
  for (const m of mensualidadPagos) mergeInto(map, m.solicitud_id, m.created_at, 'Mensualidad', validIds)
  for (const rt of receiptTuples) mergeInto(map, rt.expId, rt.fecha, 'Pago', validIds)

  return map
}

/**
 * Construye el mapa de último movimiento de ACTUALIZACIONES por expediente.
 * Combina actualizaciones (solicitudes) y trabajos_por_hora (casos).
 */
export function construirMapaUltimoMovActualizacion(
  actualizaciones: MovimientoRow[],
  trabajosPorHora: MovimientoRow[],
  solicitudIds: string[],
  casoIds: string[]
): Map<string, MovEntry> {
  const validSols = new Set(solicitudIds)
  const validCasos = new Set(casoIds)
  const map = new Map<string, MovEntry>()

  for (const a of actualizaciones) mergeInto(map, a.id_solicitud, a.tiempo, 'Actualización', validSols)
  // Para casos, el tph es la actualización
  for (const t of trabajosPorHora) mergeInto(map, t.caso_asignado, t.fecha, 'Trabajo por Hora', validCasos)

  return map
}

/** Construye la lista final de inactivos (solicitudes + casos) a partir de los 2 mapas. */
export function construirListaInactivos(
  solicitudesActivas: SolicitudBase[],
  casosActivos: CasoBase[],
  ultimoMovDineroMap: Map<string, MovEntry>,
  ultimoMovActualizacionMap: Map<string, MovEntry>,
  clienteNombreMap: Map<string, string>,
  ultimoPagoMap: Map<string, { fecha: string; mes: string }>,
  inactivityDays: number = INACTIVITY_DAYS
): ExpedienteInactivo[] {
  const build = (
    id: string,
    tipoExpediente: 'solicitud' | 'caso',
    titulo: string | null,
    modalidad_pago: string | null,
    etapa_actual: string | null,
    estado_pago: string | null,
    id_cliente: string | null,
    expediente: string | null,
    created_at: string | null
  ): ExpedienteInactivo => {
    const movDinero = ultimoMovDineroMap.get(id) ?? null
    const movAct = ultimoMovActualizacionMap.get(id) ?? null
    const diasDinero = movDinero ? diasDesde(movDinero.fecha) : diasDesde(created_at)
    const diasAct = movAct ? diasDesde(movAct.fecha) : diasDesde(created_at)
    const nuncaTuvoActividad = !movDinero && !movAct

    // Overall (compat panel): días desde la última actividad de cualquier tipo (más reciente)
    const diasInactivo = Math.min(diasDinero, diasAct)

    let ultimoMovimiento: string | null = null
    let tipoUltimoMovimiento: string | null = null
    if (movDinero && movAct) {
      const dineroMasReciente = new Date(movDinero.fecha) >= new Date(movAct.fecha)
      ultimoMovimiento = dineroMasReciente ? movDinero.fecha : movAct.fecha
      tipoUltimoMovimiento = dineroMasReciente ? movDinero.tipo : movAct.tipo
    } else if (movDinero) {
      ultimoMovimiento = movDinero.fecha
      tipoUltimoMovimiento = movDinero.tipo
    } else if (movAct) {
      ultimoMovimiento = movAct.fecha
      tipoUltimoMovimiento = movAct.tipo
    }

    const clienteNombre = (id_cliente ? clienteNombreMap.get(id_cliente) : undefined) || 'Sin cliente asignado'
    const ultimoPago = (() => {
      if (!id_cliente) return null
      const rec = ultimoPagoMap.get(id_cliente)
      return rec ? { fecha: rec.fecha, mes: rec.mes } : null
    })()

    return {
      id,
      tipoExpediente,
      titulo,
      modalidad_pago,
      etapa_actual,
      estado_pago,
      id_cliente,
      clienteNombre,
      expediente,
      diasInactivoDinero: diasDinero,
      ultimoMovDinero: movDinero?.fecha ?? null,
      tipoUltimoMovDinero: movDinero ? movDinero.tipo : null,
      diasInactivoActualizacion: diasAct,
      ultimoMovActualizacion: movAct?.fecha ?? null,
      tipoUltimoMovActualizacion: movAct ? movAct.tipo : null,
      diasInactivo,
      ultimoMovimiento,
      tipoUltimoMovimiento,
      nuncaTuvoActividad,
      ultimoPago,
    }
  }

  const fromSolicitudes = solicitudesActivas.map(s =>
    build(s.id, 'solicitud', s.titulo, s.modalidad_pago, s.etapa_actual, s.estado_pago, s.id_cliente, s.expediente, s.created_at)
  )
  const fromCasos = casosActivos.map(c =>
    build(c.id, 'caso', c.nombre, null, null, c.estado, c.id_cliente, c.expediente, c.created_at)
  )

  return [...fromSolicitudes, ...fromCasos]
    .filter(e => e.diasInactivoDinero >= inactivityDays || e.diasInactivoActualizacion >= inactivityDays)
    .sort((a, b) => b.diasInactivo - a.diasInactivo)
}

// ---------------------------------------------------------------------------
// Filtros de UI + paginación (usados solo por el endpoint GET del panel /dev)
// ---------------------------------------------------------------------------

export type FiltroModalidad = 'all' | 'mensualidad' | 'pago_unico' | 'etapa' | 'caso'

export function aplicarFiltrosUi(
  inactivos: ExpedienteInactivo[],
  filtroModalidad: FiltroModalidad,
  filtroCliente: string
): ExpedienteInactivo[] {
  let resultado = inactivos

  if (filtroModalidad === 'caso') {
    resultado = resultado.filter(s => s.tipoExpediente === 'caso')
  } else if (filtroModalidad !== 'all') {
    resultado = resultado.filter(s => {
      if (s.tipoExpediente === 'caso') return false
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
 * Incluye solicitudes (modalidad activa) y casos (trabajados por hora).
 * Un expediente se incluye si está inactivo en DINERO o ACTUALIZACIONES.
 */
export async function obtenerExpedientesInactivos(
  supabase: SupabaseClient,
  options: ObtenerInactivosOptions = {}
): Promise<ExpedienteInactivo[]> {
  const inactivityDays = options.inactivityDays ?? INACTIVITY_DAYS

  // 1. Obtener solicitudes + casos
  const [solResult, casoResult] = await Promise.all([
    supabase
      .from('solicitudes')
      .select(
        'id, titulo, id_cliente, modalidad_pago, etapa_actual, estado_pago, expediente, created_at, updated_at'
      ),
    supabase.from('casos').select('id, nombre, estado, expediente, id_cliente, created_at'),
  ])

  if (solResult.error) {
    throw new Error(`Error al obtener solicitudes: ${solResult.error.message}`)
  }
  if (casoResult.error) {
    throw new Error(`Error al obtener casos: ${casoResult.error.message}`)
  }

  const solicitudesActivas = filtrarSolicitudesActivas((solResult.data ?? []) as SolicitudBase[])
  const casosActivos = filtrarCasosActivos((casoResult.data ?? []) as CasoBase[])
  if (solicitudesActivas.length === 0 && casosActivos.length === 0) return []

  const solicitudIds = solicitudesActivas.map(s => s.id)
  const casoIds = casosActivos.map(c => c.id)
  const combinedIds = [...solicitudIds, ...casoIds]
  const clienteIds = [...new Set(
    [...solicitudesActivas, ...casosActivos].map(e => e.id_cliente).filter(Boolean)
  )] as string[]

  const empty = { data: [], error: null } as any

  // 2. Queries en paralelo
  const [actResult, gasResult, spResult, tphResult, mpResult, usuResult, empResult, recResult] =
    await Promise.all([
      solicitudIds.length
        ? supabase
            .from('actualizaciones')
            .select('id_solicitud, tiempo')
            .in('id_solicitud', solicitudIds)
            .not('tiempo', 'is', null)
        : Promise.resolve(empty),

      combinedIds.length
        ? supabase
            .from('gastos')
            .select('id_caso, fecha')
            .in('id_caso', combinedIds)
            .not('fecha', 'is', null)
        : Promise.resolve(empty),

      combinedIds.length
        ? supabase
            .from('servicios_profesionales')
            .select('id_solicitud_sheets, id_caso, fecha')
            .or(
              `id_solicitud_sheets.in.(${combinedIds.map(id => `"${id}"`).join(',')}),id_caso.in.(${combinedIds
                .map(id => `"${id}"`)
                .join(',')})`
            )
            .not('fecha', 'is', null)
        : Promise.resolve(empty),

      casoIds.length
        ? supabase
            .from('trabajos_por_hora')
            .select('caso_asignado, fecha')
            .in('caso_asignado', casoIds)
            .not('fecha', 'is', null)
        : Promise.resolve(empty),

      solicitudIds.length
        ? (supabase as any)
            .from('mensualidad_pagos')
            .select('solicitud_id, created_at')
            .in('solicitud_id', solicitudIds)
        : Promise.resolve(empty),

      clienteIds.length
        ? supabase.from('usuarios').select('id, nombre').in('id', clienteIds)
        : Promise.resolve(empty),

      clienteIds.length
        ? supabase.from('empresas').select('id, nombre').in('id', clienteIds)
        : Promise.resolve(empty),

      clienteIds.length
        ? supabase
            .from('payment_receipts')
            .select('user_id, reviewed_at, mes_pago, solicitud_caso_id_pagados')
            .in('user_id', clienteIds)
            .eq('estado', 'aprobado')
            .not('reviewed_at', 'is', null)
        : Promise.resolve(empty),
    ])

  // 3. Mapas de movimientos
  const receiptTuples = expandReceiptsToTuples(
    (recResult.data ?? []) as any,
    solicitudIds,
    casoIds
  )
  const ultimoMovDineroMap = construirMapaUltimoMovDinero(
    (gasResult.data ?? []) as MovimientoRow[],
    (spResult.data ?? []) as MovimientoRow[],
    (mpResult.data ?? []) as any,
    receiptTuples,
    solicitudIds,
    casoIds
  )
  const ultimoMovActualizacionMap = construirMapaUltimoMovActualizacion(
    (actResult.data ?? []) as MovimientoRow[],
    (tphResult.data ?? []) as MovimientoRow[],
    solicitudIds,
    casoIds
  )

  // 4. Mapa último pago aprobado por cliente (informativo, no afecta inactividad)
  const ultimoPagoMap = new Map<string, { fecha: string; mes: string }>()
  for (const rec of (recResult.data ?? []) as any[]) {
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
    casosActivos,
    ultimoMovDineroMap,
    ultimoMovActualizacionMap,
    clienteNombreMap,
    ultimoPagoMap,
    inactivityDays
  )
}
