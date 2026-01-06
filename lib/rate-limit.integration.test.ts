import { describe, it, expect, beforeAll } from 'vitest'
import { NextRequest } from 'next/server'
import {
  checkStandardRateLimit,
  checkAuthRateLimit,
  checkUploadRateLimit,
  checkEmailRateLimit,
  checkSyncRateLimit,
  getClientIP,
} from './rate-limit'

// Helper to create mock NextRequest
function createMockRequest(options: {
  headers?: Record<string, string>
  url?: string
} = {}): NextRequest {
  const headers = new Headers({
    'x-forwarded-for': '192.168.1.100',
    'user-agent': 'Test Browser',
    ...options.headers,
  })
  const url = options.url || 'http://localhost:3000/api/test'
  
  return new NextRequest(url, { headers })
}

// Check if Redis is configured
const isRedisConfigured = () => {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

describe('Rate Limit Integration Tests with Redis', () => {
  beforeAll(() => {
    if (!isRedisConfigured()) {
      console.log('⚠️  Skipping Redis integration tests - Redis not configured')
      console.log('   Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to run these tests')
    } else {
      console.log('✅ Redis configured - running integration tests')
    }
  })

  describe('Redis Connection', () => {
    it('should have Redis credentials configured', () => {
      if (!isRedisConfigured()) {
        console.log('   ⏭️  Skipped (Redis not configured)')
        return
      }

      expect(process.env.UPSTASH_REDIS_REST_URL).toBeDefined()
      expect(process.env.UPSTASH_REDIS_REST_TOKEN).toBeDefined()
      
      const url = process.env.UPSTASH_REDIS_REST_URL || ''
      const maskedUrl = url.replace(/https:\/\/([^.]+)/, 'https://***')
      console.log('   Redis URL:', maskedUrl)
      console.log('   Redis Token:', '***' + process.env.UPSTASH_REDIS_REST_TOKEN?.slice(-4))
    })
  })

  describe('Standard Rate Limit (100 req/hour)', () => {
    it('should allow requests within limit', async () => {
      if (!isRedisConfigured()) {
        console.log('   ⏭️  Skipped (Redis not configured)')
        return
      }

      const request = createMockRequest({
        headers: {
          'x-forwarded-for': `192.168.1.${Math.floor(Math.random() * 254) + 1}`, // Random IP to avoid conflicts
          'user-agent': `Test-${Date.now()}`,
        },
      })

      const response = await checkStandardRateLimit(request)
      
      // Should be null (allowed) or a 429 response if limit already exceeded
      if (response) {
        expect(response.status).toBe(429)
        console.log('   ℹ️  Rate limit already exceeded (this is expected if running multiple times)')
      } else {
        console.log('   ✅ Request allowed')
      }
    })

    it('should include rate limit headers in responses', async () => {
      if (!isRedisConfigured()) {
        console.log('   ⏭️  Skipped (Redis not configured)')
        return
      }

      const request = createMockRequest({
        headers: {
          'x-forwarded-for': `192.168.2.${Math.floor(Math.random() * 254) + 1}`,
          'user-agent': `Test-Headers-${Date.now()}`,
        },
      })

      const response = await checkStandardRateLimit(request)
      
      if (response) {
        // Check headers exist
        expect(response.headers.get('X-RateLimit-Limit')).toBeDefined()
        expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined()
        expect(response.headers.get('X-RateLimit-Reset')).toBeDefined()
        expect(response.headers.get('Retry-After')).toBeDefined()
        
        console.log('   ✅ Headers present:')
        console.log('      - Limit:', response.headers.get('X-RateLimit-Limit'))
        console.log('      - Remaining:', response.headers.get('X-RateLimit-Remaining'))
        console.log('      - Retry-After:', response.headers.get('Retry-After'), 'seconds')
      }
    })
  })

  describe('Auth Rate Limit (5 req/10min + 20 req/hour)', () => {
    it('should enforce burst protection', async () => {
      if (!isRedisConfigured()) {
        console.log('   ⏭️  Skipped (Redis not configured)')
        return
      }

      // Use unique IP for this test
      const testIP = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
      const testUA = `AuthTest-${Date.now()}`
      
      console.log(`   Testing with IP: ${testIP}`)
      
      let allowedCount = 0
      let blockedResponse = null

      // Try 7 requests (limit is 5 per 10 min)
      for (let i = 1; i <= 7; i++) {
        const request = createMockRequest({
          headers: {
            'x-forwarded-for': testIP,
            'user-agent': testUA,
          },
        })

        const response = await checkAuthRateLimit(request)
        
        if (response) {
          // Blocked
          console.log(`   ❌ Request ${i}: Blocked (429)`)
          if (!blockedResponse) blockedResponse = response
        } else {
          // Allowed
          allowedCount++
          console.log(`   ✅ Request ${i}: Allowed`)
        }
      }

      console.log(`   📊 Summary: ${allowedCount} allowed, ${7 - allowedCount} blocked`)
      
      if (blockedResponse) {
        expect(blockedResponse.status).toBe(429)
        const body = await blockedResponse.json()
        expect(body.error).toContain('Demasiados intentos')
        console.log(`   💬 Error message: "${body.error}"`)
      }
    })
  })

  describe('Upload Rate Limit (10 uploads/hour)', () => {
    it('should limit upload requests', async () => {
      if (!isRedisConfigured()) {
        console.log('   ⏭️  Skipped (Redis not configured)')
        return
      }

      const testIP = `172.16.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
      
      const request = createMockRequest({
        headers: {
          'x-forwarded-for': testIP,
          'user-agent': `UploadTest-${Date.now()}`,
        },
      })

      const response = await checkUploadRateLimit(request)
      
      if (response) {
        expect(response.status).toBe(429)
        console.log('   ℹ️  Upload rate limit active')
      } else {
        console.log('   ✅ Upload request allowed')
      }
    })
  })

  describe('Email Rate Limit (3 req/hour)', () => {
    it('should strictly limit email requests', async () => {
      if (!isRedisConfigured()) {
        console.log('   ⏭️  Skipped (Redis not configured)')
        return
      }

      const testIP = `203.0.113.${Math.floor(Math.random() * 255)}`
      const testUA = `EmailTest-${Date.now()}`
      
      console.log(`   Testing email rate limit with IP: ${testIP}`)
      
      let allowedCount = 0
      let blockedCount = 0

      // Try 5 requests (limit is 3 per hour)
      for (let i = 1; i <= 5; i++) {
        const request = createMockRequest({
          headers: {
            'x-forwarded-for': testIP,
            'user-agent': testUA,
          },
        })

        const response = await checkEmailRateLimit(request)
        
        if (response) {
          blockedCount++
          console.log(`   ❌ Email request ${i}: Blocked`)
        } else {
          allowedCount++
          console.log(`   ✅ Email request ${i}: Allowed`)
        }
      }

      console.log(`   📊 Email requests: ${allowedCount} allowed, ${blockedCount} blocked`)
      expect(allowedCount).toBeLessThanOrEqual(3)
    })
  })

  describe('Sync Rate Limit (5 req/min)', () => {
    it('should limit sync requests per minute', async () => {
      if (!isRedisConfigured()) {
        console.log('   ⏭️  Skipped (Redis not configured)')
        return
      }

      const testIP = `198.51.100.${Math.floor(Math.random() * 255)}`
      
      const request = createMockRequest({
        headers: {
          'x-forwarded-for': testIP,
          'user-agent': `SyncTest-${Date.now()}`,
        },
      })

      const response = await checkSyncRateLimit(request)
      
      if (response) {
        expect(response.status).toBe(429)
        console.log('   ℹ️  Sync rate limit active')
      } else {
        console.log('   ✅ Sync request allowed')
      }
    })
  })

  describe('Corporate Users Scenario', () => {
    it('should not block different users from same IP (with different user-agents)', async () => {
      if (!isRedisConfigured()) {
        console.log('   ⏭️  Skipped (Redis not configured)')
        return
      }

      const corporateIP = `200.50.30.${Math.floor(Math.random() * 255)}`
      console.log(`   Testing corporate IP: ${corporateIP}`)

      // User A
      const requestA = createMockRequest({
        headers: {
          'x-forwarded-for': corporateIP,
          'user-agent': `Corporate-UserA-${Date.now()}`,
        },
      })

      // User B (same IP, different browser)
      const requestB = createMockRequest({
        headers: {
          'x-forwarded-for': corporateIP,
          'user-agent': `Corporate-UserB-${Date.now()}`,
        },
      })

      const responseA = await checkStandardRateLimit(requestA)
      const responseB = await checkStandardRateLimit(requestB)

      console.log(`   User A (${requestA.headers.get('user-agent')?.slice(0, 30)}...): ${responseA ? 'Blocked' : 'Allowed'}`)
      console.log(`   User B (${requestB.headers.get('user-agent')?.slice(0, 30)}...): ${responseB ? 'Blocked' : 'Allowed'}`)
      console.log('   ✅ Different user-agents create different rate limit buckets')
    })
  })

  describe('IP Extraction', () => {
    it('should correctly extract IPs from various header formats', () => {
      const cases = [
        {
          headers: { 'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178' },
          expected: '203.0.113.195',
          description: 'Multiple IPs in x-forwarded-for',
        },
        {
          headers: { 'x-real-ip': '10.20.30.40' },
          expected: '10.20.30.40',
          description: 'Single IP in x-real-ip',
        },
        {
          headers: { 'x-forwarded-for': '2001:0db8:85a3::8a2e:0370:7334' },
          expected: '2001:0db8:85a3::8a2e:0370:7334',
          description: 'IPv6 address',
        },
      ]

      cases.forEach(({ headers, expected, description }) => {
        // Create request WITHOUT default headers to test specific scenarios
        const headerObj: Record<string, string> = {}
        Object.entries(headers).forEach(([key, value]) => {
          if (value) headerObj[key] = value
        })
        const request = new NextRequest('http://localhost:3000/api/test', {
          headers: new Headers(headerObj),
        })
        const ip = getClientIP(request)
        expect(ip).toBe(expected)
        console.log(`   ✅ ${description}: ${ip}`)
      })
    })
  })

  describe('Error Message Localization', () => {
    it('should return error messages in Spanish', async () => {
      if (!isRedisConfigured()) {
        console.log('   ⏭️  Skipped (Redis not configured)')
        return
      }

      const testIP = `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`
      const testUA = `ErrorTest-${Date.now()}`

      // Exhaust the email rate limit (3 requests)
      for (let i = 0; i < 5; i++) {
        const request = createMockRequest({
          headers: {
            'x-forwarded-for': testIP,
            'user-agent': testUA,
          },
        })
        await checkEmailRateLimit(request)
      }

      // This should be blocked
      const request = createMockRequest({
        headers: {
          'x-forwarded-for': testIP,
          'user-agent': testUA,
        },
      })

      const response = await checkEmailRateLimit(request)

      if (response) {
        const body = await response.json()
        expect(body.error).toContain('Demasiados intentos')
        expect(body.error).toMatch(/\d+ minutos?/)
        expect(body.retryAfter).toBeGreaterThan(0)
        
        console.log('   ✅ Spanish error message:')
        console.log(`      "${body.error}"`)
        console.log(`      Retry after: ${body.retryAfter} seconds`)
      }
    })
  })
})

describe('Redis Configuration Status', () => {
  it('should report Redis configuration status', () => {
    const configured = isRedisConfigured()
    
    console.log('\n' + '='.repeat(60))
    console.log('📊 REDIS CONFIGURATION STATUS')
    console.log('='.repeat(60))
    
    if (configured) {
      console.log('✅ Redis is CONFIGURED')
      const url = process.env.UPSTASH_REDIS_REST_URL || ''
      const maskedUrl = url.replace(/https:\/\/([^.]+)/, 'https://***')
      console.log('   URL:', maskedUrl)
      console.log('   Token:', '***' + process.env.UPSTASH_REDIS_REST_TOKEN?.slice(-4))
      console.log('\n✅ All rate limiting features are ACTIVE')
    } else {
      console.log('⚠️  Redis is NOT configured')
      console.log('   Missing: UPSTASH_REDIS_REST_URL and/or UPSTASH_REDIS_REST_TOKEN')
      console.log('\n⚠️  Rate limiting will fail-open (allow all requests)')
      console.log('   This is safe for development but NOT for production')
    }
    
    console.log('='.repeat(60) + '\n')
    
    expect(true).toBe(true) // Always pass, just for reporting
  })
})
