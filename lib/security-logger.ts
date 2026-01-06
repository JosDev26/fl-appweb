import { NextRequest } from 'next/server'
import { supabase } from './supabase'

// ============================================
// SECURITY LOGGING MODULE
// Centralized security event tracking
// ============================================

export type SecurityEventType =
  | 'auth_failure'
  | 'auth_success'
  | 'access_denied'
  | 'rate_limit_exceeded'
  | 'csrf_violation'
  | 'idor_attempt'
  | 'invalid_input'
  | 'suspicious_activity'
  | 'session_created'
  | 'session_destroyed'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface SecurityEvent {
  type: SecurityEventType
  severity: Severity
  userId?: string
  ip: string
  userAgent: string
  endpoint: string
  method: string
  details: Record<string, unknown>
  timestamp: string
}

// ============================================
// SEVERITY MAPPING
// ============================================

const SEVERITY_MAP: Record<SecurityEventType, Severity> = {
  auth_failure: 'medium',
  auth_success: 'low',
  access_denied: 'high',
  rate_limit_exceeded: 'medium',
  csrf_violation: 'high',
  idor_attempt: 'critical',
  invalid_input: 'low',
  suspicious_activity: 'high',
  session_created: 'low',
  session_destroyed: 'low'
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Extract client information from request
 */
export function extractClientInfo(request: NextRequest | Request): {
  ip: string
  userAgent: string
  endpoint: string
  method: string
} {
  const headers = request.headers
  const forwardedFor = headers.get('x-forwarded-for')
  const realIP = headers.get('x-real-ip')

  let endpoint: string
  if ('nextUrl' in request && request.nextUrl) {
    endpoint = request.nextUrl.pathname
  } else {
    endpoint = new URL(request.url).pathname
  }

  return {
    ip: forwardedFor?.split(',')[0]?.trim() || realIP || 'unknown',
    userAgent: headers.get('user-agent') || 'unknown',
    endpoint,
    method: request.method
  }
}

/**
 * Sanitize sensitive data from details object
 */
function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['password', 'token', 'secret', 'key', 'authorization', 'cookie']
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase()
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

// ============================================
// MAIN LOGGING FUNCTION
// ============================================

/**
 * Log a security event
 * Outputs to console and optionally to database/external service
 */
export async function logSecurityEvent(
  type: SecurityEventType,
  request: NextRequest | Request,
  details: Record<string, unknown> = {},
  userId?: string
): Promise<void> {
  const clientInfo = extractClientInfo(request)
  const severity = SEVERITY_MAP[type]

  const event: SecurityEvent = {
    type,
    severity,
    userId,
    ...clientInfo,
    details: sanitizeDetails(details),
    timestamp: new Date().toISOString()
  }

  // Console logging with severity-based formatting
  const logPrefix = `[Security:${severity.toUpperCase()}]`
  const logMessage = JSON.stringify(event, null, process.env.NODE_ENV === 'development' ? 2 : 0)

  switch (severity) {
    case 'critical':
      console.error(logPrefix, logMessage)
      break
    case 'high':
      console.warn(logPrefix, logMessage)
      break
    default:
      console.log(logPrefix, logMessage)
  }

  // Database logging (if enabled)
  if (process.env.SECURITY_LOG_TO_DB === 'true') {
    try {
      // Note: security_events table must be created first
      // Using 'as any' because table may not exist in types yet
      await (supabase as any).from('security_events').insert({
        event_type: type,
        severity,
        user_id: userId || null,
        ip_address: clientInfo.ip,
        user_agent: clientInfo.userAgent,
        endpoint: clientInfo.endpoint,
        method: clientInfo.method,
        details: event.details,
        created_at: event.timestamp
      })
    } catch (error) {
      console.error('[Security] Failed to log to database:', error)
    }
  }

  // External service integration placeholder
  // TODO: Integrate with Sentry, Datadog, or similar
  // if (process.env.SENTRY_DSN && severity !== 'low') {
  //   Sentry.captureMessage(`Security: ${type}`, {
  //     level: severity === 'critical' ? 'error' : 'warning',
  //     extra: event
  //   })
  // }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

export async function logAuthFailure(
  request: NextRequest,
  reason: string,
  attemptedId?: string
): Promise<void> {
  await logSecurityEvent('auth_failure', request, {
    reason,
    attemptedId: attemptedId || 'unknown'
  })
}

export async function logAuthSuccess(
  request: NextRequest,
  userId: string,
  userType: string
): Promise<void> {
  await logSecurityEvent('auth_success', request, { userType }, userId)
}

export async function logAccessDenied(
  request: NextRequest,
  reason: string,
  userId?: string,
  resourceId?: string
): Promise<void> {
  await logSecurityEvent('access_denied', request, {
    reason,
    resourceId: resourceId || 'unknown'
  }, userId)
}

/**
 * Sanitize/pseudonymize identifier that may contain IP addresses
 * Used to comply with privacy requirements for rate limit logging
 * Retention policy: Pseudonymized identifiers should be retained for max 30 days
 */
function sanitizeIdentifier(identifier: string): string {
  // Check if it looks like an IP address
  const ipv4Regex = /^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/
  const ipv6Regex = /^([a-fA-F0-9:]+)$/
  
  const ipv4Match = identifier.match(ipv4Regex)
  if (ipv4Match) {
    // Mask last octet for IPv4
    return `${ipv4Match[1]}.xxx`
  }
  
  if (ipv6Regex.test(identifier) && identifier.includes(':')) {
    // Truncate IPv6 to first 4 segments
    const segments = identifier.split(':')
    if (segments.length > 4) {
      return `${segments.slice(0, 4).join(':')}:xxxx`
    }
  }
  
  // For user IDs or other identifiers, return as-is (not PII)
  return identifier
}

export async function logRateLimitExceeded(
  request: NextRequest,
  limitType: string,
  identifier: string
): Promise<void> {
  // Sanitize identifier to protect IP privacy
  const sanitizedIdentifier = sanitizeIdentifier(identifier)
  
  await logSecurityEvent('rate_limit_exceeded', request, {
    limitType,
    identifier: sanitizedIdentifier
  })
}

export async function logCsrfViolation(
  request: NextRequest,
  error: string
): Promise<void> {
  await logSecurityEvent('csrf_violation', request, { error })
}

export async function logIdorAttempt(
  request: NextRequest,
  userId: string,
  resourceType: string,
  resourceId: string
): Promise<void> {
  await logSecurityEvent('idor_attempt', request, {
    resourceType,
    resourceId
  }, userId)
}

export async function logSuspiciousActivity(
  request: NextRequest,
  reason: string,
  details: Record<string, unknown> = {},
  userId?: string
): Promise<void> {
  await logSecurityEvent('suspicious_activity', request, {
    reason,
    ...details
  }, userId)
}
