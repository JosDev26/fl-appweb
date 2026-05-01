import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCurrentDateCR, toDateString } from '@/lib/dateUtils'
import { checkUploadRateLimit } from '@/lib/rate-limit'

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

export async function POST(request: NextRequest) {
  // Rate limiting: 10 uploads per hour
  const rateLimitResponse = await checkUploadRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

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

    // Crear registro de factura
    const fechaEmision = new Date(now)

    const { error: deadlineError } = await supabase
      .from('invoice_payment_deadlines')
      .insert({
        mes_factura: mesFactura,
        client_id: clientId,
        client_type: clientType,
        file_path: data.path,
        fecha_emision: fechaEmision.toISOString().split('T')[0],
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
      mesFactura: mesFactura
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
      
      // Usar mes explícito si se proporciona, o calcular desde fecha simulada/actual
      const mesParam = searchParams.get('mes') // formato YYYY-MM
      let currentMonth: number
      let currentYear: number
      
      if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
        const [y, m] = mesParam.split('-').map(Number)
        currentYear = y
        currentMonth = m - 1 // 0-indexed
      } else {
        const simulatedDate = searchParams.get('simulatedDate')
        const now = await getCurrentDateCR(simulatedDate)
        // Calcular mes anterior (mes de las horas trabajadas / mes de facturación)
        const mesAnterior = new Date(now)
        mesAnterior.setMonth(mesAnterior.getMonth() - 1)
        currentMonth = mesAnterior.getMonth()
        currentYear = mesAnterior.getFullYear()
      }
      
      const currentMonthLabel = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
      console.log('[GET invoices] Buscando facturas de:', currentMonthLabel)
      
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

      // Obtener todos los deadlines para enriquecer con datos de DB
      const { data: allDeadlines, error: deadlinesError } = await supabase
        .from('invoice_payment_deadlines')
        .select('*')
        .eq('mes_factura', currentMonthLabel)

      if (deadlinesError) {
        console.error('Error al obtener deadlines para enriquecer:', deadlinesError)
      }

      // Crear mapas de deadlines para lookup: por file_path Y por (client_id, client_type)
      const deadlinesByPath = new Map(
        (allDeadlines || []).map(d => [d.file_path, d])
      )
      const deadlinesByClient = new Map(
        (allDeadlines || []).map(d => [`${d.client_id}_${d.client_type}`, d])
      )

      // Auto-crear deadline records faltantes (pueden faltar si el insert original falló)
      const missingDeadlineInvoices = invoices.filter(inv => {
        return !deadlinesByPath.has(inv.path) && !deadlinesByClient.has(`${inv.clientId}_${inv.clientType}`)
      })

      if (missingDeadlineInvoices.length > 0) {
        console.log(`[GET invoices] Auto-creando ${missingDeadlineInvoices.length} deadline records faltantes`)
        for (const inv of missingDeadlineInvoices) {
          // Extraer mes del nombre del archivo (formato: timestamp_YYYY-MM_nombre.ext)
          const mesMatch = inv.name?.match(/_(\d{4}-\d{2})_/)
          const mesFactura = mesMatch ? mesMatch[1] : currentMonthLabel

          const { data: created, error: createErr } = await supabase
            .from('invoice_payment_deadlines')
            .upsert({
              mes_factura: mesFactura,
              client_id: inv.clientId,
              client_type: inv.clientType,
              file_path: inv.path || `${inv.clientType}/${inv.clientId}/${inv.name}`,
              fecha_emision: inv.created_at ? new Date(inv.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
              estado_pago: 'pendiente'
            }, {
              onConflict: 'mes_factura,client_id,client_type'
            })
            .select()

          if (createErr) {
            console.error(`Error auto-creando deadline para ${inv.clientId}:`, createErr)
          } else if (created?.[0]) {
            // Agregar al mapa para el enriquecimiento
            deadlinesByPath.set(inv.path, created[0])
            deadlinesByClient.set(`${inv.clientId}_${inv.clientType}`, created[0])
          }
        }
      }

      // Enriquecer datos de facturas con información del cliente y deadline
      const enrichedInvoices = invoices.map(invoice => {
        let clientInfo = null
        if (invoice.clientType === 'cliente') {
          clientInfo = clientesMap.get(invoice.clientId)
        } else {
          clientInfo = empresasMap.get(invoice.clientId)
        }

        // Intentar match por file_path primero, luego por client_id+client_type
        const deadline = deadlinesByPath.get(invoice.path) 
          || deadlinesByClient.get(`${invoice.clientId}_${invoice.clientType}`)

        return {
          ...invoice,
          clientName: clientInfo?.nombre || 'Desconocido',
          clientCedula: clientInfo?.cedula || 'N/A',
          deadlineId: deadline?.id || null,
          estadoPago: deadline?.estado_pago || null,
          nota: deadline?.nota || null,
          editada: deadline?.editada ?? false,
          mesFactura: deadline?.mes_factura || null,
          fechaEmision: deadline?.fecha_emision || null
        }
      })

      // Filtrar archivos viejos: si un deadline tiene file_path apuntando a otro archivo,
      // este archivo es una versión antigua y no debe mostrarse
      const filteredInvoices = enrichedInvoices.filter(inv => {
        const deadline = deadlinesByClient.get(`${inv.clientId}_${inv.clientType}`)
        // Si hay deadline y su file_path no coincide con este archivo, es versión vieja
        if (deadline && deadline.file_path && deadline.file_path !== inv.path) {
          return false
        }
        return true
      })

      // Ordenar por fecha de creación descendente
      filteredInvoices.sort((a, b) => {
        if (!a.created_at || !b.created_at) return 0
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

      console.log(`Found ${filteredInvoices.length} invoices for current month (filtered from ${enrichedInvoices.length})`)

      return NextResponse.json({
        success: true,
        invoices: filteredInvoices,
        count: filteredInvoices.length
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
    const deadlineId = searchParams.get('deadlineId')
    const filePath = searchParams.get('filePath')

    if (!deadlineId) {
      return NextResponse.json(
        { error: 'ID de factura no proporcionado' },
        { status: 400 }
      )
    }

    // Si hay archivo en storage, eliminarlo primero; si falla, abortar sin tocar BD
    if (filePath) {
      const { error: storageError } = await supabase.storage
        .from('electronic-invoices')
        .remove([filePath])

      if (storageError) {
        console.error('Error al eliminar archivo de factura:', storageError)
        return NextResponse.json(
          { error: 'Error al eliminar el archivo del storage' },
          { status: 500 }
        )
      }
    }

    // Eliminar registro en BD (invoice_versions se borra por CASCADE)
    const { error: dbError } = await supabase
      .from('invoice_payment_deadlines')
      .delete()
      .eq('id', deadlineId)

    if (dbError) {
      console.error('Error al eliminar registro de factura:', dbError)
      return NextResponse.json(
        { error: 'Error al eliminar el registro de la factura' },
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
    const { clientId, clientType, mes } = body

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

    // Filtrar facturas del mes solicitado (o mes actual por defecto)
    let targetMonthStr: string
    if (mes && /^\d{4}-\d{2}$/.test(mes)) {
      targetMonthStr = mes
    } else {
      const currentMonth = new Date().getMonth()
      const currentYear = new Date().getFullYear()
      targetMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`
    }
    const [targetYear, targetMonthNum] = targetMonthStr.split('-').map(Number)

    const monthInvoices = files?.filter(file => {
      // Primero buscar por mes en el nombre del archivo
      if (file.name && file.name.includes(`_${targetMonthStr}_`)) {
        return true
      }
      // Fallback: buscar por fecha de creación
      if (!file.created_at) return false
      const fileDate = new Date(file.created_at)
      return fileDate.getMonth() === (targetMonthNum - 1) && fileDate.getFullYear() === targetYear
    }) || []

    const hasInvoice = monthInvoices.length > 0

    // Check editada status and current file_path from DB
    let editada = false
    let currentFilePath: string | null = null
    if (hasInvoice) {
      const { data: deadline } = await supabase
        .from('invoice_payment_deadlines')
        .select('*')
        .eq('client_id', clientId)
        .eq('client_type', clientType)
        .eq('mes_factura', targetMonthStr)
        .single()
      editada = deadline?.editada ?? false
      currentFilePath = deadline?.file_path ?? null
    }

    // Filter out old versions: only show the file that matches the deadline's file_path
    let filteredInvoices = monthInvoices
    if (currentFilePath && monthInvoices.length > 1) {
      // currentFilePath is like "cliente/123/filename.xml", extract just the filename
      const currentFileName = currentFilePath.split('/').pop()
      const matched = monthInvoices.filter(inv => inv.name === currentFileName)
      if (matched.length > 0) {
        filteredInvoices = matched
      }
    }

    return NextResponse.json({
      success: true,
      hasInvoice: filteredInvoices.length > 0,
      editada,
      invoiceCount: filteredInvoices.length,
      invoices: filteredInvoices.map(inv => ({
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

// Helper para parsear cookies
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {}
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=')
    if (name) cookies[name] = rest.join('=')
  })
  return cookies
}

// Editar/reemplazar factura existente
export async function PATCH(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await checkUploadRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    // Verificar sesión de admin
    const cookieHeader = request.headers.get('cookie')
    if (!cookieHeader) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const cookies = parseCookies(cookieHeader)
    const devAuth = cookies['dev-auth']
    const adminId = cookies['dev-admin-id']
    if (!devAuth || !adminId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const formData = await request.formData()
    const invoiceId = formData.get('invoiceId') as string
    const file = formData.get('file') as File | null
    const newMesFactura = formData.get('mesFactura') as string | null
    const newNota = formData.get('nota') as string | null
    const estadoPago = formData.get('estadoPago') as string || 'mantener'
    const fechaPago = formData.get('fechaPago') as string | null
    const aprobarComprobante = formData.get('aprobarComprobante') === 'true'
    const accionComprobante = formData.get('accionComprobante') as string || 'mantener'
    const reason = formData.get('reason') as string | null
    const resetEditada = formData.get('resetEditada') === 'true'

    // Validaciones básicas
    if (!invoiceId) {
      return NextResponse.json({ error: 'ID de factura requerido' }, { status: 400 })
    }

    // Si hay archivo nuevo, el motivo es obligatorio
    if (file && (!reason || !reason.trim())) {
      return NextResponse.json(
        { error: 'El motivo es obligatorio al reemplazar el archivo' },
        { status: 400 }
      )
    }

    // Obtener record actual
    const { data: currentDeadline, error: fetchError } = await supabase
      .from('invoice_payment_deadlines')
      .select('*')
      .eq('id', invoiceId)
      .single()

    if (fetchError || !currentDeadline) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // Si cambia mes_factura, verificar que no colisione con otra factura
    if (newMesFactura && newMesFactura !== currentDeadline.mes_factura) {
      if (!/^\d{4}-\d{2}$/.test(newMesFactura)) {
        return NextResponse.json({ error: 'Formato de mes inválido (YYYY-MM)' }, { status: 400 })
      }
      const { data: existing } = await supabase
        .from('invoice_payment_deadlines')
        .select('id')
        .eq('mes_factura', newMesFactura)
        .eq('client_id', currentDeadline.client_id)
        .eq('client_type', currentDeadline.client_type)
        .neq('id', invoiceId)
        .single()

      if (existing) {
        return NextResponse.json(
          { error: `Ya existe una factura para ${newMesFactura} de este cliente` },
          { status: 400 }
        )
      }
    }

    // Validar archivo si se proporciona
    let newFilePath: string | null = null
    if (file) {
      // Validar extensión XML
      const fileExtension = file.name.split('.').pop()?.toLowerCase()
      if (fileExtension !== 'xml') {
        return NextResponse.json(
          { error: 'Solo se permiten archivos XML' },
          { status: 400 }
        )
      }

      // Validar tipo MIME
      if (!['application/xml', 'text/xml'].includes(file.type)) {
        return NextResponse.json(
          { error: 'Tipo de archivo no permitido. Solo XML' },
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

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Validar firma (magic bytes)
      if (!validateFileSignature(buffer, 'xml')) {
        return NextResponse.json(
          { error: 'El archivo no es un XML válido' },
          { status: 400 }
        )
      }

      // Validar contenido XML
      const content = buffer.toString('utf-8')
      if (!validateXmlContent(content)) {
        return NextResponse.json(
          { error: 'El archivo XML contiene contenido no permitido' },
          { status: 400 }
        )
      }

      // Upload nuevo archivo
      const sanitizedName = sanitizeFileName(file.name)
      const mesForPath = newMesFactura || currentDeadline.mes_factura
      const timestamp = Date.now()
      const fileName = `${timestamp}_${mesForPath}_${sanitizedName}`
      newFilePath = `${currentDeadline.client_type}/${currentDeadline.client_id}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('electronic-invoices')
        .upload(newFilePath, buffer, {
          contentType: file.type,
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('Error al subir archivo de reemplazo:', uploadError)
        return NextResponse.json(
          { error: 'Error al subir el archivo de reemplazo' },
          { status: 500 }
        )
      }
    }

    // Guardar versión anterior en invoice_versions
    const { error: versionError } = await supabase
      .from('invoice_versions')
      .insert({
        invoice_deadline_id: invoiceId,
        file_path: file ? currentDeadline.file_path : null,
        mes_factura: currentDeadline.mes_factura,
        estado_pago: currentDeadline.estado_pago,
        nota: currentDeadline.nota,
        fecha_emision: currentDeadline.fecha_emision,
        reason: reason?.trim() || null,
        replaced_by: adminId
      })

    if (versionError) {
      console.error('Error al guardar versión anterior:', versionError)
      // No bloquear la edición si falla el historial
    }

    // Preparar actualización del deadline
    const updateData: Record<string, unknown> = {
      editada: resetEditada ? false : true
    }

    if (newFilePath) {
      updateData.file_path = newFilePath
      updateData.fecha_emision = new Date().toISOString().split('T')[0]
    }

    if (newMesFactura && newMesFactura !== currentDeadline.mes_factura) {
      updateData.mes_factura = newMesFactura
    }

    if (newNota !== null && newNota !== undefined) {
      updateData.nota = newNota
    }

    if (estadoPago === 'pendiente') {
      updateData.estado_pago = 'pendiente'
      updateData.fecha_pago = null
    } else if (estadoPago === 'pagado') {
      updateData.estado_pago = 'pagado'
      updateData.fecha_pago = fechaPago ? new Date(fechaPago).toISOString() : new Date().toISOString()
    }
    // Si es 'mantener', no tocamos estado_pago

    // Actualizar deadline
    const { error: updateError } = await supabase
      .from('invoice_payment_deadlines')
      .update(updateData)
      .eq('id', invoiceId)

    if (updateError) {
      console.error('Error al actualizar factura:', updateError)
      return NextResponse.json(
        { error: 'Error al actualizar la factura' },
        { status: 500 }
      )
    }

    // Si se debe aprobar comprobante vinculado (al marcar como pagado)
    if (estadoPago === 'pagado' && aprobarComprobante) {
      const targetMes = newMesFactura || currentDeadline.mes_factura
      const { data: receipt } = await supabase
        .from('payment_receipts')
        .select('id')
        .eq('mes_pago', targetMes)
        .eq('user_id', currentDeadline.client_id)
        .eq('tipo_cliente', currentDeadline.client_type)
        .eq('estado', 'pendiente')
        .single()

      if (receipt?.id) {
        const { error: approveError } = await (supabase as any).rpc('approve_payment_receipt', {
          p_receipt_id: receipt.id,
          p_user_id: currentDeadline.client_id,
          p_tipo_cliente: currentDeadline.client_type,
          p_mes_pago: targetMes,
          p_nota: 'Aprobado automáticamente al marcar factura como pagada'
        })
        if (approveError) {
          console.error('Error al aprobar comprobante vinculado:', approveError)
          // No bloquear la edición
        }
      }
    }

    // Si se debe invalidar comprobante vinculado
    if (accionComprobante === 'invalidar') {
      const targetMes = newMesFactura || currentDeadline.mes_factura
      const { error: receiptError } = await supabase
        .from('payment_receipts')
        .update({
          estado: 'rechazado',
          nota_revision: 'Factura reemplazada por admin'
        })
        .eq('mes_pago', targetMes)
        .eq('user_id', currentDeadline.client_id)
        .eq('tipo_cliente', currentDeadline.client_type)
        .eq('estado', 'pendiente')

      if (receiptError) {
        console.error('Error al invalidar comprobante:', receiptError)
        // No bloquear la edición
      }
    }

    // Registrar en audit_log
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
                     request.headers.get('x-real-ip') || '127.0.0.1'
    const userAgent = request.headers.get('user-agent') || ''

    await supabase.from('audit_log').insert({
      action: 'invoice_edited',
      actor_id: adminId,
      actor_type: 'admin',
      resource_type: 'invoice',
      resource_id: invoiceId,
      changes: {
        before: {
          file_path: currentDeadline.file_path,
          mes_factura: currentDeadline.mes_factura,
          estado_pago: currentDeadline.estado_pago,
          nota: currentDeadline.nota,
          editada: currentDeadline.editada
        },
        after: {
          file_path: newFilePath || currentDeadline.file_path,
          mes_factura: newMesFactura || currentDeadline.mes_factura,
          estado_pago: estadoPago === 'pendiente' ? 'pendiente' : currentDeadline.estado_pago,
          nota: newNota !== null ? newNota : currentDeadline.nota,
          editada: !resetEditada
        },
        fileReplaced: !!file,
        comprobanteInvalidated: accionComprobante === 'invalidar'
      },
      ip_address: clientIP,
      user_agent: userAgent
    })

    return NextResponse.json({
      success: true,
      message: 'Factura editada exitosamente'
    })

  } catch (error) {
    console.error('Error en PATCH /api/upload-invoice:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
