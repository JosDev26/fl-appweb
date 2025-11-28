/**
 * Utilidades de fecha con soporte para:
 * 1. Zona horaria de Costa Rica (UTC-6)
 * 2. Fecha simulada global desde Supabase (para testing)
 * 
 * ⚠️ PRODUCCIÓN: Eliminar la lógica de fecha simulada antes de deploy
 */

import { supabase } from './supabase'

// Zona horaria de Costa Rica
const COSTA_RICA_TIMEZONE = 'America/Costa_Rica' // UTC-6

/**
 * Obtiene la fecha actual en zona horaria de Costa Rica
 * Considera fecha simulada global si existe
 * 
 * @param simulatedDateOverride - Fecha simulada pasada directamente (formato YYYY-MM-DD)
 * @returns Promise<Date> fecha actual o simulada
 */
export async function getCurrentDateCR(simulatedDateOverride?: string | null): Promise<Date> {
  // 1. Si se pasa una fecha simulada directamente, usarla
  if (simulatedDateOverride) {
    const [year, month, day] = simulatedDateOverride.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0) // Mediodía para evitar problemas de zona horaria
  }

  // 2. Buscar fecha simulada global en Supabase
  // ⚠️ ELIMINAR ESTE BLOQUE EN PRODUCCIÓN
  try {
    console.log('📅 [dateUtils] Buscando fecha simulada en system_config...')
    const { data, error } = await supabase
      .from('system_config' as any)
      .select('value')
      .eq('key', 'simulated_date')
      .maybeSingle()

    console.log('📅 [dateUtils] Resultado:', { data, error: error?.message })

    if (!error && data && (data as any).value) {
      const simulatedValue = (data as any).value as string
      const [year, month, day] = simulatedValue.split('-').map(Number)
      console.log('📅 [dateUtils] Usando fecha simulada global:', simulatedValue)
      return new Date(year, month - 1, day, 12, 0, 0)
    }
  } catch (err) {
    // Si falla, usar fecha real
    console.log('⚠️ [dateUtils] Error obteniendo fecha simulada:', err)
  }
  // ⚠️ FIN BLOQUE A ELIMINAR EN PRODUCCIÓN

  // 3. Usar fecha real de Costa Rica
  return getCostaRicaDate()
}

/**
 * Obtiene la fecha actual en Costa Rica (UTC-6)
 * Sin considerar simulaciones
 */
export function getCostaRicaDate(): Date {
  // Obtener fecha/hora actual en UTC
  const now = new Date()
  
  // Convertir a string en zona horaria de Costa Rica
  const crDateStr = now.toLocaleString('en-US', { 
    timeZone: COSTA_RICA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  
  // Parsear la fecha en formato Costa Rica
  // Formato: "MM/DD/YYYY, HH:MM:SS"
  const [datePart, timePart] = crDateStr.split(', ')
  const [month, day, year] = datePart.split('/').map(Number)
  const [hours, minutes, seconds] = timePart.split(':').map(Number)
  
  // Crear fecha local con los valores de Costa Rica
  return new Date(year, month - 1, day, hours, minutes, seconds)
}

/**
 * Calcula el mes anterior dado una fecha
 * @returns { year, month, mesPago } donde month es 1-12 y mesPago es "YYYY-MM"
 */
export function getMesAnterior(fecha: Date): { year: number; month: number; mesPago: string } {
  const year = fecha.getFullYear()
  const month = fecha.getMonth() // 0-11

  let mesAnteriorYear = year
  let mesAnteriorMonth = month - 1

  // Si estamos en enero (month=0), el mes anterior es diciembre (11) del año pasado
  if (mesAnteriorMonth < 0) {
    mesAnteriorMonth = 11 // diciembre
    mesAnteriorYear = year - 1
  }

  const mesPago = `${mesAnteriorYear}-${String(mesAnteriorMonth + 1).padStart(2, '0')}`

  return {
    year: mesAnteriorYear,
    month: mesAnteriorMonth + 1, // Retornar en formato 1-12
    mesPago
  }
}

/**
 * Obtiene rango de fechas para un mes dado
 * @param year año
 * @param month mes (1-12)
 * @returns { inicioMes, finMes } en formato YYYY-MM-DD
 */
export function getRangoMes(year: number, month: number): { inicioMes: string; finMes: string } {
  // Primer día del mes
  const inicioMes = `${year}-${String(month).padStart(2, '0')}-01`
  
  // Último día del mes (día 0 del mes siguiente = último día del mes actual)
  const ultimoDia = new Date(year, month, 0).getDate()
  const finMes = `${year}-${String(month).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
  
  return { inicioMes, finMes }
}

/**
 * Formatea una fecha para mostrar al usuario
 */
export function formatFechaCR(fecha: Date | string): string {
  const d = typeof fecha === 'string' ? new Date(fecha + 'T12:00:00') : fecha
  return d.toLocaleDateString('es-CR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Obtiene solo la parte de fecha en formato YYYY-MM-DD
 */
export function toDateString(fecha: Date): string {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const day = String(fecha.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
