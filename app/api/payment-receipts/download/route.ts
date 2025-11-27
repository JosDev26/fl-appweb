import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

    // Verificar que el comprobante pertenece al usuario
    const { data: receipt, error: receiptError } = await supabase
      .from('payment_receipts' as any)
      .select('*')
      .eq('file_path', filePath)
      .eq('user_id', userId)
      .single()

    if (receiptError || !receipt) {
      return NextResponse.json(
        { error: 'Comprobante no encontrado o no tienes permiso para acceder a él' },
        { status: 404 }
      )
    }

    // Descargar el archivo de Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('payment-receipts')
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('Error al descargar archivo:', downloadError)
      return NextResponse.json(
        { error: 'Error al descargar archivo' },
        { status: 500 }
      )
    }

    // Retornar el archivo como blob
    return new NextResponse(fileData, {
      headers: {
        'Content-Type': (receipt as any).file_type,
        'Content-Disposition': `attachment; filename="${(receipt as any).file_name}"`,
      },
    })

  } catch (error) {
    console.error('Error en download endpoint:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
