import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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

export async function POST(request: Request) {
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

// Validar un código de invitación
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const type = searchParams.get('type')

    if (!code) {
      return NextResponse.json(
        { error: 'Código no proporcionado' },
        { status: 400 }
      )
    }

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

// Marcar código como usado
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { code, usedBy } = body

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

// Listar códigos de invitación
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const includeUsed = searchParams.get('includeUsed') === 'true'
    const includeExpired = searchParams.get('includeExpired') === 'true'

    let query = supabase
      .from('invitation_codes')
      .select('*')
      .order('created_at', { ascending: false })

    // Filtros opcionales
    if (!includeUsed) {
      query = query.lt('current_uses', supabase.rpc('max_uses'))
    }

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

    return NextResponse.json({
      success: true,
      codes: data
    })

  } catch (error) {
    console.error('Error en DELETE /api/invitation-codes:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
