import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Configuración de seguridad para facturas electrónicas
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB (más grande por XMLs)
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/xml',
    'text/xml'
]

// Extensiones permitidas
const ALLOWED_EXTENSIONS = ['.pdf', '.xml']

// Magic bytes para validar tipo de archivo real
const FILE_SIGNATURES: Record<string, number[][]> = {
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
    'application/xml': [[0x3C, 0x3F, 0x78, 0x6D, 0x6C]], // <?xml
    'text/xml': [[0x3C, 0x3F, 0x78, 0x6D, 0x6C]] // <?xml
}

/**
 * Valida los magic bytes del archivo
 */
async function validateFileSignature(file: File): Promise<boolean> {
    try {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)

        const signatures = FILE_SIGNATURES[file.type]
        if (!signatures) {
            // Si es XML, también verificar como text/xml
            const altSignatures = FILE_SIGNATURES['text/xml']
            if (!altSignatures) return false

            return altSignatures.some(signature => {
                return signature.every((byte, index) => bytes[index] === byte)
            })
        }

        return signatures.some(signature => {
            return signature.every((byte, index) => bytes[index] === byte)
        })
    } catch (error) {
        console.error('Error validating file signature:', error)
        return false
    }
}

/**
 * Sanitiza el nombre del archivo
 */
function sanitizeFileName(fileName: string): string {
    return fileName
        .replace(/[^a-zA-Z0-9.-]/g, '_')
        .replace(/\.{2,}/g, '_')
        .substring(0, 100)
}

/**
 * Valida la extensión del archivo
 */
function hasValidExtension(fileName: string): boolean {
    const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0]
    return extension ? ALLOWED_EXTENSIONS.includes(extension) : false
}

export async function POST(request: NextRequest) {
    try {
        // 1. Obtener datos del FormData
        const formData = await request.formData()
        const file = formData.get('file') as File
        const clientId = formData.get('clientId') as string
        const tipoCliente = formData.get('tipoCliente') as string

        if (!file) {
            return NextResponse.json(
                { error: 'No se proporcionó ningún archivo' },
                { status: 400 }
            )
        }

        if (!clientId || !tipoCliente) {
            return NextResponse.json(
                { error: 'clientId y tipoCliente son requeridos' },
                { status: 400 }
            )
        }

        if (!['cliente', 'empresa'].includes(tipoCliente)) {
            return NextResponse.json(
                { error: 'tipoCliente debe ser "cliente" o "empresa"' },
                { status: 400 }
            )
        }

        // 2. VALIDACIONES DE SEGURIDAD

        // Validar tamaño
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'El archivo es demasiado grande. Máximo 10MB' },
                { status: 400 }
            )
        }

        // Validar tipo MIME
        if (!ALLOWED_MIME_TYPES.includes(file.type)) {
            return NextResponse.json(
                { error: 'Tipo de archivo no permitido. Solo se aceptan PDF y XML' },
                { status: 400 }
            )
        }

        // Validar extensión
        if (!hasValidExtension(file.name)) {
            return NextResponse.json(
                { error: 'Extensión de archivo no permitida. Solo .pdf y .xml' },
                { status: 400 }
            )
        }

        // Validar magic bytes (firma del archivo) - solo para PDF
        // XML puede tener diferentes encodings, por lo que la validación es más flexible
        if (file.type === 'application/pdf') {
            const isValidSignature = await validateFileSignature(file)
            if (!isValidSignature) {
                return NextResponse.json(
                    { error: 'El archivo PDF no es válido' },
                    { status: 400 }
                )
            }
        }

        // 3. Verificar si ya existe una factura para este cliente
        const { data: existingInvoice, error: checkError } = await supabase
            .from('client_invoices' as any)
            .select('*')
            .eq('client_id', clientId)
            .eq('tipo_cliente', tipoCliente)
            .single()

        // Si existe, eliminar el archivo antiguo del storage
        if (existingInvoice && !checkError) {
            const oldFilePath = (existingInvoice as any).file_path
            await supabase.storage.from('invoices').remove([oldFilePath])

            // Eliminar registro antiguo
            await supabase
                .from('client_invoices' as any)
                .delete()
                .eq('id', (existingInvoice as any).id)
        }

        // 4. Generar nombre único y seguro
        const timestamp = Date.now()
        const sanitizedName = sanitizeFileName(file.name)
        const fileExtension = sanitizedName.match(/\.[^.]+$/)?.[0] || ''
        const fileName = `${clientId}/${timestamp}${fileExtension}`

        // 5. Subir archivo a Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from('invoices')
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

        // 6. Registrar en la base de datos
        const { data: invoiceData, error: dbError } = await supabase
            .from('client_invoices' as any)
            .insert({
                client_id: clientId,
                tipo_cliente: tipoCliente,
                file_path: fileName,
                file_name: sanitizedName,
                file_size: file.size,
                file_type: file.type,
                uploaded_by: 'admin' // En producción, obtener del usuario autenticado
            })
            .select()
            .single()

        if (dbError) {
            console.error('Error saving to database:', dbError)

            // Si falla el registro, eliminar el archivo subido
            await supabase.storage.from('invoices').remove([fileName])

            return NextResponse.json(
                { error: 'Error al registrar la factura: ' + dbError.message },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: 'Factura subida exitosamente',
            invoice: {
                id: (invoiceData as any).id,
                fileName: sanitizedName,
                fileSize: file.size,
                fileType: file.type,
                uploadedAt: (invoiceData as any).uploaded_at
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
            sizeLimit: '11mb',
        },
    },
}
