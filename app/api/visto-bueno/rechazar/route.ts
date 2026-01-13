import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checkUploadRateLimit } from '@/lib/rate-limit'
import { isValidUUID } from '@/lib/auth-utils'

// ============================================================================
// CONFIGURACIÓN DE SEGURIDAD
// ============================================================================

const MAX_FILE_SIZE = 3 * 1024 * 1024 // 3MB
const MAX_MOTIVO_LENGTH = 500
const MIN_MOTIVO_LENGTH = 20

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png'
]

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']

// Magic bytes para validar tipo de archivo real (prevenir spoofing)
const FILE_SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xFF, 0xD8, 0xFF]], // JPEG
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]] // PNG
}

// Normaliza MIME types (image/jpg -> image/jpeg)
function normalizeMimeType(mimeType: string): string {
  if (mimeType === 'image/jpg') return 'image/jpeg'
  return mimeType
}

// ============================================================================
// FUNCIONES DE VALIDACIÓN Y SANITIZACIÓN
// ============================================================================

/**
 * Valida los magic bytes del archivo para asegurar que es del tipo correcto
 */
async function validateFileSignature(file: File): Promise<boolean> {
  try {
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    
    // Normalizar MIME type antes de buscar en signatures
    const normalizedType = normalizeMimeType(file.type)
    const signatures = FILE_SIGNATURES[normalizedType]
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
  return fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .substring(0, 100)
}

/**
 * Valida que la extensión del archivo sea permitida
 */
function hasValidExtension(fileName: string): boolean {
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0]
  return extension ? ALLOWED_EXTENSIONS.includes(extension) : false
}

/**
 * Sanitiza el texto del motivo removiendo HTML y caracteres peligrosos
 */
function sanitizeMotivo(text: string): string {
  return text
    // Remover tags HTML
    .replace(/<[^>]*>/g, '')
    // Remover caracteres de control excepto newlines
    .replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalizar espacios múltiples
    .replace(/\s+/g, ' ')
    // Trim
    .trim()
    // Limitar longitud
    .substring(0, MAX_MOTIVO_LENGTH)
}

/**
 * Valida formato de mes YYYY-MM
 */
function isValidMesFormat(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
}

// ============================================================================
// ENDPOINT: POST /api/visto-bueno/rechazar
// ============================================================================

export async function POST(request: NextRequest) {
  // Rate limiting: 10 uploads per hour
  const rateLimitResponse = await checkUploadRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    // 1. Verificar autenticación
    const userId = request.headers.get('x-user-id')
    const tipoCliente = request.headers.get('x-tipo-cliente')

    if (!userId) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      )
    }

    // Validar formato de userId (prevenir inyección)
    if (userId.length > 50 || !/^[a-zA-Z0-9-_]+$/.test(userId)) {
      return NextResponse.json(
        { error: 'ID de usuario inválido' },
        { status: 400 }
      )
    }

    if (!tipoCliente || !['cliente', 'empresa'].includes(tipoCliente)) {
      return NextResponse.json(
        { error: 'Tipo de cliente inválido' },
        { status: 400 }
      )
    }

    // 2. Obtener datos del FormData
    const formData = await request.formData()
    const mes = formData.get('mes') as string
    const motivoRaw = formData.get('motivo') as string
    const archivo = formData.get('archivo') as File | null
    const fechaSimulada = formData.get('fechaSimulada') as string | null

    // 3. Validar mes
    if (!mes || !isValidMesFormat(mes)) {
      return NextResponse.json(
        { error: 'Formato de mes inválido. Use YYYY-MM' },
        { status: 400 }
      )
    }

    // 4. Validar y sanitizar motivo
    if (!motivoRaw) {
      return NextResponse.json(
        { error: 'El motivo del rechazo es requerido' },
        { status: 400 }
      )
    }

    const motivo = sanitizeMotivo(motivoRaw)

    if (motivo.length < MIN_MOTIVO_LENGTH) {
      return NextResponse.json(
        { error: `El motivo debe tener al menos ${MIN_MOTIVO_LENGTH} caracteres` },
        { status: 400 }
      )
    }

    if (motivo.length > MAX_MOTIVO_LENGTH) {
      return NextResponse.json(
        { error: `El motivo no puede exceder ${MAX_MOTIVO_LENGTH} caracteres` },
        { status: 400 }
      )
    }

    // 5. Variables para archivo (opcional)
    let archivoPath: string | null = null
    let archivoUrl: string | null = null

    // 6. Validar y subir archivo si se proporcionó
    if (archivo && archivo.size > 0) {
      // Validar tamaño
      if (archivo.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: 'El archivo es demasiado grande. Máximo 3MB' },
          { status: 400 }
        )
      }

      // Validar tipo MIME (normalizar image/jpg a image/jpeg)
      const normalizedMimeType = normalizeMimeType(archivo.type)
      if (!ALLOWED_MIME_TYPES.includes(normalizedMimeType)) {
        return NextResponse.json(
          { error: 'Tipo de archivo no permitido. Solo se aceptan PDF, JPG, JPEG y PNG' },
          { status: 400 }
        )
      }

      // Validar extensión
      if (!hasValidExtension(archivo.name)) {
        return NextResponse.json(
          { error: 'Extensión de archivo no permitida' },
          { status: 400 }
        )
      }

      // Validar magic bytes (firma del archivo)
      const isValidSignature = await validateFileSignature(archivo)
      if (!isValidSignature) {
        return NextResponse.json(
          { error: 'El archivo no corresponde al tipo declarado. Posible intento de falsificación' },
          { status: 400 }
        )
      }

      // Generar nombre único y seguro
      const timestamp = Date.now()
      const sanitizedName = sanitizeFileName(archivo.name)
      const fileExtension = sanitizedName.match(/\.[^.]+$/)?.[0] || ''
      archivoPath = `${tipoCliente}/${userId}/${mes}_${timestamp}${fileExtension}`

      // Subir archivo a Supabase Storage
      const { error: uploadError } = await supabase
        .storage
        .from('visto-bueno-rechazos')
        .upload(archivoPath, archivo, {
          contentType: archivo.type,
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('Error uploading rejection file:', uploadError)
        return NextResponse.json(
          { error: 'Error al subir el archivo' },
          { status: 500 }
        )
      }

      // Generar URL firmada para respuesta
      const { data: signedUrlData } = await supabase
        .storage
        .from('visto-bueno-rechazos')
        .createSignedUrl(archivoPath, 3600) // 1 hora

      archivoUrl = signedUrlData?.signedUrl || null
    }

    // 7. Determinar fecha de rechazo con validación
    let fechaRechazo: string
    if (fechaSimulada) {
      const parsedDate = new Date(fechaSimulada)
      if (isNaN(parsedDate.getTime())) {
        // Si se subió un archivo, eliminarlo antes de retornar error
        if (archivoPath) {
          await supabase.storage.from('visto-bueno-rechazos').remove([archivoPath])
        }
        return NextResponse.json(
          { error: 'Fecha simulada inválida' },
          { status: 400 }
        )
      }
      fechaRechazo = parsedDate.toISOString()
    } else {
      fechaRechazo = new Date().toISOString()
    }

    // 8. Obtener registro existente para manejar archivo huérfano
    // Note: Using 'as any' because visto_bueno_mensual is not in generated Supabase types yet
    const { data: existingRecord } = await (supabase as any)
      .from('visto_bueno_mensual')
      .select('archivo_rechazo_path')
      .eq('client_id', userId)
      .eq('client_type', tipoCliente)
      .eq('mes', mes)
      .maybeSingle()

    const existingArchivoPath = existingRecord?.archivo_rechazo_path

    // 9. Upsert en visto_bueno_mensual
    const { data, error: dbError } = await (supabase as any)
      .from('visto_bueno_mensual')
      .upsert({
        client_id: userId,
        client_type: tipoCliente,
        mes: mes,
        estado: 'rechazado',
        dado: false,
        motivo_rechazo: motivo,
        archivo_rechazo_path: archivoPath,
        fecha_rechazo: fechaRechazo,
        fecha_visto_bueno: null // Limpiar fecha de aprobación previa si existía
      }, {
        onConflict: 'client_id,client_type,mes'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Error al registrar rechazo:', dbError)
      
      // Si falla el registro, eliminar el archivo subido
      if (archivoPath) {
        await supabase.storage.from('visto-bueno-rechazos').remove([archivoPath])
      }

      return NextResponse.json(
        { error: 'Error al registrar el rechazo' },
        { status: 500 }
      )
    }

    // 10. Eliminar archivo anterior si existía y fue reemplazado o eliminado
    if (existingArchivoPath && existingArchivoPath !== archivoPath) {
      try {
        await supabase.storage.from('visto-bueno-rechazos').remove([existingArchivoPath])
      } catch (cleanupError) {
        console.error('Error eliminando archivo anterior:', cleanupError)
        // No fallar la operación por esto
      }
    }

    // 11. Log de auditoría (opcional, usar audit_log si existe)
    console.log(`[VISTO_BUENO_RECHAZO] Cliente ${tipoCliente}:${userId} rechazó mes ${mes}`)

    return NextResponse.json({
      success: true,
      message: 'Rechazo registrado exitosamente',
      data: {
        id: data?.id,
        mes: mes,
        estado: 'rechazado',
        motivo: motivo,
        archivo_url: archivoUrl,
        fecha_rechazo: fechaRechazo
      }
    })

  } catch (error) {
    console.error('Error en POST /api/visto-bueno/rechazar:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
