import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { checkStandardRateLimit, authBurstRateLimit, isRedisConfigured } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Genera un código criptográficamente seguro
function generateSecureCode(): string {
  // Generar 32 bytes (256 bits) de datos aleatorios
  const buffer = crypto.randomBytes(32)
  // Convertir a hexadecimal para un código de 64 caracteres
  return buffer.toString('hex')
}

// Validar formato UUID
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(id)
}

// Validar formato de session token (64 caracteres hexadecimales)
function isValidSessionToken(token: string): boolean {
  return typeof token === 'string' && /^[0-9a-f]{64}$/i.test(token)
}

// Parse cookies from Cookie header (RFC 6265 compliant)
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  
  if (!cookieHeader) {
    return cookies
  }

  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.trim().split('=')
    if (parts.length >= 2) {
      const key = parts[0].trim()
      const value = parts.slice(1).join('=').trim() // Handle '=' in value
      if (key) {
        // Safely decode cookie value, fallback to raw value on malformed escapes
        try {
          cookies[key] = decodeURIComponent(value)
        } catch (error) {
          // URIError on malformed escape sequences - use raw value
          cookies[key] = value
        }
      }
    }
  })

  return cookies
}

// Verificar sesión de admin de desarrollo con rate limiting
async function verifyDevAdminSession(request: Request): Promise<{ valid: boolean; adminId?: string; error?: string }> {
  try {
    // Rate limiting para verificación de sesiones (prevenir ataques de fuerza bruta)
    if (isRedisConfigured()) {
      const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                       request.headers.get('x-real-ip') || 
                       '127.0.0.1'
      
      const identifier = `session-verify:${clientIP}`
      
      try {
        const result = await authBurstRateLimit.limit(identifier)
        if (!result.success) {
          console.warn('[Session Verify] Rate limit exceeded for IP:', clientIP)
          return { valid: false, error: 'Invalid admin session' }
        }
      } catch (error) {
        console.error('[Session Verify] Rate limit check failed:', error)
        // Fail open on rate limit errors
      }
    }

    // Obtener y parsear cookies del request
    const cookieHeader = request.headers.get('cookie')
    if (!cookieHeader) {
      console.warn('[Session Verify] No cookie header present')
      return { valid: false, error: 'Invalid admin session' }
    }

    const cookies = parseCookies(cookieHeader)
    const devAuth = cookies['dev-auth']
    const adminId = cookies['dev-admin-id']

    // Validar presencia de cookies requeridas
    if (!devAuth || !adminId) {
      console.warn('[Session Verify] Missing required cookies:', { 
        hasDevAuth: !!devAuth, 
        hasAdminId: !!adminId 
      })
      return { valid: false, error: 'Invalid admin session' }
    }

    // Validar formato del session token (64 caracteres hex)
    if (!isValidSessionToken(devAuth)) {
      console.warn('[Session Verify] Invalid session token format')
      return { valid: false, error: 'Invalid admin session' }
    }

    // Validar formato del admin ID (UUID)
    if (!isValidUUID(adminId)) {
      console.warn('[Session Verify] Invalid admin ID format')
      return { valid: false, error: 'Invalid admin session' }
    }

    // Verificar sesión en la base de datos
    const { data: session, error } = await supabase
      .from('dev_sessions')
      .select('id, is_active, expires_at')
      .eq('session_token', devAuth)
      .eq('admin_id', adminId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.error('[Session Verify] Database error:', error)
      return { valid: false, error: 'Invalid admin session' }
    }

    if (!session) {
      console.warn('[Session Verify] Session not found or inactive:', { adminId })
      return { valid: false, error: 'Invalid admin session' }
    }

    // Verificar expiración
    const now = new Date()
    const expiresAt = new Date(session.expires_at)

    if (now > expiresAt) {
      console.warn('[Session Verify] Session expired:', { adminId, expiresAt })
      
      // Desactivar sesión expirada de forma asíncrona (no bloqueante)
      supabase
        .from('dev_sessions')
        .update({ is_active: false })
        .eq('id', session.id)
        .then(({ error }) => {
          if (error) {
            console.error('[Session Verify] Failed to deactivate expired session:', error)
          }
        })

      return { valid: false, error: 'Invalid admin session' }
    }

    return { valid: true, adminId }
  } catch (error) {
    console.error('[Session Verify] Unexpected error:', error)
    return { valid: false, error: 'Invalid admin session' }
  }
}

// Enmascarar código para mostrar solo los últimos 8 caracteres
function maskCode(code: string): string {
  if (code.length <= 8) return code
  return '•'.repeat(code.length - 8) + code.slice(-8)
}

export async function POST(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const body = await request.json()
    const { 
      type, 
      expiresInHours = 48, 
      maxUses = 1,
      notes = ''
    } = body

    // Validaciones
    if (!type || !['cliente', 'empresa'].includes(type)) {
      return NextResponse.json(
        { error: 'Tipo de código inválido. Debe ser "cliente" o "empresa"' },
        { status: 400 }
      )
    }

    if (typeof maxUses !== 'number' || maxUses < 1) {
      return NextResponse.json(
        { error: 'maxUses debe ser un número mayor a 0' },
        { status: 400 }
      )
    }

    if (typeof expiresInHours !== 'number' || expiresInHours < 1) {
      return NextResponse.json(
        { error: 'expiresInHours debe ser un número mayor a 0' },
        { status: 400 }
      )
    }

    // Generar código único y seguro
    const code = generateSecureCode()
    
    // Calcular fecha de expiración
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiresInHours)

    // Insertar en la base de datos
    const { data, error } = await supabase
      .from('invitation_codes')
      .insert({
        code,
        type,
        expires_at: expiresAt.toISOString(),
        max_uses: maxUses,
        current_uses: 0,
        is_active: true,
        notes: notes || null
      })
      .select()
      .single()

    if (error) {
      console.error('Error al crear código de invitación:', error)
      return NextResponse.json(
        { error: 'Error al crear código de invitación' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      code: data.code,
      type: data.type,
      expiresAt: data.expires_at,
      maxUses: data.max_uses,
      id: data.id
    })

  } catch (error) {
    console.error('Error en POST /api/invitation-codes:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// Validar un código de invitación o listar todos los códigos
export async function GET(request: Request) {
  // Rate limiting para GET
  const rateLimitResponse = await checkStandardRateLimit(request as NextRequest)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const type = searchParams.get('type')
    const includeUsed = searchParams.get('includeUsed') === 'true'
    const includeExpired = searchParams.get('includeExpired') === 'true'

    // Si no se proporciona código, listar todos los códigos (requiere autenticación de admin)
    if (!code) {
      // Verificar autenticación de admin
      const authResult = await verifyDevAdminSession(request)
      if (!authResult.valid) {
        return NextResponse.json(
          { error: authResult.error || 'No autorizado' },
          { status: 401 }
        )
      }

      // Construir query con filtros en el lado del servidor
      let query = supabase
        .from('invitation_codes')
        .select('id, type, created_at, expires_at, used_at, used_by, is_active, max_uses, current_uses, notes, code')
        .order('created_at', { ascending: false })

      // Filtros opcionales para listar (aplicados en la DB)
      if (!includeExpired) {
        query = query.gt('expires_at', new Date().toISOString())
      }

      const { data, error } = await query

      if (error) {
        console.error('Error al listar códigos:', error)
        return NextResponse.json(
          { error: 'Error al listar códigos' },
          { status: 500 }
        )
      }

      // Filtrar por usos (comparación de columnas no soportada directamente en PostgREST)
      let filteredData = data || []
      if (!includeUsed) {
        filteredData = filteredData.filter(c => c.current_uses < c.max_uses)
      }

      // Para admin mostramos el código completo
      return NextResponse.json({
        success: true,
        codes: filteredData
      })
    }

    // Validar código específico
    // Buscar el código en la base de datos
    const { data, error } = await supabase
      .from('invitation_codes')
      .select('*')
      .eq('code', code)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { valid: false, error: 'Código inválido' },
        { status: 404 }
      )
    }

    // Validar que el código esté activo
    if (!data.is_active) {
      return NextResponse.json(
        { valid: false, error: 'Código desactivado' },
        { status: 400 }
      )
    }

    // Validar que no haya expirado
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json(
        { valid: false, error: 'Código expirado' },
        { status: 400 }
      )
    }

    // Validar que no se hayan excedido los usos
    if (data.current_uses >= data.max_uses) {
      return NextResponse.json(
        { valid: false, error: 'Código ya ha sido usado el máximo de veces' },
        { status: 400 }
      )
    }

    // Validar tipo si se proporciona
    if (type && data.type !== type) {
      return NextResponse.json(
        { valid: false, error: `Este código es solo para ${data.type}s` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      valid: true,
      type: data.type,
      expiresAt: data.expires_at,
      remainingUses: data.max_uses - data.current_uses
    })

  } catch (error) {
    console.error('Error en GET /api/invitation-codes:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// Marcar código como usado o desactivar código
export async function PATCH(request: Request) {
  // Rate limiting para PATCH
  const rateLimitResponse = await checkStandardRateLimit(request as NextRequest)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const body = await request.json()
    const { code, usedBy, codeId, action } = body

    // Acción de desactivar código por ID (requiere autenticación de admin)
    if (action !== undefined || codeId !== undefined) {
      // Validar que action sea exactamente 'deactivate'
      if (action !== 'deactivate') {
        return NextResponse.json(
          { error: 'Acción no válida. Solo se permite "deactivate"' },
          { status: 400 }
        )
      }

      // Validar que codeId esté presente
      if (!codeId) {
        return NextResponse.json(
          { error: 'ID del código es requerido para desactivar' },
          { status: 400 }
        )
      }

      // Validar formato de codeId (debe ser UUID)
      if (typeof codeId !== 'string' || !isValidUUID(codeId)) {
        return NextResponse.json(
          { error: 'ID del código tiene formato inválido' },
          { status: 400 }
        )
      }

      // Verificar autenticación de admin
      const authResult = await verifyDevAdminSession(request)
      if (!authResult.valid) {
        return NextResponse.json(
          { error: authResult.error || 'No autorizado para desactivar códigos' },
          { status: 401 }
        )
      }

      // Verificar que el código existe antes de actualizarlo
      const { data: existingCode, error: fetchError } = await supabase
        .from('invitation_codes')
        .select('id')
        .eq('id', codeId)
        .maybeSingle()

      if (fetchError) {
        console.error('Error buscando código:', fetchError)
        return NextResponse.json(
          { error: 'Error al buscar el código' },
          { status: 500 }
        )
      }

      if (!existingCode) {
        return NextResponse.json(
          { error: 'Código no encontrado' },
          { status: 404 }
        )
      }

      // Desactivar el código
      const { error: updateError } = await supabase
        .from('invitation_codes')
        .update({ is_active: false })
        .eq('id', codeId)

      if (updateError) {
        console.error('Error al desactivar código:', updateError)
        return NextResponse.json(
          { error: 'Error al desactivar código' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Código desactivado exitosamente'
      })
    }

    // Acción de marcar como usado (requiere code)
    if (!code) {
      return NextResponse.json(
        { error: 'Código no proporcionado' },
        { status: 400 }
      )
    }

    // Obtener el código actual
    const { data: currentCode, error: fetchError } = await supabase
      .from('invitation_codes')
      .select('*')
      .eq('code', code)
      .single()

    if (fetchError || !currentCode) {
      return NextResponse.json(
        { error: 'Código no encontrado' },
        { status: 404 }
      )
    }

    // Verificar si aún puede usarse
    if (currentCode.current_uses >= currentCode.max_uses) {
      return NextResponse.json(
        { error: 'Código ya ha alcanzado el máximo de usos' },
        { status: 400 }
      )
    }

    // Incrementar el contador de usos
    const newUses = currentCode.current_uses + 1
    const updates: any = {
      current_uses: newUses
    }

    // Si es el primer uso, marcar la fecha
    if (!currentCode.used_at) {
      updates.used_at = new Date().toISOString()
    }

    // Si se proporciona quién lo usó
    if (usedBy) {
      updates.used_by = usedBy
    }

    // Si alcanzó el máximo de usos, desactivar
    if (newUses >= currentCode.max_uses) {
      updates.is_active = false
    }

    const { error: updateError } = await supabase
      .from('invitation_codes')
      .update(updates)
      .eq('code', code)

    if (updateError) {
      console.error('Error al actualizar código:', updateError)
      return NextResponse.json(
        { error: 'Error al actualizar código' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Código marcado como usado',
      remainingUses: currentCode.max_uses - newUses
    })

  } catch (error) {
    console.error('Error en PATCH /api/invitation-codes:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
