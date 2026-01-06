import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

// ============================================
// CSRF PROTECTION MODULE
// Double Submit Cookie Pattern Implementation
// ============================================

const CSRF_TOKEN_COOKIE = 'csrf-token'
const CSRF_VERIFY_COOKIE = 'csrf-token-verify'
const CSRF_HEADER = 'x-csrf-token'
const TOKEN_LENGTH = 32 // 256 bits of entropy

/**
 * Generate a cryptographically secure CSRF token
 * @returns 64 character hex string (256 bits)
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(TOKEN_LENGTH).toString('hex')
}

/**
 * Timing-safe comparison of two tokens
 * Prevents timing attacks that could reveal token characters
 */
export function validateCsrfToken(
  headerToken: string | null,
  cookieToken: string | null
): boolean {
  if (!headerToken || !cookieToken) {
    return false
  }

  if (headerToken.length !== cookieToken.length) {
    return false
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(headerToken, 'utf8'),
      Buffer.from(cookieToken, 'utf8')
    )
  } catch {
    return false
  }
}

/**
 * Check if request method requires CSRF protection
 */
function isStateChangingMethod(method: string): boolean {
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
}

/**
 * Check if request should be exempt from CSRF validation
 */
export function isCsrfExempt(request: NextRequest): boolean {
  const method = request.method
  const authHeader = request.headers.get('authorization')
  const path = request.nextUrl.pathname

  // Safe methods don't need CSRF protection
  if (!isStateChangingMethod(method)) {
    return true
  }

  // Bearer token requests (API/cron) are exempt - they use different auth
  if (authHeader?.startsWith('Bearer ')) {
    return true
  }

  // Sync endpoints with cron secret are exempt
  if (path.includes('/api/sync') && request.headers.get('x-cron-secret')) {
    return true
  }

  return false
}

/**
 * Validate CSRF token from request
 * Returns null if valid, error response if invalid
 */
export function checkCsrfToken(request: NextRequest): {
  valid: boolean
  error?: string
} {
  // Skip validation for exempt requests
  if (isCsrfExempt(request)) {
    return { valid: true }
  }

  const headerToken = request.headers.get(CSRF_HEADER)
  const cookieToken = request.cookies.get(CSRF_VERIFY_COOKIE)?.value

  if (!headerToken) {
    return { valid: false, error: 'CSRF token missing from header' }
  }

  if (!cookieToken) {
    return { valid: false, error: 'CSRF verification cookie missing' }
  }

  if (!validateCsrfToken(headerToken, cookieToken)) {
    return { valid: false, error: 'CSRF token mismatch' }
  }

  return { valid: true }
}

/**
 * Create CSRF error response
 */
export function createCsrfErrorResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Solicitud inválida. Por favor recarga la página e intenta de nuevo.' },
    { status: 403 }
  )
}

/**
 * Set CSRF cookies on response (call after successful login)
 */
export function setCsrfCookies(response: NextResponse): NextResponse {
  const token = generateCsrfToken()
  const isProduction = process.env.NODE_ENV === 'production'

  // Readable cookie for JavaScript to include in requests
  response.cookies.set(CSRF_TOKEN_COOKIE, token, {
    httpOnly: false, // JS needs to read this
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  })

  // HTTP-only cookie for server-side validation
  response.cookies.set(CSRF_VERIFY_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  })

  return response
}

/**
 * Clear CSRF cookies (call on logout)
 */
export function clearCsrfCookies(response: NextResponse): NextResponse {
  response.cookies.set(CSRF_TOKEN_COOKIE, '', { maxAge: 0, path: '/' })
  response.cookies.set(CSRF_VERIFY_COOKIE, '', { maxAge: 0, path: '/' })
  return response
}

// ============================================
// FEATURE FLAG FOR GRADUAL ROLLOUT
// ============================================

export interface CsrfConfig {
  enabled: boolean      // Whether to enforce CSRF validation
  logOnly: boolean      // If true, log violations but don't block
}

export function getCsrfConfig(): CsrfConfig {
  return {
    enabled: process.env.CSRF_ENABLED === 'true',
    logOnly: process.env.CSRF_LOG_ONLY === 'true'
  }
}

/**
 * Main CSRF check function with feature flag support
 * Returns null if request should proceed, NextResponse if blocked
 */
export async function enforceCsrf(request: NextRequest): Promise<NextResponse | null> {
  const config = getCsrfConfig()

  // CSRF disabled entirely
  if (!config.enabled && !config.logOnly) {
    return null
  }

  const result = checkCsrfToken(request)

  if (!result.valid) {
    const logData = {
      type: 'csrf_violation',
      path: request.nextUrl.pathname,
      method: request.method,
      error: result.error,
      ip: request.headers.get('x-forwarded-for') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      timestamp: new Date().toISOString()
    }

    console.warn('[CSRF]', JSON.stringify(logData))

    // Log-only mode: allow request but log the violation
    if (config.logOnly) {
      return null
    }

    // Enforcement mode: block the request
    return createCsrfErrorResponse()
  }

  return null
}
