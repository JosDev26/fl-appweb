import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ============================================================================
// Tests para lib/cron-auth.ts
//
// Verifica:
//   - validateCronAuth acepta Bearer <token> cuando hay uno configurado.
//   - Rechaza 401 con header incorrecto o ausente.
//   - Auth dual: acepta CRON_SECRET o CRON_SECRET_TOKEN.
//   - Sin token configurado en producción (VERCEL_ENV=production) -> 401.
//   - Sin token configurado en dev -> permite acceso (null).
//   - isCronAuthConfigured refleja si hay tokens no vacíos.
// ============================================================================

async function importCronAuth() {
  vi.resetModules()
  return await import('@/lib/cron-auth')
}

function makeRequest(token?: string): NextRequest {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new NextRequest('http://localhost/api/test', { method: 'POST', headers })
}

beforeEach(() => {
  vi.resetModules()
  delete process.env.CRON_SECRET
  delete process.env.CRON_SECRET_TOKEN
  delete process.env.VERCEL_ENV
  delete process.env.NODE_ENV
})

afterEach(() => {
  delete process.env.CRON_SECRET
  delete process.env.CRON_SECRET_TOKEN
  delete process.env.VERCEL_ENV
  delete process.env.NODE_ENV
})

describe('lib/cron-auth', () => {
  describe('isCronAuthConfigured', () => {
    it('devuelve false si no hay tokens', async () => {
      const { isCronAuthConfigured } = await importCronAuth()
      expect(isCronAuthConfigured()).toBe(false)
    })

    it('devuelve true con CRON_SECRET', async () => {
      process.env.CRON_SECRET = 'vercel-secret'
      const { isCronAuthConfigured } = await importCronAuth()
      expect(isCronAuthConfigured()).toBe(true)
    })

    it('devuelve true con CRON_SECRET_TOKEN', async () => {
      process.env.CRON_SECRET_TOKEN = 'gh-secret'
      const { isCronAuthConfigured } = await importCronAuth()
      expect(isCronAuthConfigured()).toBe(true)
    })

    it('devuelve true con ambos tokens', async () => {
      process.env.CRON_SECRET = 'vercel-secret'
      process.env.CRON_SECRET_TOKEN = 'gh-secret'
      const { isCronAuthConfigured } = await importCronAuth()
      expect(isCronAuthConfigured()).toBe(true)
    })

    it('ignora tokens vacíos', async () => {
      process.env.CRON_SECRET = '   '
      process.env.CRON_SECRET_TOKEN = ''
      const { isCronAuthConfigured } = await importCronAuth()
      expect(isCronAuthConfigured()).toBe(false)
    })
  })

  describe('validateCronAuth - auth dual', () => {
    it('acepta Bearer <CRON_SECRET>', async () => {
      process.env.CRON_SECRET = 'vercel-secret'
      const { validateCronAuth } = await importCronAuth()
      expect(validateCronAuth(makeRequest('vercel-secret'))).toBeNull()
    })

    it('acepta Bearer <CRON_SECRET_TOKEN>', async () => {
      process.env.CRON_SECRET_TOKEN = 'gh-secret'
      const { validateCronAuth } = await importCronAuth()
      expect(validateCronAuth(makeRequest('gh-secret'))).toBeNull()
    })

    it('acepta cualquiera de los dos cuando ambos están configurados', async () => {
      process.env.CRON_SECRET = 'vercel-secret'
      process.env.CRON_SECRET_TOKEN = 'gh-secret'
      const { validateCronAuth } = await importCronAuth()
      expect(validateCronAuth(makeRequest('vercel-secret'))).toBeNull()
      expect(validateCronAuth(makeRequest('gh-secret'))).toBeNull()
    })

    it('rechaza 401 con token incorrecto', async () => {
      process.env.CRON_SECRET = 'vercel-secret'
      const { validateCronAuth } = await importCronAuth()
      const res = validateCronAuth(makeRequest('wrong'))
      expect(res).not.toBeNull()
      expect(res!.status).toBe(401)
    })

    it('rechaza 401 sin header Authorization', async () => {
      process.env.CRON_SECRET_TOKEN = 'gh-secret'
      const { validateCronAuth } = await importCronAuth()
      const res = validateCronAuth(makeRequest(undefined))
      expect(res).not.toBeNull()
      expect(res!.status).toBe(401)
    })
  })

  describe('validateCronAuth - sin token configurado', () => {
    it('permite acceso en dev (devuelve null)', async () => {
      process.env.VERCEL_ENV = 'development'
      const { validateCronAuth } = await importCronAuth()
      expect(validateCronAuth(makeRequest(undefined))).toBeNull()
    })

    it('permite acceso en preview', async () => {
      process.env.VERCEL_ENV = 'preview'
      const { validateCronAuth } = await importCronAuth()
      expect(validateCronAuth(makeRequest(undefined))).toBeNull()
    })

    it('rechaza 401 en producción (fail-closed)', async () => {
      process.env.VERCEL_ENV = 'production'
      const { validateCronAuth } = await importCronAuth()
      const res = validateCronAuth(makeRequest(undefined))
      expect(res).not.toBeNull()
      expect(res!.status).toBe(401)
      const body = await (res as NextResponse).json()
      expect(body.message).toMatch(/CRON_SECRET|token/i)
    })

    it('rechaza 401 con NODE_ENV=production (fallback)', async () => {
      process.env.NODE_ENV = 'production'
      const { validateCronAuth } = await importCronAuth()
      const res = validateCronAuth(makeRequest(undefined))
      expect(res).not.toBeNull()
      expect(res!.status).toBe(401)
    })
  })
})
