import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentDateCR, toDateString } from '@/lib/dateUtils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Tipos MIME permitidos
const ALLOWED_MIME_TYPES = {
  'application/pdf': '.pdf',
  'application/xml': '.xml',
  'text/xml': '.xml'
}

// Tamaño máximo: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Firmas mágicas de archivos (magic numbers) para validación
const FILE_SIGNATURES: { [key: string]: number[][] } = {
  pdf: [[0x25, 0x50, 0x44, 0x46]], // %PDF
  xml: [
    [0x3C, 0x3F, 0x78, 0x6D, 0x6C], // <?xml
    [0xEF, 0xBB, 0xBF, 0x3C, 0x3F, 0x78, 0x6D, 0x6C], // UTF-8 BOM + <?xml
  ]
}

// Validar firma del archivo
function validateFileSignature(buffer: Buffer, fileType: string): boolean {
  const signatures = FILE_SIGNATURES[fileType]
  if (!signatures) return false

  for (const signature of signatures) {
    let isMatch = true
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        isMatch = false
        break
      }
    }
    if (isMatch) return true
  }
  return false
}

// Sanitizar nombre de archivo
function sanitizeFileName(fileName: string): string {
  // Eliminar caracteres peligrosos y mantener solo letras, números, guiones y puntos
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.') // Evitar ataques de path traversal
    .substring(0, 255) // Limitar longitud
}

// Validar contenido XML (básico)
function validateXmlContent(content: string): boolean {
  // Verificar que no contenga scripts o contenido sospechoso
  const dangerousPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi, // event handlers (onclick, onerror, etc)
    /<!DOCTYPE[^>]*\[/gi, // External DTD entities
    /<!ENTITY/gi // Entity declarations
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      return false
    }
  }

  // Verificar que sea XML válido básico
  if (!content.trim().startsWith('<?xml') && !content.trim().startsWith('<')) {
    return false
  }

  return true
}

// Validar contenido PDF (básico)
function validatePdfContent(buffer: Buffer): boolean {
  const content = buffer.toString('latin1')
  
  // Verificar que comience con %PDF
  if (!content.startsWith('%PDF')) {
    return false
  }

  // Verificar que no contenga JavaScript embebido
  const dangerousPatterns = [
    /\/JavaScript/gi,
    /\/JS/gi,
    /\/Launch/gi,
    /\/OpenAction/gi,
    /\/AA/gi // Auto Actions
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      return false
    }
  }

  return true
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const clientId = formData.get('clientId') as string
    const clientType = formData.get('clientType') as string
    const simulatedDate = formData.get('simulatedDate') as string | null

    // Validaciones básicas
    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó ningún archivo' },
        { status: 400 }
      )
    }

    if (!clientId || !clientType) {
      return NextResponse.json(
        { error: 'ID de cliente o tipo no proporcionado' },
        { status: 400 }
      )
    }

    if (!['cliente', 'empresa'].includes(clientType)) {
      return NextResponse.json(
        { error: 'Tipo de cliente inválido' },
        { status: 400 }
      )
    }

    // Validar tipo MIME
    if (!Object.keys(ALLOWED_MIME_TYPES).includes(file.type)) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido. Solo se permiten XML y PDF' },
        { status: 400 }
      )
    }

    // Validar tamaño
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'El archivo excede el tamaño máximo de 10MB' },
        { status: 400 }
      )
    }

    // Validar extensión del archivo
    const fileExtension = file.name.split('.').pop()?.toLowerCase()
    if (!fileExtension || !['xml', 'pdf'].includes(fileExtension)) {
      return NextResponse.json(
        { error: 'Extensión de archivo no permitida' },
        { status: 400 }
      )
    }

    // Convertir archivo a buffer para validaciones de seguridad
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Validar firma del archivo (magic numbers)
    if (!validateFileSignature(buffer, fileExtension)) {
      return NextResponse.json(
        { error: 'El archivo no es válido o está corrupto' },
        { status: 400 }
      )
    }

    // Validaciones específicas por tipo de archivo
    if (fileExtension === 'xml') {
      const content = buffer.toString('utf-8')
      if (!validateXmlContent(content)) {
        return NextResponse.json(
          { error: 'El archivo XML contiene contenido no permitido o es inválido' },
          { status: 400 }
        )
      }
    } else if (fileExtension === 'pdf') {
      if (!validatePdfContent(buffer)) {
        return NextResponse.json(
          { error: 'El archivo PDF contiene contenido no permitido o es inválido' },
          { status: 400 }
        )
      }
    }

    // Obtener mes de la factura del formulario (mes de las horas trabajadas)
    const mesFacturaFromForm = formData.get('mesFactura') as string | null
    
    // Si no se proporciona, calcular automáticamente usando fecha Costa Rica
    const now = await getCurrentDateCR(simulatedDate)
    const mesFactura = mesFacturaFromForm || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    
    console.log('📅 Mes de factura:', mesFactura, '(proporcionado:', mesFacturaFromForm, ') | Fecha CR:', toDateString(now))
    
    // Verificar si ya existe una factura para este mes
    const folderPath = `${clientType}/${clientId}`
    const { data: existingFiles } = await supabase.storage
      .from('electronic-invoices')
      .list(folderPath, {
        limit: 1000,
        sortBy: { column: 'created_at', order: 'desc' }
      })
    
    // Buscar facturas del mismo mes en los metadatos del nombre
    const existingMonthInvoice = existingFiles?.find(file => 
      file.name && file.name.includes(`_${mesFactura}_`)
    )
    
    if (existingMonthInvoice) {
      return NextResponse.json(
        { error: `Ya existe una factura para ${mesFactura}. Solo se permite una factura por mes.` },
        { status: 400 }
      )
    }

    // Sanitizar nombre de archivo
    const sanitizedFileName = sanitizeFileName(file.name)
    // Usar timestamp de la fecha simulada o actual
    const timestamp = now.getTime()
    // Incluir mes en el nombre del archivo para fácil identificación
    const fileName = `${timestamp}_${mesFactura}_${sanitizedFileName}`

    // Determinar la ruta del archivo
    const filePath = `${clientType}/${clientId}/${fileName}`

    // Subir archivo a Supabase Storage
    const { data, error } = await supabase.storage
      .from('electronic-invoices')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Error al subir archivo:', error)
      return NextResponse.json(
        { error: 'Error al subir el archivo' },
        { status: 500 }
      )
    }

    // Crear registro de plazo de pago
    // Fecha de emisión: la fecha actual (segunda semana del mes siguiente al reportado)
    const fechaEmision = new Date(now)
    // Fecha de vencimiento: 14 días después de la emisión (configurable)
    const diasPlazo = 14
    const fechaVencimiento = new Date(fechaEmision)
    fechaVencimiento.setDate(fechaVencimiento.getDate() + diasPlazo)

    const { error: deadlineError } = await supabase
      .from('invoice_payment_deadlines')
      .insert({
        mes_factura: mesFactura,
        client_id: clientId,
        client_type: clientType,
        file_path: data.path,
        fecha_emision: fechaEmision.toISOString().split('T')[0],
        fecha_vencimiento: fechaVencimiento.toISOString().split('T')[0],
        dias_plazo: diasPlazo,
        estado_pago: 'pendiente'
      })

    if (deadlineError) {
      console.error('Error al crear plazo de pago:', deadlineError)
      // No fallar la subida de factura si falla el registro del plazo
    }

    return NextResponse.json({
      success: true,
      message: `Factura para ${mesFactura} subida exitosamente`,
      filePath: data.path,
      fileName: sanitizedFileName,
      mesFactura: mesFactura,
      fechaVencimiento: fechaVencimiento.toISOString().split('T')[0],
      diasPlazo: diasPlazo
    })

  } catch (error) {
    console.error('Error en POST /api/upload-invoice:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// Listar facturas de un cliente o todas las facturas del mes
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const clientType = searchParams.get('clientType')
    const getAllMonth = searchParams.get('getAllMonth') === 'true'

    // Si se solicitan todas las facturas del mes
    if (getAllMonth) {
      const invoices: any[] = []
      
      // Usar fecha simulada si se proporciona, o fecha global, o fecha real Costa Rica
      const simulatedDate = searchParams.get('simulatedDate')
      const now = await getCurrentDateCR(simulatedDate)
      
      // Calcular mes anterior (mes de las horas trabajadas / mes de facturación)
      const mesAnterior = new Date(now)
      mesAnterior.setMonth(mesAnterior.getMonth() - 1)
      const currentMonth = mesAnterior.getMonth()
      const currentYear = mesAnterior.getFullYear()
      
      console.log('📅 [GET invoices] Fecha CR:', toDateString(now), '| Buscando facturas de:', `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`)
      
      // Función auxiliar para procesar archivos de una carpeta
      const processFolder = async (type: 'cliente' | 'empresa', folderId: string) => {
        try {
          const { data: files, error } = await supabase.storage
            .from('electronic-invoices')
            .list(`${type}/${folderId}`, {
              limit: 1000,
              sortBy: { column: 'created_at', order: 'desc' }
            })

          if (error) {
            console.error(`Error listing files in ${type}/${folderId}:`, error)
            return
          }

          if (files && files.length > 0) {
            const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
            const monthFiles = files.filter(file => {
              // Filtrar por mes en el nombre del archivo (más confiable)
              if (file.name && file.name.includes(`_${currentMonthStr}_`)) {
                return true
              }
              // Fallback: filtrar por fecha de creación
              if (!file.created_at) return false
              const fileDate = new Date(file.created_at)
              return fileDate.getMonth() === currentMonth && fileDate.getFullYear() === currentYear
            })

            for (const file of monthFiles) {
              if (file.name && file.id) { // Asegurar que no es una carpeta vacía
                invoices.push({
                  ...file,
                  clientId: folderId,
                  clientType: type,
                  path: `${type}/${folderId}/${file.name}`
                })
              }
            }
          }
        } catch (err) {
          console.error(`Error processing folder ${type}/${folderId}:`, err)
        }
      }

      // Obtener todos los clientes y empresas (no solo con modo pago activo)
      // porque queremos ver todas las facturas históricas
      const { data: clientes, error: clientesError } = await supabase
        .from('usuarios')
        .select('id, nombre, cedula')

      const { data: empresas, error: empresasError } = await supabase
        .from('empresas')
        .select('id, nombre, cedula')

      console.log('Clientes encontrados:', clientes?.length, clientesError)
      console.log('Empresas encontradas:', empresas?.length, empresasError)

      // Procesar carpetas de clientes
      if (clientes && clientes.length > 0) {
        for (const cliente of clientes) {
          await processFolder('cliente', cliente.id)
        }
      }

      // Procesar carpetas de empresas
      if (empresas && empresas.length > 0) {
        for (const empresa of empresas) {
          await processFolder('empresa', empresa.id)
        }
      }

      console.log('Total de facturas procesadas:', invoices.length)

      // Crear mapas para búsqueda rápida
      const clientesMap = new Map(clientes?.map(c => [c.id, c]) || [])
      const empresasMap = new Map(empresas?.map(e => [e.id, e]) || [])

      // Enriquecer datos de facturas con información del cliente
      const enrichedInvoices = invoices.map(invoice => {
        let clientInfo = null
        if (invoice.clientType === 'cliente') {
          clientInfo = clientesMap.get(invoice.clientId)
        } else {
          clientInfo = empresasMap.get(invoice.clientId)
        }

        return {
          ...invoice,
          clientName: clientInfo?.nombre || 'Desconocido',
          clientCedula: clientInfo?.cedula || 'N/A'
        }
      })

      // Ordenar por fecha de creación descendente
      enrichedInvoices.sort((a, b) => {
        if (!a.created_at || !b.created_at) return 0
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

      console.log(`Found ${enrichedInvoices.length} invoices for current month`)

      return NextResponse.json({
        success: true,
        invoices: enrichedInvoices,
        count: enrichedInvoices.length
      })
    }

    // Si se solicitan facturas de un cliente específico
    if (!clientId || !clientType) {
      return NextResponse.json(
        { error: 'ID de cliente o tipo no proporcionado' },
        { status: 400 }
      )
    }

    const folderPath = `${clientType}/${clientId}`

    const { data, error } = await supabase.storage
      .from('electronic-invoices')
      .list(folderPath, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      })

    if (error) {
      console.error('Error al listar facturas:', error)
      return NextResponse.json(
        { error: 'Error al obtener facturas' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      files: data || []
    })

  } catch (error) {
    console.error('Error en GET /api/upload-invoice:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// Eliminar factura
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('filePath')

    if (!filePath) {
      return NextResponse.json(
        { error: 'Ruta del archivo no proporcionada' },
        { status: 400 }
      )
    }

    const { error } = await supabase.storage
      .from('electronic-invoices')
      .remove([filePath])

    if (error) {
      console.error('Error al eliminar factura:', error)
      return NextResponse.json(
        { error: 'Error al eliminar el archivo' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Factura eliminada exitosamente'
    })

  } catch (error) {
    console.error('Error en DELETE /api/upload-invoice:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// Verificar si un cliente tiene factura electrónica del mes actual
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { clientId, clientType } = body

    if (!clientId || !clientType) {
      return NextResponse.json(
        { error: 'ID de cliente o tipo no proporcionado' },
        { status: 400 }
      )
    }

    if (!['cliente', 'empresa'].includes(clientType)) {
      return NextResponse.json(
        { error: 'Tipo de cliente inválido' },
        { status: 400 }
      )
    }

    const folderPath = `${clientType}/${clientId}`

    // Obtener archivos de la carpeta del cliente
    const { data: files, error } = await supabase.storage
      .from('electronic-invoices')
      .list(folderPath, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' }
      })

    if (error) {
      console.error('Error al verificar facturas:', error)
      return NextResponse.json(
        { error: 'Error al verificar facturas' },
        { status: 500 }
      )
    }

    // Filtrar facturas del mes actual
    const currentMonth = new Date().getMonth()
    const currentYear = new Date().getFullYear()
    const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`

    const monthInvoices = files?.filter(file => {
      // Primero buscar por mes en el nombre del archivo
      if (file.name && file.name.includes(`_${currentMonthStr}_`)) {
        return true
      }
      // Fallback: buscar por fecha de creación
      if (!file.created_at) return false
      const fileDate = new Date(file.created_at)
      return fileDate.getMonth() === currentMonth && fileDate.getFullYear() === currentYear
    }) || []

    const hasInvoice = monthInvoices.length > 0

    return NextResponse.json({
      success: true,
      hasInvoice,
      invoiceCount: monthInvoices.length,
      invoices: monthInvoices.map(inv => ({
        name: inv.name,
        created_at: inv.created_at
      }))
    })

  } catch (error) {
    console.error('Error en PUT /api/upload-invoice:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
