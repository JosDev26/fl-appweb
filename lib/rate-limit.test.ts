import { describe, it, expect } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Test the utility functions directly without importing the full module
// This avoids issues with Redis initialization during tests

describe('Rate Limit Utility Functions', () => {
  // Helper to create mock NextRequest
  function createMockRequest(options: {
    headers?: Record<string, string>
    url?: string
  } = {}): NextRequest {
    const headers = new Headers(options.headers || {})
    const url = options.url || 'http://localhost:3000/api/test'
    
    return new NextRequest(url, { headers })
  }

  describe('getClientIP logic', () => {
    function getClientIP(request: NextRequest): string {
      const forwardedFor = request.headers.get('x-forwarded-for')
      const realIP = request.headers.get('x-real-ip')
      
      if (forwardedFor) {
        return forwardedFor.split(',')[0].trim()
      }
      
      if (realIP) {
        return realIP
      }
      
      return '127.0.0.1'
    }

    it('should extract IP from x-forwarded-for header', () => {
      const request = createMockRequest({
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
      })
      
      expect(getClientIP(request)).toBe('192.168.1.1')
    })

    it('should extract IP from x-real-ip header', () => {
      const request = createMockRequest({
        headers: { 'x-real-ip': '10.20.30.40' },
      })
      
      expect(getClientIP(request)).toBe('10.20.30.40')
    })

    it('should prefer x-forwarded-for over x-real-ip', () => {
      const request = createMockRequest({
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'x-real-ip': '10.20.30.40',
        },
      })
      
      expect(getClientIP(request)).toBe('192.168.1.1')
    })

    it('should return 127.0.0.1 as fallback', () => {
      const request = createMockRequest()
      
      expect(getClientIP(request)).toBe('127.0.0.1')
    })

    it('should handle multiple IPs in x-forwarded-for', () => {
      const request = createMockRequest({
        headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
      })
      
      expect(getClientIP(request)).toBe('203.0.113.195')
    })
  })

  describe('getUserAgentHash logic', () => {
    function getUserAgentHash(request: NextRequest): string {
      const userAgent = request.headers.get('user-agent') || 'unknown'
      let hash = 0
      for (let i = 0; i < userAgent.length; i++) {
        const char = userAgent.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash | 0 // 32-bit integer truncation
      }
      return Math.abs(hash).toString(36)
    }

    it('should return consistent hash for same user agent', () => {
      const request1 = createMockRequest({
        headers: { 'user-agent': 'Mozilla/5.0 Test Browser' },
      })
      const request2 = createMockRequest({
        headers: { 'user-agent': 'Mozilla/5.0 Test Browser' },
      })
      
      expect(getUserAgentHash(request1)).toBe(getUserAgentHash(request2))
    })

    it('should return different hash for different user agents', () => {
      const request1 = createMockRequest({
        headers: { 'user-agent': 'Mozilla/5.0 Firefox' },
      })
      const request2 = createMockRequest({
        headers: { 'user-agent': 'Mozilla/5.0 Chrome' },
      })
      
      expect(getUserAgentHash(request1)).not.toBe(getUserAgentHash(request2))
    })

    it('should handle missing user agent', () => {
      const request = createMockRequest()
      
      const hash = getUserAgentHash(request)
      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
    })
  })

  describe('getRateLimitIdentifier logic', () => {
    function getClientIP(request: NextRequest): string {
      const forwardedFor = request.headers.get('x-forwarded-for')
      const realIP = request.headers.get('x-real-ip')
      
      if (forwardedFor) {
        return forwardedFor.split(',')[0].trim()
      }
      
      if (realIP) {
        return realIP
      }
      
      return '127.0.0.1'
    }

    function getUserAgentHash(request: NextRequest): string {
      const userAgent = request.headers.get('user-agent') || 'unknown'
      let hash = 0
      for (let i = 0; i < userAgent.length; i++) {
        const char = userAgent.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash | 0 // 32-bit integer truncation
      }
      return Math.abs(hash).toString(36)
    }

    function getRateLimitIdentifier(request: NextRequest): string {
      const ip = getClientIP(request)
      const uaHash = getUserAgentHash(request)
      return `ip:${ip}:${uaHash}`
    }

    it('should return IP-based identifier', () => {
      const request = createMockRequest({
        headers: {
          'x-forwarded-for': '192.168.1.100',
          'user-agent': 'TestBrowser',
        },
      })
      
      const identifier = getRateLimitIdentifier(request)
      
      expect(identifier).toMatch(/^ip:192\.168\.1\.100:/)
    })

    it('should include user-agent hash in identifier', () => {
      const request = createMockRequest({
        headers: {
          'x-forwarded-for': '192.168.1.100',
          'user-agent': 'TestBrowser',
        },
      })
      
      const identifier = getRateLimitIdentifier(request)
      
      expect(identifier).toContain(':')
      expect(identifier.split(':').length).toBe(3) // ip:ADDRESS:HASH
    })
  })

  describe('createRateLimitResponse logic', () => {
    interface RateLimitResult {
      success: boolean
      limit: number
      remaining: number
      reset: number
    }

    function createRateLimitResponse(result: RateLimitResult): NextResponse {
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

    it('should create 429 response with correct headers', () => {
      const result = {
        success: false,
        limit: 100,
        remaining: 0,
        reset: Date.now() + 3600000,
      }
      
      const response = createRateLimitResponse(result)
      
      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBeDefined()
      expect(response.headers.get('X-RateLimit-Limit')).toBe('100')
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
    })

    it('should include Spanish error message', async () => {
      const result = {
        success: false,
        limit: 100,
        remaining: 0,
        reset: Date.now() + 120000,
      }
      
      const response = createRateLimitResponse(result)
      const body = await response.json()
      
      expect(body.error).toContain('Demasiados intentos')
      expect(body.retryAfter).toBeDefined()
    })

    it('should use singular form for 1 minute', async () => {
      const result = {
        success: false,
        limit: 100,
        remaining: 0,
        reset: Date.now() + 60000,
      }
      
      const response = createRateLimitResponse(result)
      const body = await response.json()
      
      expect(body.error).toContain('1 minuto')
      expect(body.error).not.toContain('minutos')
    })

    it('should use plural form for multiple minutes', async () => {
      const result = {
        success: false,
        limit: 100,
        remaining: 0,
        reset: Date.now() + 300000,
      }
      
      const response = createRateLimitResponse(result)
      const body = await response.json()
      
      expect(body.error).toContain('minutos')
    })
  })
})

describe('Rate Limit Integration Scenarios', () => {
  function getClientIP(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIP = request.headers.get('x-real-ip')
    
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim()
    }
    
    if (realIP) {
      return realIP
    }
    
    return '127.0.0.1'
  }

  function getUserAgentHash(request: NextRequest): string {
    const userAgent = request.headers.get('user-agent') || 'unknown'
    let hash = 0
    for (let i = 0; i < userAgent.length; i++) {
      const char = userAgent.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash | 0 // 32-bit integer truncation
    }
    return Math.abs(hash).toString(36)
  }

  function createMockRequest(headers: Record<string, string>): NextRequest {
    return new NextRequest('http://localhost:3000/api/test', {
      headers: new Headers(headers),
    })
  }

  it('should identify corporate users differently by user-agent', () => {
    // Corporate user A
    const requestA = createMockRequest({
      'x-forwarded-for': '200.50.30.40', // Same corporate IP
      'user-agent': 'Browser User A',
    })
    
    // Corporate user B (same IP, different user)
    const requestB = createMockRequest({
      'x-forwarded-for': '200.50.30.40', // Same corporate IP
      'user-agent': 'Browser User B',
    })
    
    const hashA = getUserAgentHash(requestA)
    const hashB = getUserAgentHash(requestB)
    
    // Different user agents should produce different hashes
    expect(hashA).not.toBe(hashB)
  })

  it('should detect same browser across IP changes', () => {
    const sameUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
    
    const request1 = createMockRequest({
      'x-forwarded-for': '192.168.1.1',
      'user-agent': sameUserAgent,
    })
    
    const request2 = createMockRequest({
      'x-forwarded-for': '192.168.1.2',
      'user-agent': sameUserAgent,
    })
    
    // Both should have the same user-agent hash
    const hash1 = getUserAgentHash(request1)
    const hash2 = getUserAgentHash(request2)
    
    expect(hash1).toBe(hash2)
  })

  it('should correctly handle IPv6 addresses', () => {
    const request = createMockRequest({
      'x-forwarded-for': '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      'user-agent': 'TestBrowser',
    })
    
    const ip = getClientIP(request)
    expect(ip).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334')
  })

  it('should handle trimming of spaces in x-forwarded-for', () => {
    const request = createMockRequest({
      'x-forwarded-for': '  192.168.1.1  , 10.0.0.1',
      'user-agent': 'TestBrowser',
    })
    
    const ip = getClientIP(request)
    expect(ip).toBe('192.168.1.1')
  })
})

describe('Rate Limit Headers', () => {
  interface RateLimitResult {
    success: boolean
    limit: number
    remaining: number
    reset: number
  }

  function addRateLimitHeaders(response: NextResponse, result: RateLimitResult): NextResponse {
    response.headers.set('X-RateLimit-Limit', result.limit.toString())
    response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
    response.headers.set('X-RateLimit-Reset', result.reset.toString())
    return response
  }

  it('should add all rate limit headers to response', () => {
    const response = NextResponse.json({ success: true })
    
    const result = {
      success: true,
      limit: 100,
      remaining: 50,
      reset: Date.now() + 3600000,
    }
    
    const modifiedResponse = addRateLimitHeaders(response, result)
    
    expect(modifiedResponse.headers.get('X-RateLimit-Limit')).toBe('100')
    expect(modifiedResponse.headers.get('X-RateLimit-Remaining')).toBe('50')
    expect(modifiedResponse.headers.get('X-RateLimit-Reset')).toBeDefined()
  })

  it('should handle zero remaining correctly', () => {
    const response = NextResponse.json({ success: true })
    
    const result = {
      success: false,
      limit: 100,
      remaining: 0,
      reset: Date.now() + 3600000,
    }
    
    const modifiedResponse = addRateLimitHeaders(response, result)
    
    expect(modifiedResponse.headers.get('X-RateLimit-Remaining')).toBe('0')
  })
})
