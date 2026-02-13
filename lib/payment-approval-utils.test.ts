import { describe, it, expect } from 'vitest'
import {
  getMesActivo,
  isOlderMonth,
  shouldDeactivateModoPago,
  getRangoFechasMes,
  type DatosPendientesResult,
} from './payment-approval-utils'

// ============================================================================
// Tests para las utilidades de aprobación de pagos
// Estas funciones determinan si se debe desactivar modoPago al aprobar un
// comprobante, evitando el bug donde aprobar un pago de mes anterior
// desactiva el modoPago del mes actual.
// ============================================================================

describe('Payment Approval Utils', () => {

  // ==========================================================================
  // getMesActivo: Calcula el mes que se está cobrando basado en historial_reportes
  // ==========================================================================
  describe('getMesActivo', () => {
    it('should return previous month for a given date', () => {
      // fecha = 2026-02-03 → mes activo = 2026-01 (enero)
      expect(getMesActivo('2026-02-03')).toBe('2026-01')
    })

    it('should handle year boundary (January → December)', () => {
      // fecha = 2026-01-02 → mes activo = 2025-12 (diciembre del año anterior)
      expect(getMesActivo('2026-01-02')).toBe('2025-12')
    })

    it('should handle mid-year dates', () => {
      expect(getMesActivo('2026-07-15')).toBe('2026-06')
      expect(getMesActivo('2026-03-01')).toBe('2026-02')
      expect(getMesActivo('2025-11-28')).toBe('2025-10')
    })

    it('should return null for null/undefined input', () => {
      expect(getMesActivo(null)).toBeNull()
      expect(getMesActivo(undefined)).toBeNull()
    })

    it('should return null for empty string', () => {
      expect(getMesActivo('')).toBeNull()
    })

    it('should return null for invalid date', () => {
      expect(getMesActivo('not-a-date')).toBeNull()
      expect(getMesActivo('2026-13-01')).toBeNull()
    })

    it('should handle ISO format dates (strips time)', () => {
      expect(getMesActivo('2026-02-03T10:30:00Z')).toBe('2026-01')
    })
  })

  // ==========================================================================
  // isOlderMonth: Compara si un mes es anterior a otro
  // ==========================================================================
  describe('isOlderMonth', () => {
    it('should return true when mesPago is before mesActivo', () => {
      expect(isOlderMonth('2025-12', '2026-01')).toBe(true)
    })

    it('should return false when mesPago equals mesActivo', () => {
      expect(isOlderMonth('2026-01', '2026-01')).toBe(false)
    })

    it('should return false when mesPago is after mesActivo', () => {
      expect(isOlderMonth('2026-02', '2026-01')).toBe(false)
    })

    it('should handle cross-year comparison', () => {
      expect(isOlderMonth('2025-11', '2026-01')).toBe(true)
      expect(isOlderMonth('2026-01', '2025-12')).toBe(false)
    })

    it('should return false for empty/null inputs', () => {
      expect(isOlderMonth('', '2026-01')).toBe(false)
      expect(isOlderMonth('2026-01', '')).toBe(false)
    })
  })

  // ==========================================================================
  // shouldDeactivateModoPago: Lógica principal de decisión
  // ==========================================================================
  describe('shouldDeactivateModoPago', () => {
    // Helper para crear datos pendientes vacíos
    function noDatosPendientes(): DatosPendientesResult {
      return {
        tieneDatos: false,
        trabajosPorHora: 0,
        gastos: 0,
        serviciosProfesionales: 0,
        mensualidadesActivas: 0,
        receiptsPendientes: 0,
      }
    }

    // Helper para crear datos pendientes con valores
    function conDatosPendientes(overrides: Partial<DatosPendientesResult> = {}): DatosPendientesResult {
      return {
        tieneDatos: true,
        trabajosPorHora: 0,
        gastos: 0,
        serviciosProfesionales: 0,
        mensualidadesActivas: 0,
        receiptsPendientes: 0,
        ...overrides,
      }
    }

    // === Caso SAXE: Aprobar pago de mes anterior cuando hay mes actual pendiente ===
    it('should NOT deactivate when paying old month and client has current month data', () => {
      // SAXE: Aprobando pago de diciembre (2025-12), mes activo es enero (2026-01)
      // SAXE tiene 8 trabajos por hora en enero
      const result = shouldDeactivateModoPago(
        '2025-12',
        '2026-01',
        conDatosPendientes({ trabajosPorHora: 8 })
      )
      expect(result).toBe(false)
    })

    // === Caso normal: Aprobar pago del mes activo sin más pendientes ===
    it('should deactivate when paying current month and no pending data', () => {
      // Cliente paga enero (mes activo) y no tiene más pendientes
      const result = shouldDeactivateModoPago(
        '2026-01',
        '2026-01',
        noDatosPendientes()
      )
      expect(result).toBe(true)
    })

    // === Caso con gastos pendientes ===
    it('should NOT deactivate when client has pending gastos in active month', () => {
      const result = shouldDeactivateModoPago(
        '2025-12',
        '2026-01',
        conDatosPendientes({ gastos: 3 })
      )
      expect(result).toBe(false)
    })

    // === Caso con servicios profesionales pendientes ===
    it('should NOT deactivate when client has pending servicios profesionales', () => {
      const result = shouldDeactivateModoPago(
        '2025-12',
        '2026-01',
        conDatosPendientes({ serviciosProfesionales: 2 })
      )
      expect(result).toBe(false)
    })

    // === Caso con mensualidades activas ===
    it('should NOT deactivate when client has active mensualidades', () => {
      const result = shouldDeactivateModoPago(
        '2026-01',
        '2026-01',
        conDatosPendientes({ mensualidadesActivas: 1 })
      )
      expect(result).toBe(false)
    })

    // === Caso con otros receipts pendientes ===
    it('should NOT deactivate when client has other pending receipts', () => {
      const result = shouldDeactivateModoPago(
        '2026-01',
        '2026-01',
        conDatosPendientes({ receiptsPendientes: 1 })
      )
      expect(result).toBe(false)
    })

    // === Caso sin mes activo (no hay historial_reportes) ===
    it('should NOT deactivate when there is no active month', () => {
      const result = shouldDeactivateModoPago(
        '2026-01',
        null,
        noDatosPendientes()
      )
      expect(result).toBe(false)
    })

    // === Caso: Pago del mes activo, todo pagado excepto mensualidad con saldo ===
    it('should NOT deactivate when paying current month but mensualidad has remaining balance', () => {
      const result = shouldDeactivateModoPago(
        '2026-01',
        '2026-01',
        conDatosPendientes({ mensualidadesActivas: 1 })
      )
      expect(result).toBe(false)
    })

    // === Caso: Pago del mes activo, todo limpio ===
    it('should deactivate when all conditions are clear', () => {
      const result = shouldDeactivateModoPago(
        '2026-01',
        '2026-01',
        noDatosPendientes()
      )
      expect(result).toBe(true)
    })

    // === Caso: Pago de mes futuro (raro pero posible) ===
    it('should deactivate when paying future month and no pending data', () => {
      const result = shouldDeactivateModoPago(
        '2026-02',
        '2026-01',
        noDatosPendientes()
      )
      expect(result).toBe(true)
    })

    // === Caso: Múltiples razones para no desactivar ===
    it('should NOT deactivate when multiple types of pending data exist', () => {
      const result = shouldDeactivateModoPago(
        '2025-12',
        '2026-01',
        conDatosPendientes({
          trabajosPorHora: 8,
          gastos: 5,
          mensualidadesActivas: 1,
        })
      )
      expect(result).toBe(false)
    })
  })

  // ==========================================================================
  // getRangoFechasMes: Calcula rango de fechas para un mes
  // ==========================================================================
  describe('getRangoFechasMes', () => {
    it('should return correct range for January', () => {
      const rango = getRangoFechasMes('2026-01')
      expect(rango).toEqual({
        inicio: '2026-01-01',
        fin: '2026-01-31',
      })
    })

    it('should return correct range for February (non-leap year)', () => {
      const rango = getRangoFechasMes('2025-02')
      expect(rango).toEqual({
        inicio: '2025-02-01',
        fin: '2025-02-28',
      })
    })

    it('should return correct range for February (leap year)', () => {
      const rango = getRangoFechasMes('2024-02')
      expect(rango).toEqual({
        inicio: '2024-02-01',
        fin: '2024-02-29',
      })
    })

    it('should return correct range for December', () => {
      const rango = getRangoFechasMes('2025-12')
      expect(rango).toEqual({
        inicio: '2025-12-01',
        fin: '2025-12-31',
      })
    })

    it('should return correct range for April (30 days)', () => {
      const rango = getRangoFechasMes('2026-04')
      expect(rango).toEqual({
        inicio: '2026-04-01',
        fin: '2026-04-30',
      })
    })

    it('should return null for invalid format', () => {
      expect(getRangoFechasMes('')).toBeNull()
      expect(getRangoFechasMes('2026')).toBeNull()
      expect(getRangoFechasMes('2026-1')).toBeNull()
      expect(getRangoFechasMes('2026-13')).toBeNull()
      expect(getRangoFechasMes('2026-00')).toBeNull()
      expect(getRangoFechasMes('not-valid')).toBeNull()
    })
  })
})
