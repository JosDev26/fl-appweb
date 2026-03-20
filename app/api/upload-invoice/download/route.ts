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

    // Si es empresa, verificar que el usuario pertenece a esa empresa
    if (clientType === 'empresa') {
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

    // Descargar el archivo de Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('electronic-invoices')
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('Error al descargar factura:', downloadError)
      return NextResponse.json(
        { error: 'Error al descargar factura' },
        { status: 500 }
      )
    }

    // Determinar el tipo de contenido
    const fileName = pathParts[pathParts.length - 1]
    const isXml = fileName.toLowerCase().endsWith('.xml')
    const contentType = isXml ? 'application/xml' : 'application/pdf'

    // Retornar el archivo como blob
    return new NextResponse(fileData, {
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
