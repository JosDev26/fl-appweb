import { supabase } from '@/lib/supabase'
import { sessionVerifyRateLimit, isRedisConfigured } from '@/lib/rate-limit'

const isDev = process.env.NODE_ENV === 'development'

/**
 * Validate UUID format (v4 style)
 */
export function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}

/**
 * Validate session token format (64 hex characters)
 */
export function isValidSessionToken(token: string): boolean {
  return typeof token === 'string' && /^[0-9a-f]{64}$/i.test(token)
}

/**
 * Parse cookies from Cookie header string
 */
export function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!cookieHeader) return cookies
  
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.trim().split('=')
    if (parts.length >= 2) {
      const key = parts[0].trim()
      const value = parts.slice(1).join('=').trim()
      if (key) {
        try {
          cookies[key] = decodeURIComponent(value)
        } catch {
          cookies[key] = value
        }
      }
    }
  })
  return cookies
}

/**
 * Generate a collision-resistant unique ID
 * Uses timestamp + user suffix + random hex for uniqueness
 */
export function generateUniqueId(prefix: string, userSuffix?: string): string {
  const timestamp = Date.now()
  const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  if (userSuffix) {
    return `${prefix}-${timestamp}-${userSuffix}-${randomHex}`
  }
  return `${prefix}-${timestamp}-${randomHex}`
}

export interface DevAdminSessionResult {
  valid: boolean
  adminId?: string
  error?: string
}

/**
 * Verify dev admin session for protected endpoints
 * Checks cookies, validates token format, and verifies against database
 */
export async function verifyDevAdminSession(request: Request): Promise<DevAdminSessionResult> {
  try {
    // Rate limiting for session verification - using a higher limit since this is just cookie verification
    // Not login attempts. Use 100 requests per 10 minutes for session checks.
    if (isRedisConfigured()) {
      const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                       request.headers.get('x-real-ip') || '127.0.0.1'
      // Use a different identifier prefix to avoid sharing rate limit with login attempts
      const identifier = `dev-session-check:${clientIP}`
      
      try {
        // Use sessionVerifyRateLimit (100/10min) - more permissive for cookie checks
        const result = await sessionVerifyRateLimit.limit(identifier)
        if (!result.success) {
          if (isDev) console.warn('[Session Verify] Rate limit exceeded for IP:', clientIP)
          return { valid: false, error: 'Rate limit exceeded' }
        }
      } catch (error) {
        // If rate limit check fails, allow the request through in dev
        if (isDev) {
          console.error('[Session Verify] Rate limit check failed, allowing in dev:', error instanceof Error ? error.message : 'Unknown error')
        } else {
          return { valid: false, error: 'Rate limit check failed' }
        }
      }
    }

    const cookieHeader = request.headers.get('cookie')
    if (!cookieHeader) {
      return { valid: false, error: 'No session' }
    }

    const cookies = parseCookies(cookieHeader)
    const devAuth = cookies['dev-auth']
    const adminId = cookies['dev-admin-id']

    if (!devAuth || !adminId) {
      return { valid: false, error: 'Missing session cookies' }
    }

    if (!isValidSessionToken(devAuth) || !isValidUUID(adminId)) {
      return { valid: false, error: 'Invalid session format' }
    }

    // Verify session in database
    const { data: session, error } = await supabase
      .from('dev_sessions')
      .select('id, is_active, expires_at')
      .eq('session_token', devAuth)
      .eq('admin_id', adminId)
      .eq('is_active', true)
      .maybeSingle()

    if (error || !session) {
      return { valid: false, error: 'Invalid session' }
    }

    const now = new Date()
    const expiresAt = new Date(session.expires_at)

    if (now > expiresAt) {
      // Deactivate expired session - await to ensure completion before returning
      // This prevents race conditions where session remains briefly active
      try {
        const { error: deactivateError } = await supabase
          .from('dev_sessions')
          .update({ is_active: false })
          .eq('id', session.id)
        
        if (deactivateError && isDev) {
          console.error('[Session Cleanup] Failed to deactivate expired session:', deactivateError.message)
        }
      } catch (cleanupError) {
        // Log but don't block the expired session response
        if (isDev) {
          console.error('[Session Cleanup] Exception deactivating session:', 
            cleanupError instanceof Error ? cleanupError.message : 'Unknown error')
        }
      }

      return { valid: false, error: 'Session expired' }
    }

    return { valid: true, adminId }
  } catch (error) {
    if (isDev) console.error('[Session Verify] Error:', error instanceof Error ? error.message : 'Unknown error')
    return { valid: false, error: 'Session verification failed' }
  }
}

/**
 * Sanitized error logging - only logs full details in development
 */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown error'
  if (isDev) {
    console.error(`${context}:`, error)
  } else {
    console.error(`${context}: ${message}`)
  }
}
