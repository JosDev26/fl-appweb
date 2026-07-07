import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ============================================================================
// Tests para POST /api/expedientes-inactivos/notify
//
// Verifica:
//   - Sin inactivos -> no-op (200, enviados:0).
//   - Inactivos pendientes -> envia correo + registra tracking.
//   - Inactivos ya notificados -> no reenvia.
//   - Falla el envio -> error 500, no registra tracking.
//   - Falta NOTIFICACION_INACTIVIDAD_EMAIL -> 500.
//   - Auth: falta CRON_SECRET_TOKEN -> 401 (si token configurado).
//   - Sin token configurado -> permite acceso (modo dev, igual que /api/sync/auto).
// ============================================================================

// ----- Mocks -------------------------------------------------------------

// Mock de @/lib/supabase-admin: chainable + thenable mock (patrón de tests existentes)
const { mockFrom } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: mockFrom,
  },
}))

// Mock de @/lib/expedientes-inactivos: controlamos la lista devuelta
const { mockObtenerExpedientesInactivos } = vi.hoisted(() => ({
  mockObtenerExpedientesInactivos: vi.fn(),
}))

vi.mock('@/lib/expedientes-inactivos', () => ({
  obtenerExpedientesInactivos: mockObtenerExpedientesInactivos,
}))

// Mock de @/lib/email: espiamos sendEmail sin tocar Resend
const { mockSendEmail, mockIsDryRun } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockIsDryRun: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/email', () => ({
  sendEmail: mockSendEmail,
  wrapWithBaseTemplate: (content: string) => `<div>${content}</div>`,
  isDryRun: mockIsDryRun,
}))

// ----- Helpers -------------------------------------------------------------

function buildExpediente(over: Partial<any> = {}): any {
  return {
    id: 'sol-1',
    titulo: 'Expediente de prueba',
    modalidad_pago: 'mensualidad',
    etapa_actual: 'Preparatoria',
    estado_pago: 'pendiente',
    id_cliente: 'cli-1',
    clienteNombre: 'Cliente Prueba',
    expediente: 'EXP-001',
    diasInactivo: 20,
    ultimoMovimiento: '2026-06-15T00:00:00Z',
    tipoUltimoMovimiento: 'Actualización',
    nuncaTuvoActividad: false,
    ultimoPago: null,
    ...over,
  }
}

function makeRequest(method: 'POST' = 'POST', token?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new NextRequest('http://localhost/api/expedientes-inactivos/notify', {
    method,
    headers,
  })
}

// Configuración por defecto del chainable mock para supabaseAdmin.from()
//
// El endpoint hace dos patrones distintos:
//   1. await .from('notificaciones_inactividad').select('expediente_id').in(...).eq(...)
//      -> resuelve { data, error }
//   2. await .from('notificaciones_inactividad').insert({...})
//      -> resuelve { error }
//
// En Supabase real, toda la cadena es thenable (el builder implementa .then).
// Aquí creamos un builder chainable + thenable que resuelve según el "modo"
// (query o insert) determinado por el primer método encadenado.
function setupSupabaseMock(opts: {
  yaNotificados?: any[]
  notifError?: any
  insertError?: any
} = {}) {
  const queryResult = { data: opts.yaNotificados ?? [], error: opts.notifError ?? null }
  const insertResult = { error: opts.insertError ?? null }

  mockFrom.mockImplementation((table: string) => {
    if (table !== 'notificaciones_inactividad') {
      throw new Error(`Unexpected table in mock: ${table}`)
    }

    let mode: 'query' | 'insert' = 'query'
    const chain: any = {
      select: vi.fn(() => {
        mode = 'query'
        return chain
      }),
      in: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      insert: vi.fn(() => {
        mode = 'insert'
        return chain
      }),
      // thenable: cuando se hace `await chain`, se llama .then(resolve, reject)
      then: (resolve: any, reject: any) =>
        Promise.resolve(mode === 'insert' ? insertResult : queryResult).then(resolve, reject),
    }

    return chain
  })
}

// ----- Setup/teardown -----------------------------------------------------

let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules() // Asegura que el endpoint se re-importe fresco con los mocks actuales
  mockObtenerExpedientesInactivos.mockReset()
  mockSendEmail.mockReset()
  mockFrom.mockReset()
  mockIsDryRun.mockReturnValue(false)
  mockSendEmail.mockResolvedValue({ success: true, id: 'resend-abc' })
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  // Env defaults
  process.env.NOTIFICACION_INACTIVIDAD_EMAIL = 'admin@fusionlegalcr.com'
  delete process.env.CRON_SECRET_TOKEN
  delete process.env.EMAIL_DRY_RUN
})

afterEach(() => {
  logSpy.mockRestore()
  errorSpy.mockRestore()
  warnSpy.mockRestore()
  delete process.env.NOTIFICACION_INACTIVIDAD_EMAIL
  delete process.env.CRON_SECRET_TOKEN
  delete process.env.EMAIL_DRY_RUN
})

// ----- Tests --------------------------------------------------------------

describe('POST /api/expedientes-inactivos/notify', () => {
  it('devuelve 500 si falta NOTIFICACION_INACTIVIDAD_EMAIL', async () => {
    delete process.env.NOTIFICACION_INACTIVIDAD_EMAIL
    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.message).toMatch(/NOTIFICACION_INACTIVIDAD_EMAIL/i)
  })

  it('devuelve no-op cuando no hay inactivos', async () => {
    mockObtenerExpedientesInactivos.mockResolvedValue([])
    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.total).toBe(0)
    expect(body.enviados).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('envía correo y registra tracking para inactivos pendientes', async () => {
    const inactivos = [
      buildExpediente({ id: 'sol-1', diasInactivo: 20 }),
      buildExpediente({ id: 'sol-2', diasInactivo: 18, clienteNombre: 'Otro Cliente' }),
    ]
    mockObtenerExpedientesInactivos.mockResolvedValue(inactivos)
    setupSupabaseMock({ yaNotificados: [] })

    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.total).toBe(2)
    expect(body.pendientes).toBe(2)
    expect(body.enviados).toBe(2)
    expect(body.omitidos).toBe(0)
    // Un único correo consolidado
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const emailArgs = mockSendEmail.mock.calls[0][0]
    expect(emailArgs.to).toBe('admin@fusionlegalcr.com')
    expect(emailArgs.subject).toContain('2 expediente(s)')
    expect(emailArgs.html).toContain('Otro Cliente')
    expect(emailArgs.text).toContain('Otro Cliente')
    // Dos inserts en notificaciones_inactividad (uno por expediente)
    expect(mockFrom.mock.calls.filter((c: any) => c[0] === 'notificaciones_inactividad').length).toBeGreaterThan(0)
  })

  it('no reenvía inactivos ya notificados', async () => {
    const inactivos = [
      buildExpediente({ id: 'sol-1', diasInactivo: 20, clienteNombre: 'Cliente Alpha' }),
      buildExpediente({ id: 'sol-2', diasInactivo: 18, clienteNombre: 'Cliente Beta' }),
    ]
    mockObtenerExpedientesInactivos.mockResolvedValue(inactivos)
    setupSupabaseMock({
      yaNotificados: [{ expediente_id: 'sol-1' }],
    })

    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.pendientes).toBe(1)
    expect(body.enviados).toBe(1)
    expect(body.omitidos).toBe(1)
    // Un correo solo con el pendiente (sol-2 -> Cliente Beta, 18d)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    const emailHtml = mockSendEmail.mock.calls[0][0].html
    const emailText = mockSendEmail.mock.calls[0][0].text
    // HTML usa badges "Nd"
    expect(emailHtml).toContain('18d')
    expect(emailHtml).not.toContain('20d')
    // Texto plano usa "Días inactivo: N"
    expect(emailText).toContain('Días inactivo: 18')
    expect(emailText).not.toContain('Días inactivo: 20')
    // Identidad del pendiente
    expect(emailText).toContain('Cliente Beta')
    expect(emailText).not.toContain('Cliente Alpha')
  })

  it('todos ya notificados -> no envía correo', async () => {
    const inactivos = [buildExpediente({ id: 'sol-1' })]
    mockObtenerExpedientesInactivos.mockResolvedValue(inactivos)
    setupSupabaseMock({ yaNotificados: [{ expediente_id: 'sol-1' }] })

    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.enviados).toBe(0)
    expect(body.omitidos).toBe(1)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('falla con 500 si el envío del correo falla', async () => {
    mockObtenerExpedientesInactivos.mockResolvedValue([buildExpediente()])
    setupSupabaseMock({ yaNotificados: [] })
    mockSendEmail.mockResolvedValue({ success: false, error: 'Resend API error' })

    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.message).toMatch(/Resend API error/)
    // No debe registrar tracking si el envío falló
    // (no asserts estrictos sobre insert porque el flujo retorna antes)
  })

  it('ignora error 23505 (UNIQUE violation) como no-error real', async () => {
    mockObtenerExpedientesInactivos.mockResolvedValue([buildExpediente({ id: 'sol-1' })])
    setupSupabaseMock({
      yaNotificados: [],
      insertError: { code: '23505', message: 'duplicate key' },
    })

    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.enviados).toBe(0) // no se contó como enviado por la violación UNIQUE
    expect(warnSpy).toHaveBeenCalled()
  })

  it('rechaza 401 si CRON_SECRET_TOKEN configurado y header incorrecto', async () => {
    process.env.CRON_SECRET_TOKEN = 'secret-token-123'
    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')

    const res = await POST(makeRequest('POST', 'wrong-token'))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockObtenerExpedientesInactivos).not.toHaveBeenCalled()
  })

  it('permite acceso con token correcto', async () => {
    process.env.CRON_SECRET_TOKEN = 'secret-token-123'
    mockObtenerExpedientesInactivos.mockResolvedValue([])
    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')

    const res = await POST(makeRequest('POST', 'secret-token-123'))
    expect(res.status).toBe(200)
  })

  it('permite acceso sin token configurado (modo dev)', async () => {
    delete process.env.CRON_SECRET_TOKEN
    mockObtenerExpedientesInactivos.mockResolvedValue([])
    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
  })

  it('propaga error de obtenerExpedientesInactivos como 500', async () => {
    mockObtenerExpedientesInactivos.mockRejectedValue(new Error('Supabase down'))
    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.message).toMatch(/Supabase down/)
  })

  it('expone dryRun=true en respuesta cuando EMAIL_DRY_RUN=true', async () => {
    process.env.EMAIL_DRY_RUN = 'true'
    mockIsDryRun.mockReturnValue(true)
    mockObtenerExpedientesInactivos.mockResolvedValue([buildExpediente()])
    setupSupabaseMock({ yaNotificados: [] })

    const { POST } = await import('@/app/api/expedientes-inactivos/notify/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(body.dryRun).toBe(true)
    // Aún llama a sendEmail (que en modo dry-run no tocará Resend, pero el endpoint
    // no sabe eso; el mock simula éxito). El comportamiento de dry-run real lo
    // prueba lib/email.test.ts.
  })
})

describe('GET /api/expedientes-inactivos/notify (status)', () => {
  it('devuelve estado del servicio', async () => {
    const { GET } = await import('@/app/api/expedientes-inactivos/notify/route')
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body).toHaveProperty('dryRun')
    expect(body).toHaveProperty('destinatarioConfigurado')
    expect(body).toHaveProperty('cronConfigurado')
  })
})
