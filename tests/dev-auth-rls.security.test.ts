import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// §1.2 + §1.3 fix tests: verifyDevAdminSession uses service-role client
//
// Verifies:
// - Canonical verifyDevAdminSession queries dev_sessions via supabaseAdmin
//   (service-role), not the anon supabase client.
// - Forged session (not in dev_sessions) is rejected — anon can't INSERT
//   once RLS is tightened (the query simply finds no row).
// - Legit active session is accepted (functional preservation).
// - Expired session is rejected and deactivated.
// - Missing/malformed cookies are rejected.
// ============================================================================

const { mockMaybeSingle, mockFrom } = vi.hoisted(() => ({
  mockMaybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  mockFrom: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  supabaseAdmin: {
    from: mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mockMaybeSingle,
      update: vi.fn().mockReturnThis(),
    })),
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  isRedisConfigured: vi.fn().mockReturnValue(false),
  sessionVerifyRateLimit: { limit: vi.fn().mockResolvedValue({ success: true }) },
}))

const VALID_TOKEN = 'a'.repeat(64)
const VALID_ADMIN_ID = '12345678-1234-1234-1234-123456789012'

function makeRequest(cookieHeader: string): Request {
  return new Request('http://localhost/api/test', {
    headers: { cookie: cookieHeader },
  })
}

function cookieStr(token: string, adminId: string): string {
  return `dev-auth=${token}; dev-admin-id=${adminId}`
}

describe('verifyDevAdminSession — §1.2+§1.3 fix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
  })

  it('queries dev_sessions via supabaseAdmin (service-role), not anon supabase', async () => {
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const { verifyDevAdminSession } = await import('@/lib/auth-utils')

    await verifyDevAdminSession(makeRequest(cookieStr(VALID_TOKEN, VALID_ADMIN_ID)))

    expect(supabaseAdmin.from).toHaveBeenCalledWith('dev_sessions')
  })

  it('rejects forged session (no row in dev_sessions) — RLS blocks anon INSERT', async () => {
    const { verifyDevAdminSession } = await import('@/lib/auth-utils')
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })

    const result = await verifyDevAdminSession(
      makeRequest(cookieStr(VALID_TOKEN, VALID_ADMIN_ID))
    )

    expect(result.valid).toBe(false)
  })

  it('accepts legit active session — functional preservation', async () => {
    const { verifyDevAdminSession } = await import('@/lib/auth-utils')
    const future = new Date(Date.now() + 3600_000).toISOString()
    mockMaybeSingle.mockResolvedValue({
      data: { id: 's1', is_active: true, expires_at: future },
      error: null,
    })

    const result = await verifyDevAdminSession(
      makeRequest(cookieStr(VALID_TOKEN, VALID_ADMIN_ID))
    )

    expect(result.valid).toBe(true)
    expect(result.adminId).toBe(VALID_ADMIN_ID)
  })

  it('rejects expired session and returns Session expired', async () => {
    const { verifyDevAdminSession } = await import('@/lib/auth-utils')
    const past = new Date(Date.now() - 3600_000).toISOString()
    mockMaybeSingle.mockResolvedValue({
      data: { id: 's1', is_active: true, expires_at: past },
      error: null,
    })

    const result = await verifyDevAdminSession(
      makeRequest(cookieStr(VALID_TOKEN, VALID_ADMIN_ID))
    )

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Session expired')
  })

  it('rejects when cookies are missing', async () => {
    const { verifyDevAdminSession } = await import('@/lib/auth-utils')
    const result = await verifyDevAdminSession(makeRequest(''))
    expect(result.valid).toBe(false)
  })

  it('rejects malformed session token format', async () => {
    const { verifyDevAdminSession } = await import('@/lib/auth-utils')
    const result = await verifyDevAdminSession(
      makeRequest(cookieStr('shorttoken', VALID_ADMIN_ID))
    )
    expect(result.valid).toBe(false)
  })

  it('rejects malformed admin id format', async () => {
    const { verifyDevAdminSession } = await import('@/lib/auth-utils')
    const result = await verifyDevAdminSession(
      makeRequest(cookieStr(VALID_TOKEN, 'not-a-uuid'))
    )
    expect(result.valid).toBe(false)
  })
})
