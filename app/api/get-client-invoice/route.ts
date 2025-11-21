import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * GET - Obtener la factura de un cliente específico
 */
export async function GET(request: NextRequest) {
    try {
        // Obtener identificación del cliente desde headers
        const userId = request.headers.get('x-user-id')
        const tipoCliente = request.headers.get('x-tipo-cliente') || 'cliente'

        if (!userId) {
            return NextResponse.json(
                { error: 'No autenticado' },
                { status: 401 }
            )
        }

        if (!['cliente', 'empresa'].includes(tipoCliente)) {
            return NextResponse.json(
                { error: 'Tipo de cliente inválido' },
                { status: 400 }
            )
        }

        // Buscar factura del cliente
        const { data: invoice, error: fetchError } = await supabase
            .from('client_invoices' as any)
            .select('*')
            .eq('client_id', userId)
            .eq('tipo_cliente', tipoCliente)
            .single()

        if (fetchError || !invoice) {
            return NextResponse.json({
                success: true,
                hasInvoice: false,
                invoice: null
            })
        }

        // Generar URL firmada para descargar archivo (válida por 1 hora)
        const { data: signedUrlData, error: signedUrlError } = await supabase
            .storage
            .from('invoices')
            .createSignedUrl((invoice as any).file_path, 3600)

        if (signedUrlError) {
            console.error('Error creating signed URL:', signedUrlError)
            return NextResponse.json(
                { error: 'Error al generar URL de descarga' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            hasInvoice: true,
            invoice: {
                id: (invoice as any).id,
                fileName: (invoice as any).file_name,
                fileSize: (invoice as any).file_size,
                fileType: (invoice as any).file_type,
                uploadedAt: (invoice as any).uploaded_at,
                downloadUrl: signedUrlData?.signedUrl
            }
        })

    } catch (error) {
        console.error('Unexpected error:', error)
        return NextResponse.json(
            { error: 'Error inesperado' },
            { status: 500 }
        )
    }
}
