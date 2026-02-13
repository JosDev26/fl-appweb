/**
 * Utilidades para la lógica de aprobación de pagos y control de modoPago.
 * 
 * Estas funciones contienen la lógica pura (sin side effects) para determinar
 * si se debe desactivar modoPago al aprobar un comprobante de pago.
 * 
 * El problema que resuelve: cuando se aprueba un comprobante de un mes anterior
 * (ej: diciembre), no se debe desactivar modoPago si el cliente tiene datos
 * pendientes en el mes actualmente cobrado (ej: enero).
 */

/**
 * Calcula el mes activo (el que se está cobrando) basado en la fecha
 * del último registro de historial_reportes.
 * 
 * El trigger usa: mes_a_cobrar = fecha - 1 mes
 * Ejemplo: fecha = 2026-02-03 → mes activo = 2026-01
 * 
 * @param ultimaFechaReporte - Fecha del último historial_reportes (YYYY-MM-DD)
 * @returns Mes activo en formato "YYYY-MM", o null si no hay fecha
 */
export function getMesActivo(ultimaFechaReporte: string | null | undefined): string | null {
  if (!ultimaFechaReporte) return null

  // Strip time portion if present (handle both YYYY-MM-DD and ISO datetime)
  const dateOnly = ultimaFechaReporte.substring(0, 10)
  const fecha = new Date(dateOnly + 'T00:00:00Z')
  if (isNaN(fecha.getTime())) return null

  // Restar 1 mes (mismo cálculo que el trigger SQL)
  const year = fecha.getUTCFullYear()
  const month = fecha.getUTCMonth() // 0-indexed

  let mesAnterior = month - 1
  let anioResultado = year
  if (mesAnterior < 0) {
    mesAnterior = 11
    anioResultado = year - 1
  }

  const mesStr = String(mesAnterior + 1).padStart(2, '0')
  return `${anioResultado}-${mesStr}`
}

/**
 * Determina si un mes de pago es anterior al mes activo.
 * 
 * @param mesPago - Mes del comprobante que se está aprobando (YYYY-MM)
 * @param mesActivo - Mes actualmente cobrado (YYYY-MM)
 * @returns true si mesPago es estrictamente anterior a mesActivo
 */
export function isOlderMonth(mesPago: string, mesActivo: string): boolean {
  if (!mesPago || !mesActivo) return false
  // Comparación léxica funciona para formato YYYY-MM
  return mesPago < mesActivo
}

/**
 * Resultado de la verificación de datos pendientes del cliente.
 */
export interface DatosPendientesResult {
  tieneDatos: boolean
  trabajosPorHora: number
  gastos: number
  serviciosProfesionales: number
  mensualidadesActivas: number
  receiptsPendientes: number
}

/**
 * Determina si se debe desactivar modoPago al aprobar un comprobante.
 * 
 * Reglas:
 * 1. Si no hay mes activo (no hay historial_reportes) → NO desactivar (conservar estado)
 * 2. Si mes_pago < mes_activo → El cliente pagó un mes viejo pero tiene el mes actual pendiente
 *    → Verificar si tiene datos pendientes en el mes activo → si tiene, NO desactivar
 * 3. Si mes_pago = mes_activo → Verificar si quedan otros pendientes → si no quedan, desactivar
 * 4. Si mes_pago > mes_activo → Caso raro, desactivar normalmente
 * 
 * @param mesPago - Mes del comprobante (YYYY-MM)
 * @param mesActivo - Mes activo calculado del último historial_reportes (YYYY-MM o null)
 * @param datosPendientes - Datos pendientes del cliente en el mes activo
 * @returns true si se debe desactivar modoPago
 */
export function shouldDeactivateModoPago(
  mesPago: string,
  mesActivo: string | null,
  datosPendientes: DatosPendientesResult
): boolean {
  // Sin mes activo → conservar estado (no desactivar)
  if (!mesActivo) return false

  // Rama 1: mesPago > mesActivo → caso raro (pago adelantado), desactivar siempre
  if (mesPago > mesActivo) return true

  // Rama 2: mesPago < mesActivo → pagó un mes viejo, solo desactivar si NO tiene datos pendientes
  if (mesPago < mesActivo) return !datosPendientes.tieneDatos

  // Rama 3: mesPago === mesActivo → pagó el mes actual, desactivar solo si no quedan pendientes
  return !datosPendientes.tieneDatos
}

/**
 * Calcula el rango de fechas para un mes en formato YYYY-MM.
 * 
 * @param mesPago - Mes en formato YYYY-MM
 * @returns { inicio: "YYYY-MM-DD", fin: "YYYY-MM-DD" } o null si formato inválido
 */
export function getRangoFechasMes(mesPago: string): { inicio: string; fin: string } | null {
  if (!mesPago || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mesPago)) return null

  const [yearStr, monthStr] = mesPago.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)

  const inicio = `${yearStr}-${monthStr}-01`
  // Último día del mes: crear fecha del día 0 del mes siguiente
  const ultimoDia = new Date(year, month, 0).getDate()
  const fin = `${yearStr}-${monthStr}-${String(ultimoDia).padStart(2, '0')}`

  return { inicio, fin }
}
