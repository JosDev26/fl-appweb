/**
 * Tests for carry-forward (arrastre) of servicios profesionales and gastos.
 * 
 * CRITICAL: These tests verify that unpaid items from previous months are
 * correctly carried forward, and that once payment is approved, ALL carried
 * items (current + previous months) are marked as 'pagado' to prevent
 * infinite carry-forward bugs.
 * 
 * Related files:
 *   - app/api/datos-pago/route.ts (client-facing billing)
 *   - app/api/vista-pago/route.ts (admin billing view)
 *   - app/api/debug-vista-pago/route.ts (debug billing)
 *   - app/api/payment-receipts/route.ts (payment approval)
 *   - app/pago/page.tsx (client UI)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// HELPERS: Pure functions extracted from the codebase for testing
// ============================================================================

/**
 * Simulates the carry-forward query filter.
 * Items are carried forward when:
 *   1. estado_pago === 'pendiente'
 *   2. fecha < inicioMes (before current billing month)
 *   3. fecha >= fechaLimite12Meses (within 12-month window)
 */
function filterCarryForwardItems(
  items: Array<{ fecha: string; estado_pago: string; total: number; total_cobro?: number }>,
  inicioMes: string,
  fechaLimite12Meses: string
): typeof items {
  return items.filter(item =>
    item.estado_pago === 'pendiente' &&
    item.fecha < inicioMes &&
    item.fecha >= fechaLimite12Meses
  );
}

/**
 * Simulates the current-month query filter for gastos.
 * Items in the current billing month that are NOT cancelled.
 */
function filterCurrentMonthGastos(
  items: Array<{ fecha: string; estado_pago: string; total_cobro: number }>,
  inicioMes: string,
  finMes: string
): typeof items {
  return items.filter(item =>
    item.fecha >= inicioMes &&
    item.fecha <= finMes &&
    item.estado_pago !== 'cancelado'
  );
}

/**
 * Simulates the current-month query filter for servicios profesionales.
 * Items in the current billing month that are NOT cancelled.
 */
function filterCurrentMonthServicios(
  items: Array<{ fecha: string; estado_pago: string; total: number }>,
  inicioMes: string,
  finMes: string
): typeof items {
  return items.filter(item =>
    item.fecha >= inicioMes &&
    item.fecha <= finMes &&
    item.estado_pago !== 'cancelado'
  );
}

/**
 * Simplified calcularTotales matching the real implementation.
 */
function calcularTotales(
  gastosMesActual: Array<{ total_cobro: number; estado_pago: string }>,
  gastosPendientesAnteriores: Array<{ total_cobro: number }>,
  serviciosProfesionales: Array<{ costo: number; gastos: number; iva: number; total: number }>,
  serviciosPendientesAnteriores: Array<{ costo: number; gastos: number; iva: number; total: number }>,
  montoHoras: number,
  totalMensualidades: number,
  totalIVAMensualidades: number,
  ivaPerc: number
) {
  const gastosCliente = gastosMesActual
    .filter(g => g.estado_pago !== 'cancelado')
    .reduce((sum, g) => sum + (g.total_cobro || 0), 0);

  const totalGastosPendientesAnteriores = gastosPendientesAnteriores
    .reduce((sum, g) => sum + (g.total_cobro || 0), 0);

  const costoServiciosProfesionales = serviciosProfesionales.reduce((sum, s) => sum + (s.costo || 0), 0);
  const gastosServiciosProfesionales = serviciosProfesionales.reduce((sum, s) => sum + (s.gastos || 0), 0);
  const ivaServiciosProfesionales = serviciosProfesionales.reduce((sum, s) => sum + (s.iva || 0), 0);

  const costoServiciosPendientesAnteriores = serviciosPendientesAnteriores.reduce((sum, s) => sum + (s.costo || 0), 0);
  const gastosServiciosPendientesAnteriores = serviciosPendientesAnteriores.reduce((sum, s) => sum + (s.gastos || 0), 0);
  const ivaServiciosPendientesAnteriores = serviciosPendientesAnteriores.reduce((sum, s) => sum + (s.iva || 0), 0);
  const totalServiciosPendientesAnteriores = costoServiciosPendientesAnteriores;

  const totalGastos = gastosCliente + gastosServiciosProfesionales;

  const ivaHorasMensualidades = (montoHoras * ivaPerc) + totalIVAMensualidades;
  const iva = ivaHorasMensualidades + ivaServiciosProfesionales + ivaServiciosPendientesAnteriores;

  const subtotal = montoHoras + totalGastos + totalGastosPendientesAnteriores + costoServiciosProfesionales + totalMensualidades + totalServiciosPendientesAnteriores + gastosServiciosPendientesAnteriores;
  const total = subtotal + iva;

  return {
    gastosCliente,
    totalGastosPendientesAnteriores,
    totalGastos,
    costoServiciosProfesionales,
    ivaServiciosProfesionales,
    totalServiciosPendientesAnteriores,
    ivaServiciosPendientesAnteriores,
    subtotal,
    iva,
    total
  };
}

/**
 * Simulates the payment-approval logic for marking items as paid.
 * Returns items that would be updated.
 */
function markItemsAsPaidOnApproval(
  allItems: Array<{ id: string; fecha: string; estado_pago: string; id_cliente: string }>,
  clientId: string,
  mesPago: string // "YYYY-MM"
): { currentMonthMarked: string[]; carryForwardMarked: string[] } {
  const [yearStr, monthStr] = mesPago.split('-');
  const yearNum = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const startDate = `${yearStr}-${monthStr}-01`;
  const endDate = new Date(yearNum, monthNum, 0).toISOString().split('T')[0];
  const fechaLimite12Meses = new Date(yearNum, monthNum - 12, 1).toISOString().split('T')[0];

  // Current month marking (what already existed)
  const currentMonthMarked = allItems
    .filter(item =>
      item.id_cliente === clientId &&
      item.estado_pago !== 'cancelado' &&
      item.fecha >= startDate &&
      item.fecha <= endDate
    )
    .map(item => item.id);

  // Carry-forward marking (THE FIX)
  const carryForwardMarked = allItems
    .filter(item =>
      item.id_cliente === clientId &&
      item.estado_pago === 'pendiente' &&
      item.fecha < startDate &&
      item.fecha >= fechaLimite12Meses
    )
    .map(item => item.id);

  return { currentMonthMarked, carryForwardMarked };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Carry-Forward Filtering', () => {
  const inicioMes = '2025-01-01';
  const finMes = '2025-01-31';
  const fechaLimite12Meses = '2024-01-01';

  describe('filterCarryForwardItems', () => {
    it('should include items with estado_pago=pendiente from previous months', () => {
      const items = [
        { fecha: '2024-12-15', estado_pago: 'pendiente', total: 100, total_cobro: 100 },
        { fecha: '2024-11-10', estado_pago: 'pendiente', total: 200, total_cobro: 200 },
      ];
      const result = filterCarryForwardItems(items, inicioMes, fechaLimite12Meses);
      expect(result).toHaveLength(2);
    });

    it('should exclude items already marked as pagado', () => {
      const items = [
        { fecha: '2024-12-15', estado_pago: 'pagado', total: 100, total_cobro: 100 },
        { fecha: '2024-11-10', estado_pago: 'pendiente', total: 200, total_cobro: 200 },
      ];
      const result = filterCarryForwardItems(items, inicioMes, fechaLimite12Meses);
      expect(result).toHaveLength(1);
      expect(result[0].total).toBe(200);
    });

    it('should exclude items with estado_pago=cancelado', () => {
      const items = [
        { fecha: '2024-12-15', estado_pago: 'cancelado', total: 100, total_cobro: 100 },
      ];
      const result = filterCarryForwardItems(items, inicioMes, fechaLimite12Meses);
      expect(result).toHaveLength(0);
    });

    it('should exclude items from the current billing month', () => {
      const items = [
        { fecha: '2025-01-15', estado_pago: 'pendiente', total: 100, total_cobro: 100 },
      ];
      const result = filterCarryForwardItems(items, inicioMes, fechaLimite12Meses);
      expect(result).toHaveLength(0);
    });

    it('should exclude items older than 12 months', () => {
      const items = [
        { fecha: '2023-12-31', estado_pago: 'pendiente', total: 100, total_cobro: 100 },
        { fecha: '2023-06-15', estado_pago: 'pendiente', total: 200, total_cobro: 200 },
      ];
      const result = filterCarryForwardItems(items, inicioMes, fechaLimite12Meses);
      expect(result).toHaveLength(0);
    });

    it('should include items at exact 12-month boundary (inclusive)', () => {
      const items = [
        { fecha: '2024-01-01', estado_pago: 'pendiente', total: 100, total_cobro: 100 },
      ];
      const result = filterCarryForwardItems(items, inicioMes, fechaLimite12Meses);
      expect(result).toHaveLength(1);
    });

    it('should exclude items at exact start of current month', () => {
      const items = [
        { fecha: '2025-01-01', estado_pago: 'pendiente', total: 100, total_cobro: 100 },
      ];
      const result = filterCarryForwardItems(items, inicioMes, fechaLimite12Meses);
      expect(result).toHaveLength(0);
    });

    it('should handle empty array', () => {
      const result = filterCarryForwardItems([], inicioMes, fechaLimite12Meses);
      expect(result).toHaveLength(0);
    });
  });

  describe('No Double-Counting', () => {
    it('should not include current-month items in carry-forward', () => {
      const allItems = [
        { fecha: '2025-01-15', estado_pago: 'pendiente', total: 1000, total_cobro: 1000 },
        { fecha: '2024-12-15', estado_pago: 'pendiente', total: 500, total_cobro: 500 },
      ];

      const currentMonth = filterCurrentMonthServicios(
        allItems.map(i => ({ fecha: i.fecha, estado_pago: i.estado_pago, total: i.total })),
        inicioMes,
        finMes
      );
      const carryForward = filterCarryForwardItems(allItems, inicioMes, fechaLimite12Meses);

      // Each item should appear in exactly one list
      const allIds = [...currentMonth.map(i => i.fecha), ...carryForward.map(i => i.fecha)];
      const uniqueIds = new Set(allIds);
      expect(allIds.length).toBe(uniqueIds.size); // No duplicates
      expect(currentMonth).toHaveLength(1);
      expect(carryForward).toHaveLength(1);
      expect(currentMonth[0].fecha).toBe('2025-01-15');
      expect(carryForward[0].fecha).toBe('2024-12-15');
    });

    it('should not carry forward items from the current month even if pendiente', () => {
      const items = [
        { fecha: '2025-01-05', estado_pago: 'pendiente', total: 100, total_cobro: 100 },
        { fecha: '2025-01-20', estado_pago: 'pendiente', total: 200, total_cobro: 200 },
      ];
      const carryForward = filterCarryForwardItems(items, inicioMes, fechaLimite12Meses);
      expect(carryForward).toHaveLength(0);
    });
  });
});

describe('Subtotal Calculation with Carry-Forward', () => {
  const ivaPerc = 0.13;

  it('should include carry-forward gastos in subtotal', () => {
    const result = calcularTotales(
      [{ total_cobro: 10000, estado_pago: 'pendiente' }], // gastos mes actual
      [{ total_cobro: 5000 }], // gastos pendientes anteriores
      [], // servicios
      [], // servicios pendientes anteriores
      0, // montoHoras
      0, // mensualidades
      0, // IVA mensualidades
      ivaPerc
    );
    expect(result.gastosCliente).toBe(10000);
    expect(result.totalGastosPendientesAnteriores).toBe(5000);
    expect(result.subtotal).toBe(15000); // 10000 + 5000
  });

  it('should include carry-forward servicios profesionales in subtotal', () => {
    const result = calcularTotales(
      [], // no gastos
      [], // no gastos anteriores
      [{ costo: 10000, gastos: 500, iva: 1300, total: 11800 }], // servicios mes actual
      [{ costo: 8000, gastos: 300, iva: 1040, total: 9340 }], // servicios pendientes anteriores
      0, 0, 0, ivaPerc
    );
    // subtotal = costo SP actual (10000) + gastos SP actual (500) + costo SP ant (8000) + gastos SP ant (300)
    expect(result.subtotal).toBe(10000 + 500 + 8000 + 300);
    // IVA = IVA SP actual (1300) + IVA SP ant (1040)
    expect(result.iva).toBe(1300 + 1040);
    expect(result.total).toBe(result.subtotal + result.iva);
  });

  it('should include both carry-forward gastos and servicios', () => {
    const result = calcularTotales(
      [{ total_cobro: 5000, estado_pago: 'pendiente' }], // gastos mes
      [{ total_cobro: 3000 }], // gastos pendientes ant
      [{ costo: 10000, gastos: 0, iva: 1300, total: 11300 }], // SP mes
      [{ costo: 7000, gastos: 0, iva: 910, total: 7910 }], // SP ant
      50000, // montoHoras
      20000, // mensualidades
      2600, // IVA mensualidades
      ivaPerc
    );
    // subtotal = horas(50000) + gastos(5000) + gastosPendAnt(3000) + costoSP(10000) + mensualidades(20000) + costoSPAnt(7000)
    expect(result.subtotal).toBe(50000 + 5000 + 3000 + 10000 + 20000 + 7000);
    // IVA = (horas*ivaPerc + IVAMens) + ivaSP + ivaSPAnt = (6500 + 2600) + 1300 + 910
    expect(result.iva).toBeCloseTo(6500 + 2600 + 1300 + 910, 0);
  });

  it('should handle zero carry-forward correctly', () => {
    const result = calcularTotales(
      [{ total_cobro: 5000, estado_pago: 'pendiente' }],
      [], // no gastos anteriores
      [{ costo: 10000, gastos: 0, iva: 1300, total: 11300 }],
      [], // no SP anteriores
      0, 0, 0, ivaPerc
    );
    expect(result.totalGastosPendientesAnteriores).toBe(0);
    expect(result.totalServiciosPendientesAnteriores).toBe(0);
    expect(result.ivaServiciosPendientesAnteriores).toBe(0);
    expect(result.subtotal).toBe(5000 + 10000); // solo mes actual
  });

  it('should not include cancelled gastos in current month totals', () => {
    const result = calcularTotales(
      [
        { total_cobro: 5000, estado_pago: 'pendiente' },
        { total_cobro: 3000, estado_pago: 'cancelado' },
      ],
      [],
      [],
      [],
      0, 0, 0, ivaPerc
    );
    expect(result.gastosCliente).toBe(5000); // cancelled excluded
  });
});

describe('Payment Approval - Anti Infinite Carry-Forward', () => {
  const mesPago = '2025-01';
  const clientId = 'client-123';

  it('should mark current-month items as paid', () => {
    const items = [
      { id: 'g1', fecha: '2025-01-15', estado_pago: 'pendiente', id_cliente: clientId },
      { id: 'g2', fecha: '2025-01-20', estado_pago: 'pendiente', id_cliente: clientId },
    ];

    const result = markItemsAsPaidOnApproval(items, clientId, mesPago);
    expect(result.currentMonthMarked).toContain('g1');
    expect(result.currentMonthMarked).toContain('g2');
  });

  it('should mark carry-forward items as paid (THE BUG FIX)', () => {
    const items = [
      { id: 'g-prev1', fecha: '2024-12-10', estado_pago: 'pendiente', id_cliente: clientId },
      { id: 'g-prev2', fecha: '2024-11-05', estado_pago: 'pendiente', id_cliente: clientId },
      { id: 'g-curr', fecha: '2025-01-15', estado_pago: 'pendiente', id_cliente: clientId },
    ];

    const result = markItemsAsPaidOnApproval(items, clientId, mesPago);
    
    // CRITICAL: carry-forward items MUST be marked
    expect(result.carryForwardMarked).toContain('g-prev1');
    expect(result.carryForwardMarked).toContain('g-prev2');
    expect(result.currentMonthMarked).toContain('g-curr');
  });

  it('should NOT mark already-paid items again', () => {
    const items = [
      { id: 'g1', fecha: '2024-12-10', estado_pago: 'pagado', id_cliente: clientId },
    ];

    const result = markItemsAsPaidOnApproval(items, clientId, mesPago);
    expect(result.carryForwardMarked).not.toContain('g1');
    expect(result.currentMonthMarked).not.toContain('g1');
  });

  it('should NOT mark cancelled items', () => {
    const items = [
      { id: 'g1', fecha: '2024-12-10', estado_pago: 'cancelado', id_cliente: clientId },
      { id: 'g2', fecha: '2025-01-15', estado_pago: 'cancelado', id_cliente: clientId },
    ];

    const result = markItemsAsPaidOnApproval(items, clientId, mesPago);
    expect(result.carryForwardMarked).toHaveLength(0);
    // Note: current month filter excludes cancelado too
    expect(result.currentMonthMarked).not.toContain('g2');
  });

  it('should respect 12-month boundary on carry-forward marking', () => {
    // mesPago='2025-01' → fechaLimite = new Date(2025, 1-12, 1) = Feb 1, 2024 (JS 0-indexed months)
    const items = [
      { id: 'g-old', fecha: '2024-01-31', estado_pago: 'pendiente', id_cliente: clientId },
      { id: 'g-boundary', fecha: '2024-02-01', estado_pago: 'pendiente', id_cliente: clientId },
      { id: 'g-recent', fecha: '2024-12-15', estado_pago: 'pendiente', id_cliente: clientId },
    ];

    const result = markItemsAsPaidOnApproval(items, clientId, mesPago);
    expect(result.carryForwardMarked).not.toContain('g-old'); // Before 12-month window
    expect(result.carryForwardMarked).toContain('g-boundary'); // Exactly at 12-month boundary
    expect(result.carryForwardMarked).toContain('g-recent');
  });

  it('should not mark items from other clients', () => {
    const items = [
      { id: 'g1', fecha: '2024-12-10', estado_pago: 'pendiente', id_cliente: 'other-client' },
      { id: 'g2', fecha: '2025-01-10', estado_pago: 'pendiente', id_cliente: 'other-client' },
      { id: 'g3', fecha: '2024-12-10', estado_pago: 'pendiente', id_cliente: clientId },
    ];

    const result = markItemsAsPaidOnApproval(items, clientId, mesPago);
    expect(result.carryForwardMarked).toHaveLength(1);
    expect(result.carryForwardMarked).toContain('g3');
    expect(result.currentMonthMarked).toHaveLength(0); // no items for this client in Jan
  });
});

describe('Full Lifecycle: Carry-Forward → Payment → No Re-appear', () => {
  it('should not re-appear after payment approval', () => {
    const inicioMes = '2025-02-01';
    const fechaLimite12Meses = '2024-02-01';
    const clientId = 'client-abc';

    // Month 1 (January): Item created, unpaid
    const items = [
      { id: 'sp1', fecha: '2025-01-10', estado_pago: 'pendiente', total: 50000, total_cobro: 50000, id_cliente: clientId },
    ];

    // February: Should carry forward
    const carryForward = filterCarryForwardItems(items, inicioMes, fechaLimite12Meses);
    expect(carryForward).toHaveLength(1);
    expect(carryForward[0].id).toBe('sp1');

    // Payment approved for January
    const approval = markItemsAsPaidOnApproval(
      items.map(i => ({ ...i })),
      clientId,
      '2025-01' // paying for January
    );
    expect(approval.currentMonthMarked).toContain('sp1');

    // Simulate marking as paid
    items[0].estado_pago = 'pagado';

    // March: Should NOT carry forward anymore
    const inicioMesMarch = '2025-03-01';
    const fechaLimite12MesesMarch = '2024-03-01';
    const carryForwardMarch = filterCarryForwardItems(items, inicioMesMarch, fechaLimite12MesesMarch);
    expect(carryForwardMarch).toHaveLength(0);
  });

  it('should carry forward across multiple months until paid', () => {
    const clientId = 'client-xyz';
    
    // Item created in October, never paid
    const item = { 
      id: 'sp-oct', fecha: '2024-10-05', estado_pago: 'pendiente', 
      total: 30000, total_cobro: 30000, id_cliente: clientId 
    };

    // November: carries forward
    expect(filterCarryForwardItems([item], '2024-11-01', '2023-11-01')).toHaveLength(1);
    
    // December: still carries forward
    expect(filterCarryForwardItems([item], '2024-12-01', '2023-12-01')).toHaveLength(1);
    
    // January: still carries forward
    expect(filterCarryForwardItems([item], '2025-01-01', '2024-01-01')).toHaveLength(1);

    // Payment approved (for December billing)
    const approval = markItemsAsPaidOnApproval([item], clientId, '2024-12');
    expect(approval.carryForwardMarked).toContain('sp-oct');

    // Mark as paid
    item.estado_pago = 'pagado';

    // January: should NOT carry forward
    expect(filterCarryForwardItems([item], '2025-01-01', '2024-01-01')).toHaveLength(0);
  });

  it('should handle carry-forward with fix: approval marks ALL pending including carry-forward', () => {
    const clientId = 'client-fix';
    const items = [
      // Current month
      { id: 'curr1', fecha: '2025-01-10', estado_pago: 'pendiente', total: 10000, total_cobro: 10000, id_cliente: clientId },
      // Carry-forward from previous months
      { id: 'prev1', fecha: '2024-12-05', estado_pago: 'pendiente', total: 5000, total_cobro: 5000, id_cliente: clientId },
      { id: 'prev2', fecha: '2024-11-20', estado_pago: 'pendiente', total: 8000, total_cobro: 8000, id_cliente: clientId },
      // Already paid (should not be affected)
      { id: 'paid1', fecha: '2024-10-15', estado_pago: 'pagado', total: 3000, total_cobro: 3000, id_cliente: clientId },
      // Cancelled (should not be affected)
      { id: 'cancel1', fecha: '2024-09-01', estado_pago: 'cancelado', total: 2000, total_cobro: 2000, id_cliente: clientId },
    ];

    // Before payment: 2 carry-forward items
    const carryForward = filterCarryForwardItems(items, '2025-01-01', '2024-01-01');
    expect(carryForward).toHaveLength(2);

    // Approve payment
    const approval = markItemsAsPaidOnApproval(items, clientId, '2025-01');
    
    // Current month marked
    expect(approval.currentMonthMarked).toContain('curr1');
    
    // Carry-forward marked (THE FIX)
    expect(approval.carryForwardMarked).toContain('prev1');
    expect(approval.carryForwardMarked).toContain('prev2');
    
    // Already paid NOT re-marked
    expect(approval.carryForwardMarked).not.toContain('paid1');
    
    // Cancelled NOT marked
    expect(approval.carryForwardMarked).not.toContain('cancel1');
    expect(approval.currentMonthMarked).not.toContain('cancel1');

    // Simulate marking as paid
    items.forEach(item => {
      if (approval.currentMonthMarked.includes(item.id) || approval.carryForwardMarked.includes(item.id)) {
        item.estado_pago = 'pagado';
      }
    });

    // February: NO carry-forward
    const carryForwardFeb = filterCarryForwardItems(items, '2025-02-01', '2024-02-01');
    expect(carryForwardFeb).toHaveLength(0);
  });
});

describe('12-Month Window Edge Cases', () => {
  it('should drop items exactly at 12-month boundary (exclusive lower bound)', () => {
    // Billing period: January 2025
    // 12 month limit: January 2024
    const item = { 
      fecha: '2023-12-31', estado_pago: 'pendiente', total: 100, total_cobro: 100 
    };
    
    const result = filterCarryForwardItems([item], '2025-01-01', '2024-01-01');
    expect(result).toHaveLength(0); // December 2023 is before January 2024
  });

  it('should include items at the exact start of the 12-month window', () => {
    const item = { 
      fecha: '2024-01-01', estado_pago: 'pendiente', total: 100, total_cobro: 100 
    };
    
    const result = filterCarryForwardItems([item], '2025-01-01', '2024-01-01');
    expect(result).toHaveLength(1); // January 1, 2024 is >= limit
  });

  it('should include final day of month before billing period', () => {
    const item = { 
      fecha: '2024-12-31', estado_pago: 'pendiente', total: 100, total_cobro: 100 
    };
    
    const result = filterCarryForwardItems([item], '2025-01-01', '2024-01-01');
    expect(result).toHaveLength(1);
  });

  it('should handle leap year correctly', () => {
    // Feb 29, 2024 in billing period Mar 2025
    const item = {
      fecha: '2024-02-29', estado_pago: 'pendiente', total: 100, total_cobro: 100
    };
    
    const result = filterCarryForwardItems([item], '2025-03-01', '2024-03-01');
    expect(result).toHaveLength(0); // Feb 29 < Mar 1 2024, so excluded (it's before the window)
  });

  it('should handle year-end boundary correctly', () => {
    // Item from Dec 2024, billing Feb 2025, window starts Feb 2024
    const item = {
      fecha: '2024-12-31', estado_pago: 'pendiente', total: 100, total_cobro: 100
    };
    
    const result = filterCarryForwardItems([item], '2025-02-01', '2024-02-01');
    expect(result).toHaveLength(1);
  });
});

describe('Mixed Gastos and Servicios Carry-Forward', () => {
  it('should carry forward both gastos and servicios independently', () => {
    const gastos = [
      { fecha: '2024-12-10', estado_pago: 'pendiente', total: 5000, total_cobro: 5000 },
      { fecha: '2024-11-15', estado_pago: 'pagado', total: 3000, total_cobro: 3000 },
    ];
    const servicios = [
      { fecha: '2024-12-05', estado_pago: 'pendiente', total: 10000, total_cobro: 10000 },
      { fecha: '2024-10-01', estado_pago: 'cancelado', total: 7000, total_cobro: 7000 },
    ];

    const inicioMes = '2025-01-01';
    const fechaLimite = '2024-01-01';

    const gastosCarry = filterCarryForwardItems(gastos, inicioMes, fechaLimite);
    const serviciosCarry = filterCarryForwardItems(servicios, inicioMes, fechaLimite);

    expect(gastosCarry).toHaveLength(1);
    expect(gastosCarry[0].total_cobro).toBe(5000);
    expect(serviciosCarry).toHaveLength(1);
    expect(serviciosCarry[0].total).toBe(10000);
  });

  it('should correctly sum both in subtotal', () => {
    const result = calcularTotales(
      [], // no current gastos
      [{ total_cobro: 5000 }], // carry-forward gastos
      [], // no current SP
      [{ costo: 10000, gastos: 500, iva: 1300, total: 11800 }], // carry-forward SP
      0, 0, 0, 0.13
    );
    // subtotal = gastosPendAnt(5000) + costoSPAnt(10000) + gastosSPAnt(500)
    expect(result.subtotal).toBe(5000 + 10000 + 500);
    expect(result.iva).toBe(1300); // only IVA from SP ant
    expect(result.total).toBe(5000 + 10000 + 500 + 1300);
  });
});

describe('Group Empresas Carry-Forward', () => {
  it('should mark carry-forward items for all empresas in group on approval', () => {
    const empresaIds = ['emp-1', 'emp-2', 'emp-3'];
    const allItems = [
      // emp-1: current + carry
      { id: 'e1-curr', fecha: '2025-01-10', estado_pago: 'pendiente', id_cliente: 'emp-1' },
      { id: 'e1-prev', fecha: '2024-12-05', estado_pago: 'pendiente', id_cliente: 'emp-1' },
      // emp-2: only carry
      { id: 'e2-prev', fecha: '2024-11-20', estado_pago: 'pendiente', id_cliente: 'emp-2' },
      // emp-3: only current
      { id: 'e3-curr', fecha: '2025-01-15', estado_pago: 'pendiente', id_cliente: 'emp-3' },
    ];

    // Simulate batch marking for all empresas in group
    const allMarked: string[] = [];
    for (const empresaId of empresaIds) {
      const result = markItemsAsPaidOnApproval(allItems, empresaId, '2025-01');
      allMarked.push(...result.currentMonthMarked, ...result.carryForwardMarked);
    }

    expect(allMarked).toContain('e1-curr');
    expect(allMarked).toContain('e1-prev');
    expect(allMarked).toContain('e2-prev');
    expect(allMarked).toContain('e3-curr');
    expect(allMarked).toHaveLength(4);
  });
});

describe('Regression: Infinite Carry-Forward Bug', () => {
  it('WITHOUT fix: items would reappear every month forever', () => {
    // Simulate the OLD behavior (bug): only current month marked as paid
    const items = [
      { id: 'g1', fecha: '2024-12-10', estado_pago: 'pendiente', total_cobro: 5000 },
    ];

    // Old code only marks items WHERE fecha >= startDate AND fecha <= endDate
    // For mes_pago='2025-01', that's 2025-01-01 to 2025-01-31
    // g1 has fecha='2024-12-10', which is OUTSIDE that range
    // So it would NEVER be marked as paid!

    const startDate = '2025-01-01';
    const endDate = '2025-01-31';
    
    // Old behavior simulation
    const oldBehaviorMarked = items.filter(i => 
      i.fecha >= startDate && i.fecha <= endDate
    );
    expect(oldBehaviorMarked).toHaveLength(0); // BUG: nothing gets marked!

    // Item still pendiente → appears again next month
    const stillPendiente = items.filter(i => i.estado_pago === 'pendiente');
    expect(stillPendiente).toHaveLength(1); // Infinite carry-forward!
  });

  it('WITH fix: carry-forward items are properly marked on payment', () => {
    const items = [
      { id: 'g1', fecha: '2024-12-10', estado_pago: 'pendiente', total_cobro: 5000, id_cliente: 'client-1' },
    ];

    const result = markItemsAsPaidOnApproval(items, 'client-1', '2025-01');
    expect(result.carryForwardMarked).toContain('g1'); // FIX: carry-forward IS marked

    // After marking as paid, should not appear again
    items[0].estado_pago = 'pagado';
    const carryForwardNext = filterCarryForwardItems(
      items.map(i => ({ ...i, total: i.total_cobro })),
      '2025-02-01',
      '2024-02-01'
    );
    expect(carryForwardNext).toHaveLength(0); // No more infinite carry-forward!
  });

  it('should handle multi-month accumulation then single payment correctly', () => {
    const clientId = 'multi-month';
    const items = [
      { id: 'oct', fecha: '2024-10-05', estado_pago: 'pendiente', total: 1000, total_cobro: 1000, id_cliente: clientId },
      { id: 'nov', fecha: '2024-11-10', estado_pago: 'pendiente', total: 2000, total_cobro: 2000, id_cliente: clientId },
      { id: 'dec', fecha: '2024-12-15', estado_pago: 'pendiente', total: 3000, total_cobro: 3000, id_cliente: clientId },
      { id: 'jan', fecha: '2025-01-20', estado_pago: 'pendiente', total: 4000, total_cobro: 4000, id_cliente: clientId },
    ];

    // Before payment: 3 carry-forward items (oct, nov, dec)
    const carryForward = filterCarryForwardItems(items, '2025-01-01', '2024-01-01');
    expect(carryForward).toHaveLength(3);
    
    // Total being charged = carry-forward + current month
    const totalCarryForward = carryForward.reduce((sum, i) => sum + i.total_cobro!, 0);
    expect(totalCarryForward).toBe(1000 + 2000 + 3000); // 6000

    // Payment approved for January
    const approval = markItemsAsPaidOnApproval(items, clientId, '2025-01');
    expect(approval.currentMonthMarked).toContain('jan');
    expect(approval.carryForwardMarked).toContain('oct');
    expect(approval.carryForwardMarked).toContain('nov');
    expect(approval.carryForwardMarked).toContain('dec');

    // Simulate payment
    items.forEach(item => {
      if ([...approval.currentMonthMarked, ...approval.carryForwardMarked].includes(item.id)) {
        item.estado_pago = 'pagado';
      }
    });

    // February: ALL clear, no carry-forward
    const carryForwardFeb = filterCarryForwardItems(items, '2025-02-01', '2024-02-01');
    expect(carryForwardFeb).toHaveLength(0);
  });
});

// ============================================================================
// TRABAJOS POR HORA (TPH) CARRY-FORWARD TESTS
// ============================================================================

/**
 * Simulates carry-forward filtering for trabajos_por_hora.
 * Same basic logic as other carry-forward but items use duracion field.
 */
function filterCarryForwardTPH(
  items: Array<{ fecha: string; estado_pago: string; duracion: string; caso_asignado?: string }>,
  inicioMes: string,
  fechaLimite12Meses: string
): typeof items {
  return items.filter(item =>
    item.estado_pago === 'pendiente' &&
    item.fecha < inicioMes &&
    item.fecha >= fechaLimite12Meses
  );
}

/**
 * Calculates total hours and cost from TPH items (matching real implementation).
 */
function calcularTotalesTPH(
  items: Array<{ duracion: string }>,
  tarifaHora: number
): { totalMinutos: number; totalHoras: number; monto: number } {
  let totalMinutos = 0;
  items.forEach(t => {
    if (t.duracion) {
      if (t.duracion.includes(':')) {
        const [h, m] = t.duracion.split(':').map(Number);
        totalMinutos += (h * 60) + m;
      } else {
        totalMinutos += Math.round(parseFloat(t.duracion) * 60);
      }
    }
  });
  const totalHoras = totalMinutos / 60;
  const monto = totalHoras * tarifaHora;
  return { totalMinutos, totalHoras, monto };
}

/**
 * Simulates payment-approval for TPH via caso_asignado (for empresas).
 */
function markTPHAsPaidViaCasos(
  allTPH: Array<{ id: string; fecha: string; estado_pago: string; caso_asignado: string }>,
  casoIds: string[],
  mesPago: string
): { currentMonthMarked: string[]; carryForwardMarked: string[] } {
  const [yearStr, monthStr] = mesPago.split('-');
  const yearNum = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  const startDate = `${yearStr}-${monthStr}-01`;
  const endDate = new Date(yearNum, monthNum, 0).toISOString().split('T')[0];
  const fechaLimite12Meses = new Date(yearNum, monthNum - 12, 1).toISOString().split('T')[0];

  const currentMonthMarked = allTPH
    .filter(item =>
      casoIds.includes(item.caso_asignado) &&
      item.fecha >= startDate &&
      item.fecha <= endDate
    )
    .map(item => item.id);

  const carryForwardMarked = allTPH
    .filter(item =>
      casoIds.includes(item.caso_asignado) &&
      item.estado_pago === 'pendiente' &&
      item.fecha < startDate &&
      item.fecha >= fechaLimite12Meses
    )
    .map(item => item.id);

  return { currentMonthMarked, carryForwardMarked };
}

describe('TPH Carry-Forward Filtering', () => {
  const inicioMes = '2025-01-01';
  const finMes = '2025-01-31';
  const fechaLimite12Meses = '2024-01-01';

  it('should carry forward pending TPH from previous months', () => {
    const items = [
      { fecha: '2024-12-10', estado_pago: 'pendiente', duracion: '2:30', caso_asignado: 'c1' },
      { fecha: '2024-11-05', estado_pago: 'pendiente', duracion: '1:00', caso_asignado: 'c1' },
    ];
    const result = filterCarryForwardTPH(items, inicioMes, fechaLimite12Meses);
    expect(result).toHaveLength(2);
  });

  it('should NOT carry forward already paid TPH', () => {
    const items = [
      { fecha: '2024-12-10', estado_pago: 'pagado', duracion: '2:30', caso_asignado: 'c1' },
      { fecha: '2024-11-05', estado_pago: 'pendiente', duracion: '1:00', caso_asignado: 'c1' },
    ];
    const result = filterCarryForwardTPH(items, inicioMes, fechaLimite12Meses);
    expect(result).toHaveLength(1);
    expect(result[0].duracion).toBe('1:00');
  });

  it('should NOT carry forward TPH from current month', () => {
    const items = [
      { fecha: '2025-01-15', estado_pago: 'pendiente', duracion: '3:00', caso_asignado: 'c1' },
    ];
    const result = filterCarryForwardTPH(items, inicioMes, fechaLimite12Meses);
    expect(result).toHaveLength(0);
  });

  it('should NOT carry forward TPH older than 12 months', () => {
    const items = [
      { fecha: '2023-12-31', estado_pago: 'pendiente', duracion: '5:00', caso_asignado: 'c1' },
    ];
    const result = filterCarryForwardTPH(items, inicioMes, fechaLimite12Meses);
    expect(result).toHaveLength(0);
  });

  it('should include TPH exactly at the 12-month boundary', () => {
    const items = [
      { fecha: '2024-01-01', estado_pago: 'pendiente', duracion: '1:00', caso_asignado: 'c1' },
    ];
    const result = filterCarryForwardTPH(items, inicioMes, fechaLimite12Meses);
    expect(result).toHaveLength(1);
  });
});

describe('TPH Hours and Cost Calculation', () => {
  it('should correctly parse HH:MM duration format', () => {
    const items = [
      { duracion: '2:30' },
      { duracion: '1:15' },
    ];
    const result = calcularTotalesTPH(items, 90000);
    expect(result.totalMinutos).toBe(225); // 150 + 75
    expect(result.totalHoras).toBeCloseTo(3.75);
    expect(result.monto).toBeCloseTo(3.75 * 90000);
  });

  it('should correctly parse decimal duration format', () => {
    const items = [
      { duracion: '2.5' },
      { duracion: '1.25' },
    ];
    const result = calcularTotalesTPH(items, 90000);
    expect(result.totalMinutos).toBe(225); // 150 + 75
    expect(result.totalHoras).toBeCloseTo(3.75);
    expect(result.monto).toBeCloseTo(3.75 * 90000);
  });

  it('should use the correct tarifa_hora for empresas', () => {
    const items = [{ duracion: '1:00' }];
    const customTarifa = 120000;
    const result = calcularTotalesTPH(items, customTarifa);
    expect(result.monto).toBe(120000);
  });

  it('should return zero for empty items', () => {
    const result = calcularTotalesTPH([], 90000);
    expect(result.totalMinutos).toBe(0);
    expect(result.totalHoras).toBe(0);
    expect(result.monto).toBe(0);
  });

  it('should add carry-forward TPH monto to subtotal', () => {
    const currentTPH = [{ duracion: '2:00' }];
    const carryForwardTPH = [{ duracion: '1:30' }, { duracion: '0:30' }];
    const tarifaHora = 90000;
    const ivaPerc = 0.13;

    const currentResult = calcularTotalesTPH(currentTPH, tarifaHora);
    const carryResult = calcularTotalesTPH(carryForwardTPH, tarifaHora);

    const subtotal = currentResult.monto + carryResult.monto + 50000; // + some gastos
    const iva = (currentResult.monto * ivaPerc) + (carryResult.monto * ivaPerc);
    const total = subtotal + iva;

    // Current: 2h * 90000 = 180000
    // Carry: 2h * 90000 = 180000
    // Gastos: 50000
    expect(subtotal).toBe(180000 + 180000 + 50000);
    expect(iva).toBeCloseTo((180000 + 180000) * 0.13);
    expect(total).toBeCloseTo(subtotal + iva);
  });
});

describe('TPH Payment Marking via Casos', () => {
  it('should mark current month and carry-forward TPH via caso_asignado', () => {
    const casoIds = ['caso1', 'caso2'];
    const allTPH = [
      { id: 'tph1', fecha: '2025-01-10', estado_pago: 'pendiente', caso_asignado: 'caso1' },
      { id: 'tph2', fecha: '2024-12-15', estado_pago: 'pendiente', caso_asignado: 'caso2' },
      { id: 'tph3', fecha: '2024-11-05', estado_pago: 'pendiente', caso_asignado: 'caso1' },
      { id: 'tph4', fecha: '2025-01-20', estado_pago: 'pendiente', caso_asignado: 'other_caso' },
    ];

    const result = markTPHAsPaidViaCasos(allTPH, casoIds, '2025-01');
    expect(result.currentMonthMarked).toEqual(['tph1']);
    expect(result.carryForwardMarked).toContain('tph2');
    expect(result.carryForwardMarked).toContain('tph3');
    expect(result.carryForwardMarked).not.toContain('tph4');
  });

  it('should NOT mark TPH from unrelated casos', () => {
    const casoIds = ['caso1'];
    const allTPH = [
      { id: 'tph1', fecha: '2024-12-15', estado_pago: 'pendiente', caso_asignado: 'other_caso' },
    ];

    const result = markTPHAsPaidViaCasos(allTPH, casoIds, '2025-01');
    expect(result.currentMonthMarked).toHaveLength(0);
    expect(result.carryForwardMarked).toHaveLength(0);
  });

  it('should prevent infinite carry-forward after payment', () => {
    const casoIds = ['caso1'];
    const allTPH = [
      { id: 'tph1', fecha: '2024-11-10', estado_pago: 'pendiente', caso_asignado: 'caso1' },
      { id: 'tph2', fecha: '2024-12-15', estado_pago: 'pendiente', caso_asignado: 'caso1' },
      { id: 'tph3', fecha: '2025-01-20', estado_pago: 'pendiente', caso_asignado: 'caso1' },
    ];

    // Before payment: 2 carry-forward items
    const carryBefore = filterCarryForwardTPH(allTPH, '2025-01-01', '2024-01-01');
    expect(carryBefore).toHaveLength(2);

    // Payment for January
    const approval = markTPHAsPaidViaCasos(allTPH, casoIds, '2025-01');
    expect(approval.currentMonthMarked).toEqual(['tph3']);
    expect(approval.carryForwardMarked).toContain('tph1');
    expect(approval.carryForwardMarked).toContain('tph2');

    // Simulate marking as paid
    allTPH.forEach(item => {
      if ([...approval.currentMonthMarked, ...approval.carryForwardMarked].includes(item.id)) {
        item.estado_pago = 'pagado';
      }
    });

    // February: No more carry-forward
    const carryAfter = filterCarryForwardTPH(allTPH, '2025-02-01', '2024-02-01');
    expect(carryAfter).toHaveLength(0);
  });
});
