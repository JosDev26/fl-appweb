import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================================
// Tests para lib/email.ts
//
// Estrategia: vi.mock('resend') para no tocar la API real de Resend.
// Verifica:
//   - Envío normal llama a resend.emails.send con args correctos.
//   - EMAIL_DRY_RUN=true NO invoca resend.emails.send (solo loguea).
//   - Validación de campos requeridos.
//   - Manejo de error retornado por Resend.
//   - wrapWithBaseTemplate produce HTML con la paleta FL.
// ============================================================================

// Mock del módulo 'resend' antes de importar nada.
// Usamos vi.hoisted para que mockSend esté disponible cuando se evalúe el factory
// del mock (que Vitest hoisted al inicio del archivo).
// Importante: la clase real es necesaria porque `new Resend(...)` requiere un
// constructor válido (vi.fn().mockImplementation no es invocable con `new`).
const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn(),
}))

vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      emails = { send: mockSend }
    },
  }
})

// Helper para silenciar logs durante los tests
let logSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  mockSend.mockReset()
  mockSend.mockResolvedValue({ data: { id: 'resend-id-123' }, error: null })
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  // Reset env vars relevantes
  delete process.env.EMAIL_DRY_RUN
  delete process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY = 'test-key'
})

afterEach(() => {
  logSpy.mockRestore()
  errorSpy.mockRestore()
  delete process.env.EMAIL_DRY_RUN
  delete process.env.RESEND_API_KEY
})

async function importEmailModule() {
  // Importación fresca para que lea las env vars actuales
  vi.resetModules()
  return await import('@/lib/email')
}

describe('lib/email', () => {
  describe('sendEmail', () => {
    it('llama resend.emails.send con los argumentos correctos', async () => {
      const { sendEmail } = await importEmailModule()

      const result = await sendEmail({
        to: 'destino@example.com',
        subject: 'Asunto de prueba',
        html: '<p>Hola</p>',
        text: 'Hola',
      })

      expect(result.success).toBe(true)
      expect(result.id).toBe('resend-id-123')
      expect(result.dryRun).toBe(false)
      expect(mockSend).toHaveBeenCalledTimes(1)
      const args = mockSend.mock.calls[0][0]
      expect(args.to).toBe('destino@example.com')
      expect(args.subject).toBe('Asunto de prueba')
      expect(args.html).toBe('<p>Hola</p>')
      expect(args.text).toBe('Hola')
      expect(args.from).toContain('Fusion Legal')
      expect(args.from).toContain('noreply@verificaciones.fusionlegalcr.com')
      expect(args.replyTo).toBe('soporte@fusionlegalcr.com')
    })

    it('NO llama a resend.emails.send cuando EMAIL_DRY_RUN=true', async () => {
      process.env.EMAIL_DRY_RUN = 'true'
      const { sendEmail, isDryRun } = await importEmailModule()

      expect(isDryRun()).toBe(true)

      const result = await sendEmail({
        to: 'destino@example.com',
        subject: 'Asunto dry-run',
        html: '<p>Dry run</p>',
      })

      expect(result.success).toBe(true)
      expect(result.dryRun).toBe(true)
      expect(mockSend).not.toHaveBeenCalled()
      // Debe loguear el preview (no enviar)
      expect(logSpy).toHaveBeenCalled()
      const logged = logSpy.mock.calls.map(c => String(c[0])).join(' ')
      expect(logged).toContain('dry-run')
      expect(logged).toContain('destino@example.com')
    })

    it('falla si falta to', async () => {
      const { sendEmail } = await importEmailModule()
      const result = await sendEmail({
        to: '',
        subject: 'X',
        html: '<p/>',
      })
      expect(result.success).toBe(false)
      expect(result.error).toMatch(/to/i)
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('falla si falta subject', async () => {
      const { sendEmail } = await importEmailModule()
      const result = await sendEmail({
        to: 'a@b.com',
        subject: '',
        html: '<p/>',
      })
      expect(result.success).toBe(false)
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('falla si falta html', async () => {
      const { sendEmail } = await importEmailModule()
      const result = await sendEmail({ to: 'a@b.com', subject: 'X', html: '' })
      expect(result.success).toBe(false)
      expect(mockSend).not.toHaveBeenCalled()
    })

    it('propaga el error retornado por Resend', async () => {
      mockSend.mockResolvedValue({ data: null, error: { message: 'Invalid recipient' } })
      const { sendEmail } = await importEmailModule()

      const result = await sendEmail({
        to: 'invalido',
        subject: 'X',
        html: '<p/>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid recipient')
      expect(errorSpy).toHaveBeenCalled()
    })

    it('captura excepciones del cliente Resend', async () => {
      mockSend.mockRejectedValue(new Error('Network failure'))
      const { sendEmail } = await importEmailModule()

      const result = await sendEmail({
        to: 'a@b.com',
        subject: 'X',
        html: '<p/>',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network failure')
    })

    it('omite text si no se provee', async () => {
      const { sendEmail } = await importEmailModule()
      await sendEmail({ to: 'a@b.com', subject: 'X', html: '<p/>' })
      const args = mockSend.mock.calls[0][0]
      expect(args.text).toBeUndefined()
    })

    it('respeta replyTo personalizado', async () => {
      const { sendEmail } = await importEmailModule()
      await sendEmail({
        to: 'a@b.com',
        subject: 'X',
        html: '<p/>',
        replyTo: 'custom@fusionlegalcr.com',
      })
      expect(mockSend.mock.calls[0][0].replyTo).toBe('custom@fusionlegalcr.com')
    })
  })

  describe('wrapWithBaseTemplate', () => {
    it('envuelve el contenido con la paleta FL', async () => {
      const { wrapWithBaseTemplate } = await importEmailModule()
      const html = wrapWithBaseTemplate('<p>Mi contenido</p>', {
        title: 'Mi título',
        subtitle: 'Mi subtítulo',
      })

      expect(html).toContain('<!DOCTYPE html>')
      expect(html).toContain('#19304B')
      expect(html).toContain('#FAD02C')
      expect(html).toContain('Mi título')
      expect(html).toContain('Mi subtítulo')
      expect(html).toContain('Mi contenido')
      expect(html).toContain('fusionlegalcr.com')
    })

    it('no incluye el subtítulo si no se provee', async () => {
      const { wrapWithBaseTemplate } = await importEmailModule()
      const html = wrapWithBaseTemplate('<p>X</p>', { title: 'T' })
      expect(html).not.toContain('color: #cbd5e1')
    })

    it('escapa HTML en título y subtítulo', async () => {
      const { wrapWithBaseTemplate } = await importEmailModule()
      const html = wrapWithBaseTemplate('<p>X</p>', {
        title: '<script>evil()</script>',
      })
      expect(html).toContain('&lt;script&gt;')
      expect(html).not.toContain('<script>evil()</script>')
    })
  })

  describe('isDryRun', () => {
    it('devuelve false por defecto', async () => {
      const { isDryRun } = await importEmailModule()
      expect(isDryRun()).toBe(false)
    })

    it('devuelve true cuando EMAIL_DRY_RUN=true', async () => {
      process.env.EMAIL_DRY_RUN = 'true'
      const { isDryRun } = await importEmailModule()
      expect(isDryRun()).toBe(true)
    })

    it('devuelve false cuando EMAIL_DRY_RUN=false', async () => {
      process.env.EMAIL_DRY_RUN = 'false'
      const { isDryRun } = await importEmailModule()
      expect(isDryRun()).toBe(false)
    })

    it('devuelve false cuando EMAIL_DRY_RUN tiene otro valor', async () => {
      process.env.EMAIL_DRY_RUN = '1'
      const { isDryRun } = await importEmailModule()
      expect(isDryRun()).toBe(false)
    })
  })
})
