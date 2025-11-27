/**
 * Utilidad para simulación de fechas en desarrollo
 * Permite a los desarrolladores simular diferentes fechas para probar funcionalidades
 */

/**
 * Obtiene la fecha actual, considerando si hay una fecha simulada activa
 * @returns Date objeto con la fecha actual o simulada
 */
export function getCurrentDate(): Date {
  // Solo en el cliente (navegador)
  if (typeof window !== 'undefined') {
    const simulatedDateStr = localStorage.getItem('simulatedDate')
    
    if (simulatedDateStr) {
      // Parsear la fecha simulada (formato YYYY-MM-DD)
      const [year, month, day] = simulatedDateStr.split('-').map(Number)
      
      // Crear fecha con la hora actual pero con el día simulado
      const now = new Date()
      const simulatedDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds())
      
      return simulatedDate
    }
  }
  
  // Retornar fecha real si no hay simulación o si es servidor
  return new Date()
}

/**
 * Verifica si hay una fecha simulada activa
 * @returns boolean
 */
export function isDateSimulated(): boolean {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('simulatedDate') !== null
  }
  return false
}

/**
 * Obtiene la fecha simulada como string (YYYY-MM-DD) o null si no hay simulación
 * @returns string | null
 */
export function getSimulatedDateString(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('simulatedDate')
  }
  return null
}

/**
 * Obtiene un timestamp considerando la fecha simulada
 * @returns number timestamp en milisegundos
 */
export function getCurrentTimestamp(): number {
  return getCurrentDate().getTime()
}

/**
 * Formatea la fecha actual (o simulada) en formato ISO
 * @returns string fecha en formato ISO
 */
export function getCurrentISOString(): string {
  return getCurrentDate().toISOString()
}

/**
 * Obtiene el mes actual (o simulado) para filtros de reportes
 * @returns string en formato YYYY-MM
 */
export function getCurrentMonthString(): string {
  const date = getCurrentDate()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Obtiene el año actual (o simulado)
 * @returns number
 */
export function getCurrentYear(): number {
  return getCurrentDate().getFullYear()
}

/**
 * Obtiene el mes actual (o simulado) como número (1-12)
 * @returns number
 */
export function getCurrentMonth(): number {
  return getCurrentDate().getMonth() + 1
}

/**
 * Obtiene el día actual (o simulado)
 * @returns number
 */
export function getCurrentDay(): number {
  return getCurrentDate().getDate()
}

/**
 * Calcula la diferencia en días entre la fecha actual/simulada y otra fecha
 * @param otherDate fecha a comparar
 * @returns number diferencia en días
 */
export function getDaysDifference(otherDate: Date | string): number {
  const current = getCurrentDate()
  const other = typeof otherDate === 'string' ? new Date(otherDate) : otherDate
  
  const diffTime = current.getTime() - other.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  return diffDays
}

/**
 * Verifica si una fecha está en el mes actual (o simulado)
 * @param date fecha a verificar
 * @returns boolean
 */
export function isCurrentMonth(date: Date | string): boolean {
  const checkDate = typeof date === 'string' ? new Date(date) : date
  const current = getCurrentDate()
  
  return checkDate.getFullYear() === current.getFullYear() &&
         checkDate.getMonth() === current.getMonth()
}

/**
 * Verifica si una fecha es hoy (considerando simulación)
 * @param date fecha a verificar
 * @returns boolean
 */
export function isToday(date: Date | string): boolean {
  const checkDate = typeof date === 'string' ? new Date(date) : date
  const current = getCurrentDate()
  
  return checkDate.getFullYear() === current.getFullYear() &&
         checkDate.getMonth() === current.getMonth() &&
         checkDate.getDate() === current.getDate()
}

/**
 * Hook de React para obtener la fecha actual y actualizar cuando cambie
 * NOTA: Usar con useEffect para detectar cambios en localStorage
 */
export function useDateSimulator() {
  if (typeof window === 'undefined') {
    return {
      currentDate: new Date(),
      isSimulated: false,
      simulatedDateStr: null
    }
  }

  return {
    currentDate: getCurrentDate(),
    isSimulated: isDateSimulated(),
    simulatedDateStr: getSimulatedDateString()
  }
}
