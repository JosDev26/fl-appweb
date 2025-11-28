import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCurrentDateCR, getMesAnterior, toDateString } from '@/lib/dateUtils'

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
    
    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      )
    }

    // 4. DETERMINAR MES DE PAGO: SIEMPRE ES EL MES ANTERIOR
    // Si hoy es diciembre, se cobra noviembre
    // Si hoy es noviembre, se cobra octubre
    // Esto aplica tanto para mensualidades como para cobro por hora
    // Usa zona horaria de Costa Rica (UTC-6) y fecha simulada global si existe
    const now = await getCurrentDateCR(simulatedDate)
    const { mesPago } = getMesAnterior(now)
    console.log('📅 Mes de pago (mes anterior):', mesPago, '| Fecha actual CR:', toDateString(now))

    // Verificar si ya existe un comprobante pendiente o aprobado para este mes
    const { data: existingReceipts, error: existingError } = await supabase
      .from('payment_receipts' as any)
      .select('id, estado')
      .eq('user_id', userId)
      .eq('tipo_cliente', tipoCliente)
      .eq('mes_pago', mesPago)
      .in('estado', ['pendiente', 'aprobado'])

    console.log('🔍 Verificando comprobantes existentes:', { 
      userId, 
      tipoCliente, 
      mesPago, 
      count: existingReceipts?.length || 0,
      estados: existingReceipts?.map((r: any) => r.estado)
    })

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
        { error: 'Error al subir el archivo: ' + uploadError.message },
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
        uploaded_at: uploadedAt
      })
      .select()
      .single()

    if (dbError) {
      console.error('Error saving to database:', dbError)
      
      // Si falla el registro, eliminar el archivo subido
      await supabase.storage.from('payment-receipts').remove([fileName])
      
      return NextResponse.json(
        { error: 'Error al registrar el comprobante: ' + dbError.message },
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

// Configuración de Next.js para aumentar límite de body
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '6mb',
    },
  },
}
