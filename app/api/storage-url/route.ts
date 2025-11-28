import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET - Generar URL firmada para ver archivos de storage privado
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filePath = searchParams.get('path')
    const bucket = searchParams.get('bucket') || 'payment-receipts'

    if (!filePath) {
      return NextResponse.json(
        { error: 'path es requerido' },
        { status: 400 }
      )
    }

    // Generar URL firmada válida por 1 hora
    const { data, error } = await supabase
      .storage
      .from(bucket)
      .createSignedUrl(filePath, 3600) // 3600 segundos = 1 hora

    if (error) {
      console.error('Error generando signed URL:', error)
      return NextResponse.json(
        { error: 'Error generando URL: ' + error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      signedUrl: data.signedUrl
    })

  } catch (error) {
    console.error('Error inesperado:', error)
    return NextResponse.json(
      { error: 'Error inesperado' },
      { status: 500 }
    )
  }
}
