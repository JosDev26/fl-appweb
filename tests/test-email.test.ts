import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ============================================================================
// Tests para POST /api/test-email
//
// Verifica:
//   - Envía correo al NOTIFICACION_INACTIVIDAD_EMAIL por defecto.
//   - Permite sobreescribir destinatario via body.to.
//   - Devuelve 400 si no hay destinatario.
//   - Respeta EMAIL_DRY_RUN (expone dryRun en respuesta).
//   - Propaga error de sendEmail como 500.
//   - Auth con CRON_SECRET / CRON_SECRET_TOKEN (lib/cron-auth).
// ============================================================================

const { mockSendEmail, mockIsDryRun, mockValidateCronAuth, mockIsCronAuthConfigured } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockIsDryRun: vi.fn().mockReturnValue(false),
  mockValidateCronAuth: vi.fn().mockReturnValue(null),
  mockIsCronAuthConfigured: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/email', () => ({
  sendEmail: mockSendEmail,
  wrapWithBaseTemplate: (content: string) => `<div>${content}</div>`,
  isDryRun: mockIsDryRun,
}))

vi.mock('@/lib/cron-auth', () => ({
  validateCronAuth: mockValidateCronAuth,
  isCronAuthConfigured: mockIsCronAuthConfigured,
}))

function makeRequest(body?: any, token?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return new NextRequest('http://localhost/api/test-email', {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

// Helper: simula que validateCronAuth acepta solo el token dado, y rechaza
// cualquier header distinto. Reproduce el comportamiento real del helper.
function setValidToken(token: string | null) {
  if (token === null) {
    mockValidateCronAuth.mockReturnValue(null) // modo dev sin token
    mockIsCronAuthConfigured.mockReturnValue(false)
    return
  }
  mockIsCronAuthConfigured.mockReturnValue(true)
  mockValidateCronAuth.mockImplementation((req: NextRequest) => {
    const auth = req.headers.get('authorization')
    return auth === `Bearer ${token}`
      ? null
      : NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 })
  })
}

let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  mockSendEmail.mockReset()
  mockIsDryRun.mockReturnValue(false)
  mockSendEmail.mockResolvedValue({ success: true, id: 'test-id-123' })
  // Auth: por defecto modo dev sin token (permite acceso)
  setValidToken(null)
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  process.env.NOTIFICACION_INACTIVIDAD_EMAIL = 'admin@fusionlegalcr.com'
  delete process.env.CRON_SECRET
  delete process.env.CRON_SECRET_TOKEN
  delete process.env.EMAIL_DRY_RUN
})

afterEach(() => {
  logSpy.mockRestore()
  errorSpy.mockRestore()
  delete process.env.NOTIFICACION_INACTIVIDAD_EMAIL
  delete process.env.CRON_SECRET
  delete process.env.CRON_SECRET_TOKEN
  delete process.env.EMAIL_DRY_RUN
})

describe('POST /api/test-email', () => {
  it('envía al NOTIFICACION_INACTIVIDAD_EMAIL por defecto', async () => {
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.destinatario).toBe('admin@fusionlegalcr.com')
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail.mock.calls[0][0].to).toBe('admin@fusionlegalcr.com')
  })

  it('permite sobreescribir destinatario via body.to', async () => {
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest({ to: 'otro@ejemplo.com' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.destinatario).toBe('otro@ejemplo.com')
    expect(mockSendEmail.mock.calls[0][0].to).toBe('otro@ejemplo.com')
  })

  it('permite sobreescribir asunto via body.subject', async () => {
    const { POST } = await import('@/app/api/test-email/route')
    await POST(makeRequest({ subject: 'Mi asunto custom' }))
    expect(mockSendEmail.mock.calls[0][0].subject).toBe('Mi asunto custom')
  })

  it('devuelve 400 si no hay destinatario', async () => {
    delete process.env.NOTIFICACION_INACTIVIDAD_EMAIL
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.message).toMatch(/NOTIFICACION_INACTIVIDAD_EMAIL|destinatario/i)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('devuelve 400 si destinatario está vacío en body y env', async () => {
    delete process.env.NOTIFICACION_INACTIVIDAD_EMAIL
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest({ to: '  ' }))
    expect(res.status).toBe(400)
  })

  it('expone dryRun=true cuando EMAIL_DRY_RUN=true', async () => {
    mockIsDryRun.mockReturnValue(true)
    mockSendEmail.mockResolvedValue({ success: true, id: null, dryRun: true })
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(body.dryRun).toBe(true)
    expect(body.message).toMatch(/DRY-RUN/i)
  })

  it('propaga error de sendEmail como 500', async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: 'Resend API key invalid' })
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.message).toMatch(/Resend API key invalid/)
  })

  it('rechaza 401 si hay token configurado y header incorrecto', async () => {
    setValidToken('secret-123')
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest({}, 'wrong'))
    expect(res.status).toBe(401)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('permite acceso con token correcto (CRON_SECRET_TOKEN)', async () => {
    setValidToken('secret-123')
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest({}, 'secret-123'))
    expect(res.status).toBe(200)
  })

  it('permite acceso con token correcto (CRON_SECRET)', async () => {
    setValidToken('vercel-cron-secret')
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest({}, 'vercel-cron-secret'))
    expect(res.status).toBe(200)
  })

  it('permite acceso sin token configurado (modo dev)', async () => {
    setValidToken(null)
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
  })

  it('funciona sin body (JSON vacío)', async () => {
    const { POST } = await import('@/app/api/test-email/route')
    const res = await POST(makeRequest(undefined))
    expect(res.status).toBe(200)
    expect(mockSendEmail.mock.calls[0][0].to).toBe('admin@fusionlegalcr.com')
  })
})

describe('GET /api/test-email (status)', () => {
  it('devuelve estado del servicio', async () => {
    const { GET } = await import('@/app/api/test-email/route')
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body).toHaveProperty('dryRun')
    expect(body).toHaveProperty('destinatarioConfigurado')
    expect(body).toHaveProperty('resendConfigurado')
    expect(body).toHaveProperty('cronAuthConfigurado')
  })
})
