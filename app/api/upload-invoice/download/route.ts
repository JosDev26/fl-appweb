import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      )
    }

    // Obtener el path del archivo desde los query params
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')

    if (!filePath) {
      return NextResponse.json(
        { error: 'Path de archivo no especificado' },
        { status: 400 }
      )
    }

    // Verificar que la factura pertenece al usuario
    // El path tiene formato: cliente/{clientId}/{filename} o empresa/{empresaId}/{filename}
    const pathParts = filePath.split('/')
    if (pathParts.length < 3) {
      return NextResponse.json(
        { error: 'Path de archivo inválido' },
        { status: 400 }
      )
    }

    const clientType = pathParts[0] // 'cliente' o 'empresa'
    const clientId = pathParts[1]

    // Verificar que el usuario tiene acceso a esta factura
    // Si es cliente, verificar que el clientId coincide con el userId
    if (clientType === 'cliente' && clientId !== userId) {
      return NextResponse.json(
        { error: 'No tienes permiso para acceder a esta factura' },
        { status: 403 }
      )
    }

    // Si es empresa, verificar que el usuario tiene acceso a esta factura.
    // Se acepta si:
    //   - userId === clientId (la propia empresa descarga su factura, o el
    //     panel /dev envía el id de la empresa como x-user-id), o
    //   - existe un usuario con id=userId que pertenece a esa empresa.
    if (clientType === 'empresa') {
      if (clientId !== userId) {
        const { data: usuario } = await supabase
          .from('usuarios')
          .select('id_empresa')
          .eq('id', userId)
          .single()

        if (!usuario || String(usuario.id_empresa) !== clientId) {
          return NextResponse.json(
            { error: 'No tienes permiso para acceder a esta factura' },
            { status: 403 }
          )
        }
      }
    }

    // Descargar el archivo de Supabase Storage.
    // Si el path guardado en la BD no coincide con el objeto real en storage
    // (p.ej. la factura fue editada/reemplazada y quedó un path stale), hacemos
    // un fallback: listamos la carpeta y buscamos el archivo por nombre.
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('electronic-invoices')
      .download(filePath)

    let resolvedFileData: Blob | null = fileData

    if (downloadError || !resolvedFileData) {
      console.warn('[invoice-download] Download directo falló para path:', filePath)
      console.warn('[invoice-download] Error Supabase:', JSON.stringify(downloadError, null, 2))

      // Fallback: listar la carpeta y buscar un archivo cuyo nombre coincida
      // o que empiece con el mismo prefijo (timestamp_mesFactura).
      const folderPath = `${clientType}/${clientId}`
      const targetFileName = pathParts[pathParts.length - 1]
      // Extraer prefijo de búsqueda: "{timestamp}_{mesFactura}_"
      const prefixMatch = targetFileName.match(/^(\d+_\d{4}-\d{2})_/)
      const searchPrefix = prefixMatch ? prefixMatch[1] : null

      const { data: folderFiles, error: listError } = await supabase
        .storage
        .from('electronic-invoices')
        .list(folderPath, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } })

      if (listError) {
        console.error('[invoice-download] Error al listar carpeta para fallback:', listError)
        return NextResponse.json(
          { error: 'El archivo no existe en storage. Path guardado puede estar desactualizado.' },
          { status: 404 }
        )
      }

      // Buscar por nombre exacto primero, luego por prefijo (timestamp_mes)
      let matchedFile = folderFiles?.find(f => f.name === targetFileName) ?? null
      if (!matchedFile && searchPrefix) {
        matchedFile = folderFiles?.find(f => f.name.startsWith(searchPrefix + '_')) ?? null
      }

      if (!matchedFile) {
        console.error('[invoice-download] Archivo no encontrado en carpeta. Buscado:', targetFileName, '| Prefijo:', searchPrefix)
        return NextResponse.json(
          { error: 'Archivo no encontrado en storage. Posiblemente fue eliminado o el path está desactualizado.' },
          { status: 404 }
        )
      }

      console.log('[invoice-download] Fallback: archivo encontrado como:', matchedFile.name)
      const fallbackPath = `${folderPath}/${matchedFile.name}`
      const { data: fallbackData, error: fallbackError } = await supabase
        .storage
        .from('electronic-invoices')
        .download(fallbackPath)

      if (fallbackError || !fallbackData) {
        console.error('[invoice-download] Fallback también falló:', fallbackError)
        return NextResponse.json(
          { error: 'No se pudo descargar el archivo de storage.' },
          { status: 500 }
        )
      }

      resolvedFileData = fallbackData
    }

    // Determinar el tipo de contenido
    const fileName = pathParts[pathParts.length - 1]
    const isXml = fileName.toLowerCase().endsWith('.xml')
    const contentType = isXml ? 'application/xml' : 'application/pdf'

    // Retornar el archivo como blob
    return new NextResponse(resolvedFileData, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    })

  } catch (error) {
    console.error('Error en invoice download endpoint:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
