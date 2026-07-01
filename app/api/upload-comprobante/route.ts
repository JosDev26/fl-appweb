import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCurrentDateCR, getMesAnterior, toDateString } from '@/lib/dateUtils'
import { checkUploadRateLimit } from '@/lib/rate-limit'

// Configuración de seguridad
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg', 
  'image/png'
]

// Extensiones permitidas (validación adicional)
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']

// Magic bytes para validar tipo de archivo real (prevenir spoofing de extensión)
const FILE_SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xFF, 0xD8, 0xFF]], // JPEG
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]] // PNG
}

/**
 * Valida los magic bytes del archivo para asegurar que es del tipo correcto
 */
async function validateFileSignature(file: File): Promise<boolean> {
  try {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    
    const signatures = FILE_SIGNATURES[file.type]
    if (!signatures) return false
    
    return signatures.some(signature => {
      return signature.every((byte, index) => bytes[index] === byte)
    })
  } catch (error) {
    console.error('Error validating file signature:', error)
    return false
  }
}

/**
 * Sanitiza el nombre del archivo removiendo caracteres peligrosos
 */
function sanitizeFileName(fileName: string): string {
  // Remover caracteres peligrosos y path traversal
  return fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .substring(0, 100) // Limitar longitud
}

/**
 * Valida que la extensión del archivo sea permitida
 */
function hasValidExtension(fileName: string): boolean {
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0]
  return extension ? ALLOWED_EXTENSIONS.includes(extension) : false
}

export async function POST(request: NextRequest) {
  // Rate limiting: 10 uploads per hour
  const rateLimitResponse = await checkUploadRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    // 1. Verificar autenticación
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    // Para desarrollo, obtener el user_id del header
    const userId = request.headers.get('x-user-id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      )
    }

    // 2. Obtener tipo de cliente del header
    const tipoCliente = request.headers.get('x-tipo-cliente') || 'cliente'
    
    if (!['cliente', 'empresa'].includes(tipoCliente)) {
      return NextResponse.json(
        { error: 'Tipo de cliente inválido' },
        { status: 400 }
      )
    }

    // 3. Obtener el archivo del FormData
    const formData = await request.formData()
    const file = formData.get('file') as File
    const montoPago = formData.get('monto') as string
    const simulatedDate = formData.get('simulatedDate') as string | null // Fecha simulada desde el cliente
    const mesEspecifico = formData.get('mes_pago') as string | null // Mes específico (pagos parciales por mes)
    const solicitudId = (formData.get('solicitud_id') as string | null) || null // Solicitud específica (etapa/pago_unico)
    const itemsPagadosRaw = (formData.get('items_pagados') as string | null) || null // Items seleccionables (admin /dev)

    // Validar solicitud_id si se proporcionó (UUID format)
    if (solicitudId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(solicitudId)) {
      return NextResponse.json(
        { error: 'solicitud_id inválido' },
        { status: 400 }
      )
    }

    // Parsear y validar items_pagados (JSON con IDs de items a marcar como pagados)
    let itemsPagados: any = null
    if (itemsPagadosRaw) {
      try {
        const parsed = JSON.parse(itemsPagadosRaw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Validar estructura esperada: { gastos?: [ids], servicios?: [ids], tph?: [ids], mensualidades?: [{solicitudId, mes}] }
          const allowed = ['gastos', 'servicios', 'tph', 'mensualidades']
          const keys = Object.keys(parsed)
          const valid = keys.every(k => allowed.includes(k))
          if (!valid) {
            return NextResponse.json({ error: 'items_pagados: claves inválidas' }, { status: 400 })
          }
          itemsPagados = parsed
        }
      } catch {
        return NextResponse.json({ error: 'items_pagados: JSON inválido' }, { status: 400 })
      }
    }
    
    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      )
    }

    // 4. DETERMINAR MES DE PAGO
    // Si se proporciona mes_pago (formato YYYY-MM), usar ese mes específico
    // Si no, usar el mes anterior como siempre (backward compatible)
    let mesPago: string
    if (mesEspecifico && /^\d{4}-\d{2}$/.test(mesEspecifico)) {
      const [y, m] = mesEspecifico.split('-').map(Number)
      if (m >= 1 && m <= 12 && y >= 2020 && y <= 2100) {
        mesPago = mesEspecifico
        console.log('📅 Mes de pago específico:', mesPago)
      } else {
        return NextResponse.json(
          { error: 'Formato de mes inválido. Use YYYY-MM (ej: 2026-02)' },
          { status: 400 }
        )
      }
    } else {
      const now = await getCurrentDateCR(simulatedDate)
      const mesAnterior = getMesAnterior(now)
      mesPago = mesAnterior.mesPago
      console.log('📅 Mes de pago (mes anterior):', mesPago, '| Fecha actual CR:', toDateString(now))
    }

    // Verificar duplicados: lógica diferente según si es pago de solicitud específica o mensual
    if (solicitudId) {
      // Para etapa/pago_unico: verificar que la solicitud no esté ya pagada
      const { data: solicitudData } = await supabase
        .from('solicitudes')
        .select('id, estado_pago, titulo')
        .eq('id', solicitudId)
        .single()

      if (!solicitudData) {
        return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 400 })
      }
      if ((solicitudData as any).estado_pago?.toLowerCase() === 'pagado') {
        return NextResponse.json({ error: 'Esta solicitud ya está completamente pagada' }, { status: 400 })
      }

      // Verificar que no exista otro comprobante para la misma solicitud en el mismo mes
      const { data: existingBySolicitud } = await (supabase as any)
        .from('payment_receipts')
        .select('id, estado')
        .eq('user_id', userId)
        .eq('solicitud_id' as any, solicitudId)
        .eq('mes_pago', mesPago)
        .in('estado', ['pendiente', 'aprobado'])

      console.log('🔍 Verificando comprobantes por solicitud:', { userId, solicitudId, mesPago, count: existingBySolicitud?.length || 0 })

      if (existingBySolicitud && existingBySolicitud.length > 0) {
        const estado = (existingBySolicitud[0] as any).estado
        return NextResponse.json(
          {
            error: estado === 'aprobado'
              ? 'Ya existe un comprobante aprobado para esta solicitud en este mes.'
              : 'Ya existe un comprobante pendiente para esta solicitud en este mes. Espera a que sea revisado.'
          },
          { status: 400 }
        )
      }
    } else {
      // Para pagos mensuales consolidados: unicidad por (user_id, tipo_cliente, mes_pago)
      const { data: existingReceipts } = await supabase
        .from('payment_receipts' as any)
        .select('id, estado')
        .eq('user_id', userId)
        .eq('tipo_cliente', tipoCliente)
        .eq('mes_pago', mesPago)
        .is('solicitud_id' as any, null)
        .in('estado', ['pendiente', 'aprobado'])

      console.log('🔍 Verificando comprobantes mensuales:', { userId, tipoCliente, mesPago, count: existingReceipts?.length || 0 })

      if (existingReceipts && existingReceipts.length > 0) {
        const estado = (existingReceipts[0] as any).estado
        return NextResponse.json(
          {
            error: estado === 'aprobado'
              ? 'Ya existe un comprobante aprobado para este mes. No puedes subir otro comprobante.'
              : 'Ya existe un comprobante pendiente de revisión para este mes. Espera a que sea revisado antes de subir otro.'
          },
          { status: 400 }
        )
      }
    }

    // 5. VALIDACIONES DE SEGURIDAD DEL ARCHIVO

    // Validar tamaño
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'El archivo es demasiado grande. Máximo 5MB' },
        { status: 400 }
      )
    }

    // Validar tipo MIME
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Solo se aceptan PDF, JPG, JPEG y PNG' },
        { status: 400 }
      )
    }

    // Validar extensión
    if (!hasValidExtension(file.name)) {
      return NextResponse.json(
        { error: 'Extensión de archivo no permitida' },
        { status: 400 }
      )
    }

    // Validar magic bytes (firma del archivo)
    const isValidSignature = await validateFileSignature(file)
    if (!isValidSignature) {
      return NextResponse.json(
        { error: 'El archivo no corresponde al tipo declarado. Posible intento de falsificación' },
        { status: 400 }
      )
    }

    // 6. Generar nombre único y seguro
    const timestamp = Date.now()
    const sanitizedName = sanitizeFileName(file.name)
    const fileExtension = sanitizedName.match(/\.[^.]+$/)?.[0] || ''
    const fileName = `${userId}/${timestamp}${fileExtension}`

    // 7. Subir archivo a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('payment-receipts')
      .upload(fileName, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Error uploading to storage:', uploadError)
      return NextResponse.json(
        { error: 'Error al subir el archivo' },
        { status: 500 }
      )
    }

    // 8. Registrar en la base de datos (mes_pago ya determinado antes)
    const uploadedAt = simulatedDate 
      ? new Date(simulatedDate + 'T' + new Date().toISOString().split('T')[1]).toISOString()
      : new Date().toISOString()
    
    const { data: receiptData, error: dbError } = await supabase
      .from('payment_receipts' as any)
      .insert({
        user_id: userId,
        tipo_cliente: tipoCliente,
        file_path: fileName,
        file_name: sanitizedName,
        file_size: file.size,
        file_type: file.type,
        mes_pago: mesPago,
        monto_declarado: montoPago ? parseFloat(montoPago) : null,
        estado: 'pendiente',
        uploaded_at: uploadedAt,
        ...(solicitudId ? { solicitud_id: solicitudId } : {}),
        ...(itemsPagados ? { items_pagados: itemsPagados } : {})
      } as any)
      .select()
      .single()

    if (dbError) {
      console.error('Error saving to database:', dbError)
      
      // Si falla el registro, eliminar el archivo subido
      await supabase.storage.from('payment-receipts').remove([fileName])
      
      return NextResponse.json(
        { error: 'Error al registrar el comprobante' },
        { status: 500 }
      )
    }

    // 9. Obtener URL firmada para preview (válida por 1 hora)
    const { data: signedUrlData } = await supabase
      .storage
      .from('payment-receipts')
      .createSignedUrl(fileName, 3600)

    return NextResponse.json({
      success: true,
      message: 'Comprobante subido exitosamente',
      receipt: {
        id: (receiptData as any).id,
        fileName: sanitizedName,
        fileSize: file.size,
        fileType: file.type,
        estado: (receiptData as any).estado,
        uploadedAt: (receiptData as any).uploaded_at,
        previewUrl: signedUrlData?.signedUrl
      }
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Error inesperado al procesar el archivo' },
      { status: 500 }
    )
  }
}

// Nota: En Next.js 15+, el límite de body se configura automáticamente.
// La ruta maneja multipart/form-data con límites en el cliente.
