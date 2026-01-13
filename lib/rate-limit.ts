import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'
import { logRateLimitExceeded } from './security-logger'

// Redis client - uses environment variables UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
})

// Check if Redis is configured
export const isRedisConfigured = () => {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

// ============================================
// RATE LIMITERS - Different tiers for different routes
// ============================================

/**
 * Standard rate limiter: 100 requests per hour
 * Used for: Most authenticated API routes
 */
export const standardRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '1 h'),
  analytics: true,
  prefix: 'ratelimit:standard',
})

/**
 * Strict rate limiter for authentication routes: 20 requests per hour
 * Additional burst protection: 5 requests per 10 minutes
 * Used for: /api/login, /api/login-empresa, /api/crear-password, etc.
 */
export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  analytics: true,
  prefix: 'ratelimit:auth',
})

/**
 * Burst protection for auth routes: 5 requests per 10 minutes
 * Detects brute force attacks quickly
 */
export const authBurstRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  analytics: true,
  prefix: 'ratelimit:auth-burst',
})

/**
 * Session verification rate limiter: 100 requests per 10 minutes
 * More permissive since this is just checking cookies, not authenticating
 * Used for: verifyDevAdminSession
 */
export const sessionVerifyRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '10 m'),
  analytics: true,
  prefix: 'ratelimit:session-verify',
})

/**
 * Upload rate limiter: 10 uploads per hour
 * Used for: /api/upload-factura, /api/upload-comprobante
 */
export const uploadRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 h'),
  analytics: true,
  prefix: 'ratelimit:upload',
})

/**
 * Email rate limiter: 3 requests per hour
 * Used for: /api/recuperar-password, /api/solicitar-recuperacion
 * Prevents email spam abuse
 */
export const emailRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(3, '1 h'),
  analytics: true,
  prefix: 'ratelimit:email',
})

/**
 * Sync rate limiter: 5 requests per minute
 * Used for: /api/sync-* routes (manual triggers)
 */
export const syncRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
  prefix: 'ratelimit:sync',
})

// ============================================
// IDENTIFIER FUNCTIONS
// ============================================

/**
 * Get client IP from request headers
 * Works with Vercel's x-forwarded-for header
 */
export function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one (client)
    return forwardedFor.split(',')[0].trim()
  }
  
  if (realIP) {
    return realIP
  }
  
  // Fallback for local development
  return '127.0.0.1'
}

/**
 * Get User-Agent hash for fingerprinting
 * Used as additional identifier to prevent IP rotation abuse
 */
export function getUserAgentHash(request: NextRequest): string {
  const userAgent = request.headers.get('user-agent') || 'unknown'
  // Simple hash function for User-Agent
  let hash = 0
  for (let i = 0; i < userAgent.length; i++) {
    const char = userAgent.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Get user ID from Supabase auth cookie
 * Returns null if not authenticated
 */
export function getUserIdFromCookie(request: NextRequest): string | null {
  const accessToken = request.cookies.get('sb-access-token')?.value
  
  if (!accessToken) {
    return null
  }
  
  try {
    // JWT has 3 parts: header.payload.signature
    // We only need the payload to get the user ID
    const parts = accessToken.split('.')
    if (parts.length !== 3) {
      return null
    }
    
    const payload = JSON.parse(atob(parts[1]))
    return payload.sub || null
  } catch {
    return null
  }
}

/**
 * Get rate limit identifier based on route type
 * - Public routes: IP + User-Agent hash (prevents IP rotation abuse)
 * - Authenticated routes: User ID (fair for corporate users)
 */
export function getRateLimitIdentifier(request: NextRequest, forceIP: boolean = false): string {
  // For public routes or when forced, use IP + fingerprint
  if (forceIP) {
    const ip = getClientIP(request)
    const uaHash = getUserAgentHash(request)
    return `ip:${ip}:${uaHash}`
  }
  
  // Try to get authenticated user ID
  const userId = getUserIdFromCookie(request)
  
  if (userId) {
    return `user:${userId}`
  }
  
  // Fallback to IP + fingerprint for unauthenticated requests
  const ip = getClientIP(request)
  const uaHash = getUserAgentHash(request)
  return `ip:${ip}:${uaHash}`
}

// ============================================
// RATE LIMIT RESPONSE HELPERS
// ============================================

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

/**
 * Create a 429 Too Many Requests response
 * Includes Retry-After header and Spanish error message
 */
export function createRateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.ceil((result.reset - Date.now()) / 1000)
  const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60)
  
  const response = NextResponse.json(
    {
      error: `Demasiados intentos. Por favor, intenta de nuevo en ${retryAfterMinutes} ${retryAfterMinutes === 1 ? 'minuto' : 'minutos'}.`,
      retryAfter: retryAfterSeconds,
    },
    { status: 429 }
  )
  
  response.headers.set('Retry-After', retryAfterSeconds.toString())
  response.headers.set('X-RateLimit-Limit', result.limit.toString())
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', result.reset.toString())
  
  return response
}

/**
 * Add rate limit headers to a successful response
 */
export function addRateLimitHeaders(response: NextResponse, result: RateLimitResult): NextResponse {
  response.headers.set('X-RateLimit-Limit', result.limit.toString())
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', result.reset.toString())
  return response
}

// ============================================
// MAIN RATE LIMIT CHECK FUNCTIONS
// ============================================

/**
 * Check rate limit for standard API routes
 * Returns null if allowed, or a 429 response if blocked
 */
export async function checkStandardRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (!isRedisConfigured()) {
    console.warn('[Rate Limit] Redis not configured, skipping rate limit check')
    return null
  }
  
  const identifier = getRateLimitIdentifier(request)
  
  try {
    const result = await standardRateLimit.limit(identifier)
    
    if (!result.success) {
      console.warn('[Rate Limit] Blocked:', {
        identifier,
        endpoint: request.nextUrl.pathname,
        timestamp: new Date().toISOString(),
      })
      return createRateLimitResponse(result)
    }
    
    return null
  } catch (error) {
    console.error('[Rate Limit] Error checking rate limit:', error)
    // On error, allow the request to proceed (fail open)
    return null
  }
}

/**
 * Check rate limit for authentication routes (stricter limits)
 * Uses IP-based limiting + burst protection + progressive lockout
 * Returns null if allowed, or a 429 response if blocked
 */
export async function checkAuthRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (!isRedisConfigured()) {
    console.warn('[Rate Limit] Redis not configured, skipping rate limit check')
    return null
  }
  
  // For auth routes, always use IP + fingerprint (user isn't authenticated yet)
  const identifier = getRateLimitIdentifier(request, true)
  
  try {
    // Check for account lockout first
    const lockoutKey = `lockout:${identifier}`
    const isLockedOut = await redis.get(lockoutKey)
    
    if (isLockedOut) {
      const ttl = await redis.ttl(lockoutKey)
      await logRateLimitExceeded(request, 'account_lockout', identifier)
      
      return NextResponse.json(
        {
          error: `Cuenta temporalmente bloqueada. Intenta de nuevo en ${Math.ceil(ttl / 60)} minutos.`,
          retryAfter: ttl,
          locked: true
        },
        { 
          status: 429,
          headers: { 'Retry-After': ttl.toString() }
        }
      )
    }
    
    // Check burst limit first (5 requests per 10 minutes)
    const burstResult = await authBurstRateLimit.limit(identifier)
    
    if (!burstResult.success) {
      // Note: Auth failure tracking moved to incrementAuthFailures()
      // This branch only handles rate limiting, not credential failures
      await logRateLimitExceeded(request, 'auth_burst', identifier)
      console.warn('[Rate Limit] Auth burst blocked:', {
        identifier,
        endpoint: request.nextUrl.pathname,
        timestamp: new Date().toISOString(),
      })
      return createRateLimitResponse(burstResult)
    }
    
    // Check hourly limit (20 requests per hour)
    const result = await authRateLimit.limit(identifier)
    
    if (!result.success) {
      await logRateLimitExceeded(request, 'auth_hourly', identifier)
      console.warn('[Rate Limit] Auth blocked:', {
        identifier,
        endpoint: request.nextUrl.pathname,
        timestamp: new Date().toISOString(),
      })
      return createRateLimitResponse(result)
    }
    
    return null
  } catch (error) {
    console.error('[Rate Limit] Error checking auth rate limit:', error)
    return null
  }
}

/**
 * Increment auth failure counter on credential failure
 * Call this from auth routes when credentials are invalid (not on rate limit)
 * Returns the new failure count
 */
export async function incrementAuthFailures(
  identifier: string,
  userType: 'cliente' | 'empresa' = 'cliente'
): Promise<number> {
  if (!isRedisConfigured()) return 0
  
  const failureKey = `auth_failures:${userType}:${identifier}`
  const lockoutKey = `lockout:${userType}:${identifier}`
  
  try {
    const failures = await redis.incr(failureKey)
    await redis.expire(failureKey, 3600) // Reset after 1 hour of no failures
    
    // Progressive lockout: after 10 failures, lock for 15 minutes
    if (failures >= 10) {
      await redis.setex(lockoutKey, 900, '1') // 15 minute lockout
      console.warn('[Rate Limit] Progressive lockout applied:', { identifier: `${userType}:${identifier}`, failures })
    }
    
    return failures
  } catch (error) {
    console.error('[Rate Limit] Error incrementing auth failures:', error)
    return 0
  }
}

/**
 * Reset auth failure counter on successful login
 * Call this after a successful authentication
 */
export async function resetAuthFailures(
  identifier: string,
  userType: 'cliente' | 'empresa' = 'cliente'
): Promise<void> {
  if (!isRedisConfigured()) return
  
  const failureKey = `auth_failures:${userType}:${identifier}`
  
  try {
    await redis.del(failureKey)
  } catch (error) {
    console.error('[Rate Limit] Error resetting auth failures:', error)
  }
}

/**
 * Check rate limit for upload routes
 * Uses user-based limiting for authenticated users
 * Returns null if allowed, or a 429 response if blocked
 */
export async function checkUploadRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (!isRedisConfigured()) {
    console.warn('[Rate Limit] Redis not configured, skipping rate limit check')
    return null
  }
  
  const identifier = getRateLimitIdentifier(request)
  
  try {
    const result = await uploadRateLimit.limit(identifier)
    
    if (!result.success) {
      console.warn('[Rate Limit] Upload blocked:', {
        identifier,
        endpoint: request.nextUrl.pathname,
        timestamp: new Date().toISOString(),
      })
      return createRateLimitResponse(result)
    }
    
    return null
  } catch (error) {
    console.error('[Rate Limit] Error checking upload rate limit:', error)
    return null
  }
}

/**
 * Check rate limit for email-sending routes (very strict)
 * Prevents email spam abuse
 * Returns null if allowed, or a 429 response if blocked
 */
export async function checkEmailRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (!isRedisConfigured()) {
    console.warn('[Rate Limit] Redis not configured, skipping rate limit check')
    return null
  }
  
  const identifier = getRateLimitIdentifier(request, true)
  
  try {
    const result = await emailRateLimit.limit(identifier)
    
    if (!result.success) {
      console.warn('[Rate Limit] Email blocked:', {
        identifier,
        endpoint: request.nextUrl.pathname,
        timestamp: new Date().toISOString(),
      })
      return createRateLimitResponse(result)
    }
    
    return null
  } catch (error) {
    console.error('[Rate Limit] Error checking email rate limit:', error)
    return null
  }
}

/**
 * Check rate limit for sync routes
 * Returns null if allowed, or a 429 response if blocked
 */
export async function checkSyncRateLimit(request: NextRequest): Promise<NextResponse | null> {
  if (!isRedisConfigured()) {
    console.warn('[Rate Limit] Redis not configured, skipping rate limit check')
    return null
  }
  
  const identifier = getRateLimitIdentifier(request, true)
  
  try {
    const result = await syncRateLimit.limit(identifier)
    
    if (!result.success) {
      console.warn('[Rate Limit] Sync blocked:', {
        identifier,
        endpoint: request.nextUrl.pathname,
        timestamp: new Date().toISOString(),
      })
      return createRateLimitResponse(result)
    }
    
    return null
  } catch (error) {
    console.error('[Rate Limit] Error checking sync rate limit:', error)
    return null
  }
}
