import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Este endpoint NO sincroniza desde Sheets, sino que consulta los ingresos guardados en Supabase
// Los ingresos se escriben en Sheets cuando se aprueba un comprobante (ver payment-receipts)

export async function GET() {
  try {
    // Contar registros en Supabase
    const { count, error } = await (supabase as any)
      .from('ingresos')
      .select('*', { count: 'exact', head: true })
    
    if (error) {
      return NextResponse.json({ 
        success: false, 
        message: `Error: ${error.message}`,
        error: error.message 
      }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      message: `Ingresos: ${count || 0} leídos, 0 insertados, 0 actualizados, 0 omitidos, 0 errores (sincronización automática)`,
      stats: {
        leidos: count || 0,
        inserted: 0,
        updated: 0,
        omitidos: 0,
        errors: 0,
        nota: 'Los ingresos se registran automáticamente al aprobar comprobantes'
      },
      code: 200
    })
    
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      message: `Ingresos: Error - ${error instanceof Error ? error.message : 'Error consultando ingresos'}`,
      error: error instanceof Error ? error.message : String(error),
      code: 500
    }, { status: 500 })
  }
}

export async function POST() {
  // No hay sync desde Sheets, solo retorna info
  return NextResponse.json({
    success: true,
    message: 'Ingresos: 0 leídos, 0 insertados, 0 actualizados, 0 omitidos, 0 errores (sincronización automática)',
    stats: { leidos: 0, inserted: 0, updated: 0, omitidos: 0, errors: 0 },
    nota: 'Este endpoint no sincroniza desde Sheets. Los datos se escriben en Sheets cuando se aprueba un comprobante.',
    code: 200
  })
}
