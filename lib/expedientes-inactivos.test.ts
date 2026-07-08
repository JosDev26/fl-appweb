import { describe, it, expect } from 'vitest'

// ============================================================================
// Tests unitarios para las funciones puras de lib/expedientes-inactivos.ts
//
// No tocan Supabase. Solo prueban:
//   - diasDesde
//   - tieneModalidadActiva / estaExcluidoPorEstado / filtrarSolicitudesActivas
//   - construirMapaUltimoMovimiento
//   - construirListaInactivos
//   - aplicarFiltrosUi / paginar
// ============================================================================

import {
  diasDesde,
  tieneModalidadActiva,
  estaExcluidoPorEstado,
  filtrarSolicitudesActivas,
  estaCasoExcluido,
  filtrarCasosActivos,
  construirMapaUltimoMovDinero,
  construirMapaUltimoMovActualizacion,
  expandReceiptsToTuples,
  construirListaInactivos,
  aplicarFiltrosUi,
  paginar,
  INACTIVITY_DAYS,
  type SolicitudBase,
  type CasoBase,
} from '@/lib/expedientes-inactivos'

describe('diasDesde', () => {
  it('devuelve Infinity para fecha nula', () => {
    expect(diasDesde(null)).toBe(Infinity)
  })

  it('devuelve 0 para hoy', () => {
    const hoy = new Date().toISOString()
    expect(diasDesde(hoy)).toBe(0)
  })

  it('cuenta días enteros (medianoche a medianoche)', () => {
    const hace16dias = new Date()
    hace16dias.setDate(hace16dias.getDate() - 16)
    hace16dias.setHours(23, 59, 59, 0)
    expect(diasDesde(hace16dias.toISOString())).toBe(16)
  })

  it('no devuelve negativos para fechas futuras (puede devolver <0)', () => {
    const futuro = new Date()
    futuro.setDate(futuro.getDate() + 5)
    expect(diasDesde(futuro.toISOString())).toBe(-5)
  })
})

describe('tieneModalidadActiva', () => {
  it('true para mensualidad', () => {
    expect(tieneModalidadActiva('Mensualidad')).toBe(true)
    expect(tieneModalidadActiva('mensualidad')).toBe(true)
  })

  it('true para pago_unico y variantes', () => {
    expect(tieneModalidadActiva('pago_unico')).toBe(true)
    expect(tieneModalidadActiva('Único pago')).toBe(true)
    expect(tieneModalidadActiva('unico pago')).toBe(true)
  })

  it('true para etapa y etapa finalizada', () => {
    expect(tieneModalidadActiva('etapa')).toBe(true)
    expect(tieneModalidadActiva('etapa finalizada')).toBe(true)
  })

  it('false para null o vacío', () => {
    expect(tieneModalidadActiva(null)).toBe(false)
    expect(tieneModalidadActiva('')).toBe(false)
  })

  it('false para modalidad no listada', () => {
    expect(tieneModalidadActiva('otra_modalidad')).toBe(false)
  })
})

describe('estaExcluidoPorEstado', () => {
  it('true para finalizado, pagado, cancelado', () => {
    expect(estaExcluidoPorEstado('finalizado')).toBe(true)
    expect(estaExcluidoPorEstado('PAGADO')).toBe(true)
    expect(estaExcluidoPorEstado('Cancelado')).toBe(true)
  })

  it('false para pendiente u otros', () => {
    expect(estaExcluidoPorEstado('pendiente')).toBe(false)
    expect(estaExcluidoPorEstado('en proceso')).toBe(false)
  })

  it('false para null o vacío', () => {
    expect(estaExcluidoPorEstado(null)).toBe(false)
    expect(estaExcluidoPorEstado('')).toBe(false)
  })
})

describe('filtrarSolicitudesActivas', () => {
  const base = (over: Partial<SolicitudBase> = {}): SolicitudBase => ({
    id: 's1',
    titulo: 'T',
    id_cliente: 'c1',
    modalidad_pago: 'mensualidad',
    etapa_actual: 'etapa',
    estado_pago: 'pendiente',
    expediente: 'E1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  })

  it('filtra modalidades inactivas', () => {
    const res = filtrarSolicitudesActivas([
      base({ id: 'a', modalidad_pago: 'mensualidad' }),
      base({ id: 'b', modalidad_pago: 'otra_cosa' }),
    ])
    expect(res.map(s => s.id)).toEqual(['a'])
  })

  it('filtra estados excluidos', () => {
    const res = filtrarSolicitudesActivas([
      base({ id: 'a', estado_pago: 'pendiente' }),
      base({ id: 'b', estado_pago: 'finalizado' }),
      base({ id: 'c', estado_pago: 'cancelado' }),
    ])
    expect(res.map(s => s.id)).toEqual(['a'])
  })

  it('devuelve [] si todas se filtran', () => {
    const res = filtrarSolicitudesActivas([base({ estado_pago: 'pagado' })])
    expect(res).toEqual([])
  })
})

describe('estaCasoExcluido', () => {
  it('true para finalizado y cancelado', () => {
    expect(estaCasoExcluido('finalizado')).toBe(true)
    expect(estaCasoExcluido('Cancelado')).toBe(true)
  })

  it('false para otros estados', () => {
    expect(estaCasoExcluido('activo')).toBe(false)
    expect(estaCasoExcluido('en proceso')).toBe(false)
  })

  it('false para null o vacío', () => {
    expect(estaCasoExcluido(null)).toBe(false)
    expect(estaCasoExcluido('')).toBe(false)
  })
})

describe('filtrarCasosActivos', () => {
  const baseCaso = (over: Partial<CasoBase> = {}): CasoBase => ({
    id: 'c1',
    nombre: 'Caso 1',
    estado: 'activo',
    expediente: 'EXP1',
    id_cliente: 'cl1',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  })

  it('excluye finalizado y cancelado', () => {
    const res = filtrarCasosActivos([
      baseCaso({ id: 'a', estado: 'activo' }),
      baseCaso({ id: 'b', estado: 'finalizado' }),
      baseCaso({ id: 'c', estado: 'Cancelado' }),
    ])
    expect(res.map(c => c.id)).toEqual(['a'])
  })
})

describe('construirMapaUltimoMovDinero', () => {
  it('combina gastos, sp, mensualidad y receipts por expediente', () => {
    const gastos = [{ id_caso: 's2', fecha: '2026-06-20T00:00:00Z' }]
    const sp = [{ id_solicitud_sheets: 's1', id_caso: null, fecha: '2026-06-01T00:00:00Z' }]
    const mp = [{ solicitud_id: 's1', created_at: '2026-07-01T00:00:00Z' }]
    const receipts = [{ expId: 'c1', fecha: '2026-07-10T00:00:00Z' }]

    const map = construirMapaUltimoMovDinero(gastos as any, sp as any, mp as any, receipts, ['s1', 's2'], ['c1'])

    expect(map.get('s1')).toEqual({ fecha: '2026-07-01T00:00:00Z', tipo: 'Mensualidad' })
    expect(map.get('s2')).toEqual({ fecha: '2026-06-20T00:00:00Z', tipo: 'Gasto' })
    expect(map.get('c1')).toEqual({ fecha: '2026-07-10T00:00:00Z', tipo: 'Pago' })
  })

  it('toma la fecha más reciente cuando hay varias fuentes', () => {
    const gastos = [{ id_caso: 's1', fecha: '2026-06-01T00:00:00Z' }]
    const mp = [{ solicitud_id: 's1', created_at: '2026-07-01T00:00:00Z' }]
    const map = construirMapaUltimoMovDinero(gastos as any, [] as any, mp as any, [], ['s1'], [])
    expect(map.get('s1')?.tipo).toBe('Mensualidad')
  })

  it('ignora ids que no están en solicitudIds/casoIds', () => {
    const gastos = [{ id_caso: 'sX', fecha: '2026-06-01T00:00:00Z' }]
    const map = construirMapaUltimoMovDinero(gastos as any, [] as any, [] as any, [], ['s1'], ['c1'])
    expect(map.size).toBe(0)
  })

  it('usa id_solicitud_sheets primero, luego id_caso para sp', () => {
    const sp = [{ id_solicitud_sheets: 's1', id_caso: 's2', fecha: '2026-06-01T00:00:00Z' }]
    const map = construirMapaUltimoMovDinero([] as any, sp as any, [] as any, [], ['s1', 's2'], [])
    expect(map.get('s1')?.tipo).toBe('Servicio Profesional')
    expect(map.has('s2')).toBe(false)
  })

  it('NO incluye trabajos_por_hora (tph solo alimenta actualizaciones)', () => {
    const gastos = [{ id_caso: 'c1', fecha: '2026-06-01T00:00:00Z' }]
    const mapConGasto = construirMapaUltimoMovDinero(gastos as any, [] as any, [] as any, [], ['c1'], [])
    expect(mapConGasto.has('c1')).toBe(true)
    // tph no se pasa al mapa de dinero; un caso con solo tph no aparece en dinero
    const mapSoloTph = construirMapaUltimoMovDinero([] as any, [] as any, [] as any, [], [], ['c1'])
    expect(mapSoloTph.has('c1')).toBe(false)
    expect(mapSoloTph.size).toBe(0)
  })
})

describe('construirMapaUltimoMovActualizacion', () => {
  it('combina actualizaciones (solicitudes) y tph (casos)', () => {
    const acts = [
      { id_solicitud: 's1', tiempo: '2026-06-10T00:00:00Z' },
      { id_solicitud: 's1', tiempo: '2026-06-01T00:00:00Z' },
    ]
    const tph = [{ caso_asignado: 'c1', fecha: '2026-06-20T00:00:00Z' }]
    const map = construirMapaUltimoMovActualizacion(acts as any, tph as any, ['s1'], ['c1'])
    expect(map.get('s1')).toEqual({ fecha: '2026-06-10T00:00:00Z', tipo: 'Actualización' })
    expect(map.get('c1')).toEqual({ fecha: '2026-06-20T00:00:00Z', tipo: 'Trabajo por Hora' })
  })

  it('tph solo cuenta para casos, no para solicitudes', () => {
    const tph = [{ caso_asignado: 's1', fecha: '2026-06-20T00:00:00Z' }]
    const map = construirMapaUltimoMovActualizacion([] as any, tph as any, ['s1'], ['c1'])
    expect(map.has('s1')).toBe(false)
  })
})

describe('expandReceiptsToTuples', () => {
  it('expande solicitudes y casos del JSONB', () => {
    const receipts = [
      { reviewed_at: '2026-07-01T00:00:00Z', solicitud_caso_id_pagados: { solicitudes: ['s1', 's2'], casos: ['c1'] } },
      { reviewed_at: '2026-07-05T00:00:00Z', solicitud_caso_id_pagados: null },
    ]
    const tuples = expandReceiptsToTuples(receipts, ['s1', 's2'], ['c1'])
    expect(tuples).toEqual([
      { expId: 's1', fecha: '2026-07-01T00:00:00Z' },
      { expId: 's2', fecha: '2026-07-01T00:00:00Z' },
      { expId: 'c1', fecha: '2026-07-01T00:00:00Z' },
    ])
  })

  it('filtra ids que no están activos', () => {
    const receipts = [
      { reviewed_at: '2026-07-01T00:00:00Z', solicitud_caso_id_pagados: { solicitudes: ['s1', 'sX'], casos: [] } },
    ]
    const tuples = expandReceiptsToTuples(receipts, ['s1'], [])
    expect(tuples).toEqual([{ expId: 's1', fecha: '2026-07-01T00:00:00Z' }])
  })

  it('ignora receipts sin reviewed_at', () => {
    const receipts = [{ reviewed_at: null, solicitud_caso_id_pagados: { solicitudes: ['s1'], casos: [] } }]
    expect(expandReceiptsToTuples(receipts, ['s1'], [])).toEqual([])
  })
})

describe('construirListaInactivos', () => {
  const base = (over: Partial<SolicitudBase> = {}): SolicitudBase => ({
    id: 's1',
    titulo: 'T',
    id_cliente: 'c1',
    modalidad_pago: 'mensualidad',
    etapa_actual: 'etapa',
    estado_pago: 'pendiente',
    expediente: 'E1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  })

  it('incluye solo los inactivos en algún rubro', () => {
    const hoy = new Date()
    const hace5 = new Date(hoy); hace5.setDate(hace5.getDate() - 5)
    const hace20 = new Date(hoy); hace20.setDate(hace20.getDate() - 20)
    const hace2 = new Date(hoy); hace2.setDate(hace2.getDate() - 2)

    const solicitudes = [
      base({ id: 'a', created_at: hace2.toISOString() }),
      base({ id: 'b', created_at: hace2.toISOString() }),
    ]
    const dineroMap = new Map([
      ['a', { fecha: hace5.toISOString(), tipo: 'Gasto' as const }],
      ['b', { fecha: hace20.toISOString(), tipo: 'Gasto' as const }],
    ])
    const actMap = new Map([
      ['a', { fecha: hace5.toISOString(), tipo: 'Actualización' as const }],
    ])
    const res = construirListaInactivos(solicitudes, [], dineroMap, actMap, new Map([['c1', 'Cliente 1']]), new Map())
    // a: dinero 5d + act 5d -> no inactivo en ninguno -> excluido
    // b: dinero 20d (inactivo) -> incluido
    expect(res.length).toBe(1)
    expect(res[0].id).toBe('b')
  })

  it('usa created_at como fallback si no hay actividad', () => {
    const muyViejo = new Date(); muyViejo.setDate(muyViejo.getDate() - 30)
    const solicitudes = [base({ id: 'a', created_at: muyViejo.toISOString() })]
    const res = construirListaInactivos(solicitudes, [], new Map(), new Map(), new Map([['c1', 'X']]), new Map())
    expect(res.length).toBe(1)
    expect(res[0].nuncaTuvoActividad).toBe(true)
    expect(res[0].tipoUltimoMovimiento).toBeNull()
    expect(res[0].diasInactivo).toBe(30)
    expect(res[0].diasInactivoDinero).toBe(30)
    expect(res[0].diasInactivoActualizacion).toBe(30)
  })

  it('ordena por diasInactivo (última actividad) descendente', () => {
    const hoy = new Date()
    const hace30 = new Date(hoy); hace30.setDate(hace30.getDate() - 30)
    const hace60 = new Date(hoy); hace60.setDate(hace60.getDate() - 60)

    const solicitudes = [base({ id: 'a' }), base({ id: 'b' })]
    const dineroMap = new Map([
      ['a', { fecha: hace30.toISOString(), tipo: 'Gasto' as const }],
      ['b', { fecha: hace60.toISOString(), tipo: 'Gasto' as const }],
    ])
    const actMap = new Map([
      ['a', { fecha: hace30.toISOString(), tipo: 'Actualización' as const }],
      ['b', { fecha: hace60.toISOString(), tipo: 'Actualización' as const }],
    ])
    const res = construirListaInactivos(solicitudes, [], dineroMap, actMap, new Map([['c1', 'X']]), new Map())
    expect(res[0].id).toBe('b') // 60 días primero
    expect(res[1].id).toBe('a')
  })

  it('respeta umbral personalizado', () => {
    const hoy = new Date()
    const hace20 = new Date(hoy); hace20.setDate(hace20.getDate() - 20)
    const solicitudes = [base({ id: 'a' })]
    const dineroMap = new Map([['a', { fecha: hace20.toISOString(), tipo: 'Gasto' as const }]])
    const actMap = new Map([['a', { fecha: hace20.toISOString(), tipo: 'Actualización' as const }]])
    const res30 = construirListaInactivos(solicitudes, [], dineroMap, actMap, new Map([['c1', 'X']]), new Map(), 30)
    const res15 = construirListaInactivos(solicitudes, [], dineroMap, actMap, new Map([['c1', 'X']]), new Map(), 15)
    expect(res30.length).toBe(0)
    expect(res15.length).toBe(1)
  })

  it('incluye ultimoPago cuando existe', () => {
    const hoy = new Date()
    const hace20 = new Date(hoy); hace20.setDate(hace20.getDate() - 20)
    const solicitudes = [base({ id: 'a', id_cliente: 'c1' })]
    const dineroMap = new Map([['a', { fecha: hace20.toISOString(), tipo: 'Gasto' as const }]])
    const pagos = new Map([['c1', { fecha: '2026-06-01T00:00:00Z', mes: '2026-06' }]])
    const res = construirListaInactivos(solicitudes, [], dineroMap, new Map(), new Map([['c1', 'X']]), pagos)
    expect(res[0].ultimoPago).toEqual({ fecha: '2026-06-01T00:00:00Z', mes: '2026-06' })
  })

  it('incluye casos inactivos por actualizacion (tph) sin dinero', () => {
    const hoy = new Date()
    const hace30 = new Date(hoy); hace30.setDate(hace30.getDate() - 30)
    const casos = [{
      id: 'c1', nombre: 'Caso X', estado: 'activo', expediente: 'EXP',
      id_cliente: 'cl1', created_at: hace30.toISOString(),
    }] as CasoBase[]
    // tph solo alimenta actualizaciones; dinero vacío -> fallback created_at (30d)
    const tphEntry = { fecha: hace30.toISOString(), tipo: 'Trabajo por Hora' as const }
    const dineroMap = new Map<string, any>()
    const actMap = new Map([['c1', tphEntry]])
    const res = construirListaInactivos([], casos, dineroMap, actMap, new Map([['cl1', 'Cliente Caso']]), new Map())
    expect(res.length).toBe(1)
    expect(res[0].tipoExpediente).toBe('caso')
    expect(res[0].titulo).toBe('Caso X')
    // Dinero: sin movimiento -> fallback created_at (30d)
    expect(res[0].diasInactivoDinero).toBe(30)
    expect(res[0].ultimoMovDinero).toBeNull()
    // Actualización: tph de hace 30d
    expect(res[0].diasInactivoActualizacion).toBe(30)
    expect(res[0].ultimoMovActualizacion).toBe(hace30.toISOString())
  })

  it('caso con tph reciente NO es inactivo por actualizacion (solo por dinero si created_at viejo)', () => {
    const hoy = new Date()
    const hace2 = new Date(hoy); hace2.setDate(hace2.getDate() - 2)
    const hace60 = new Date(hoy); hace60.setDate(hace60.getDate() - 60)
    const casos = [{
      id: 'c1', nombre: 'Caso Act', estado: 'activo', expediente: 'EXP',
      id_cliente: 'cl1', created_at: hace60.toISOString(),
    }] as CasoBase[]
    const tphReciente = { fecha: hace2.toISOString(), tipo: 'Trabajo por Hora' as const }
    const dineroMap = new Map<string, any>()
    const actMap = new Map([['c1', tphReciente]])
    const res = construirListaInactivos([], casos, dineroMap, actMap, new Map([['cl1', 'X']]), new Map())
    // Actualización fresca (2d) pero dinero fallback created_at (60d) -> inactivo por dinero
    expect(res.length).toBe(1)
    expect(res[0].diasInactivoActualizacion).toBe(2)
    expect(res[0].diasInactivoDinero).toBe(60)
  })

  it('INACTIVITY_DAYS es 15', () => {
    expect(INACTIVITY_DAYS).toBe(15)
  })
})

describe('aplicarFiltrosUi', () => {
  const inactivos = [
    { id: '1', clienteNombre: 'Juan', modalidad_pago: 'mensualidad', diasInactivo: 20 } as any,
    { id: '2', clienteNombre: 'Maria', modalidad_pago: 'pago_unico', diasInactivo: 25 } as any,
    { id: '3', clienteNombre: 'Pedro', modalidad_pago: 'etapa finalizada', diasInactivo: 30 } as any,
  ]

  it('all no filtra nada', () => {
    expect(aplicarFiltrosUi(inactivos, 'all', '').length).toBe(3)
  })

  it('filtra mensualidad', () => {
    const res = aplicarFiltrosUi(inactivos, 'mensualidad', '')
    expect(res.map(r => r.id)).toEqual(['1'])
  })

  it('filtra pago_unico (incluye único)', () => {
    const res = aplicarFiltrosUi(inactivos, 'pago_unico', '')
    expect(res.map(r => r.id)).toEqual(['2'])
  })

  it('filtra etapa', () => {
    const res = aplicarFiltrosUi(inactivos, 'etapa', '')
    expect(res.map(r => r.id)).toEqual(['3'])
  })

  it('filtra por cliente (case-insensitive)', () => {
    const res = aplicarFiltrosUi(inactivos, 'all', 'JUAN')
    expect(res.map(r => r.id)).toEqual(['1'])
  })

  it('combina modalidad + cliente', () => {
    const res = aplicarFiltrosUi(inactivos, 'etapa', 'pedro')
    expect(res.map(r => r.id)).toEqual(['3'])
  })
})

describe('paginar', () => {
  const arr = Array.from({ length: 25 }, (_, i) => i)

  it('página 1 con size 20', () => {
    const r = paginar(arr, 1, 20)
    expect(r.total).toBe(25)
    expect(r.totalPages).toBe(2)
    expect(r.paginado.length).toBe(20)
    expect(r.paginado[0]).toBe(0)
  })

  it('página 2 con size 20', () => {
    const r = paginar(arr, 2, 20)
    expect(r.paginado.length).toBe(5)
    expect(r.paginado[0]).toBe(20)
  })

  it('página fuera de rango -> vacío', () => {
    const r = paginar(arr, 10, 20)
    expect(r.paginado).toEqual([])
    expect(r.totalPages).toBe(2)
  })

  it('page < 1 se trata como 1', () => {
    const r = paginar(arr, 0, 20)
    expect(r.paginado.length).toBe(20)
  })
})
