import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkStandardRateLimit, authBurstRateLimit, isRedisConfigured } from '@/lib/rate-limit'

const isDev = process.env.NODE_ENV === 'development'

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function isValidUUID(str: string): boolean {
  return UUID_REGEX.test(str)
}

// Session token validation
function isValidSessionToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token)
}

// Parse cookies helper
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=')
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=')
    }
  })
  return cookies
}

// Verify dev admin session for authentication
async function verifyDevAdminSession(request: Request): Promise<{ valid: boolean; adminId?: string; error?: string }> {
  try {
    if (isRedisConfigured()) {
      const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                       request.headers.get('x-real-ip') || '127.0.0.1'
      const identifier = `session-verify:${clientIP}`
      
      try {
        const result = await authBurstRateLimit.limit(identifier)
        if (!result.success) {
          return { valid: false, error: 'Rate limit exceeded' }
        }
      } catch (error) {
        if (isDev) console.error('[Session Verify] Rate limit check failed:', error)
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
      return { valid: false, error: 'Missing session' }
    }

    if (!isValidSessionToken(devAuth) || !isValidUUID(adminId)) {
      return { valid: false, error: 'Invalid session format' }
    }

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

    if (new Date() > new Date(session.expires_at)) {
      supabase
        .from('dev_sessions')
        .update({ is_active: false })
        .eq('id', session.id)
        .then(
          () => {},
          (err: Error) => { if (isDev) console.error('[Session Cleanup] Failed to deactivate expired session:', err) }
        )
      return { valid: false, error: 'Session expired' }
    }

    return { valid: true, adminId }
  } catch (error) {
    if (isDev) console.error('[Session Verify] Error:', error)
    return { valid: false, error: 'Verification failed' }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Rate limiting
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  // Authentication: Verify dev admin session
  const authResult = await verifyDevAdminSession(request)
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    )
  }

  try {
    const { id: casoId } = await params

    // Validate casoId exists
    if (!casoId) {
      return NextResponse.json(
        { error: 'ID de caso requerido' },
        { status: 400 }
      )
    }

    // Validate casoId is a valid UUID format
    if (!isValidUUID(casoId)) {
      return NextResponse.json(
        { error: 'ID de caso inválido' },
        { status: 400 }
      )
    }

    // Obtener servicios profesionales del caso
    const { data: servicios, error } = await supabase
      .from('servicios_profesionales' as any)
      .select(`
        id,
        id_caso,
        id_servicio,
        fecha,
        costo,
        gastos,
        iva,
        total,
        estado_pago,
        funcionarios:id_responsable (nombre),
        lista_servicios:id_servicio (titulo)
      `)
      .eq('id_caso', casoId)
      .order('fecha', { ascending: false })

    if (error) {
      if (isDev) {
        console.error('Error al obtener servicios del caso:', error)
      } else {
        console.error('Error al obtener servicios del caso:', error?.message || 'Unknown error')
      }
      return NextResponse.json(
        { error: 'Error al obtener servicios' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      servicios: servicios || []
    })

  } catch (error) {
    if (isDev) {
      console.error('Error en GET /api/casos/[id]/servicios:', error)
    } else {
      console.error('Error en GET /api/casos/[id]/servicios:', error instanceof Error ? error.message : 'Unknown error')
    }
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
