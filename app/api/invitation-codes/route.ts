import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { checkStandardRateLimit } from '@/lib/rate-limit'
import { verifyDevAdminSession } from '@/lib/auth-utils'

// Configuración de límites para códigos de invitación
const MAX_MAX_USES = 100 // Máximo número de usos permitido
const MAX_EXPIRES_HOURS = 720 // Máximo tiempo de expiración (30 días)

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

// Enmascarar código para mostrar solo los últimos 8 caracteres
function maskCode(code: string): string {
  if (code.length <= 8) return code
  return '•'.repeat(code.length - 8) + code.slice(-8)
}

export async function POST(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  // Verificar que el usuario es admin antes de crear códigos
  const authResult = await verifyDevAdminSession(request)
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'No autorizado. Se requiere sesión de administrador.' },
      { status: 401 }
    )
  }

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

    // Validar límite superior de maxUses
    if (maxUses > MAX_MAX_USES) {
      return NextResponse.json(
        { error: `maxUses no puede exceder ${MAX_MAX_USES}` },
        { status: 400 }
      )
    }

    if (typeof expiresInHours !== 'number' || expiresInHours < 1) {
      return NextResponse.json(
        { error: 'expiresInHours debe ser un número mayor a 0' },
        { status: 400 }
      )
    }

    // Validar límite superior de expiresInHours
    if (expiresInHours > MAX_EXPIRES_HOURS) {
      return NextResponse.json(
        { error: `expiresInHours no puede exceder ${MAX_EXPIRES_HOURS} (30 días)` },
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
