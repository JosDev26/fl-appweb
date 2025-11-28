import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET: Obtener fecha simulada global (si existe)
export async function GET() {
  try {
    const { data, error } = await supabase
      .from('system_config' as any)
      .select('value, updated_at')
      .eq('key', 'simulated_date')
      .maybeSingle()

    if (error) {
      console.error('Error obteniendo fecha simulada:', error)
      return NextResponse.json({ simulated: false, date: null })
    }

    if (data && (data as any).value) {
      return NextResponse.json({
        simulated: true,
        date: (data as any).value, // formato YYYY-MM-DD
        updatedAt: (data as any).updated_at
      })
    }

    return NextResponse.json({ simulated: false, date: null })
  } catch (error) {
    console.error('Error en GET /api/simulated-date:', error)
    return NextResponse.json({ simulated: false, date: null })
  }
}

// POST: Activar/modificar fecha simulada global
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date } = body // formato YYYY-MM-DD

    if (!date) {
      return NextResponse.json(
        { error: 'Se requiere la fecha en formato YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Validar formato de fecha
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(date)) {
      return NextResponse.json(
        { error: 'Formato de fecha inválido. Usar YYYY-MM-DD' },
        { status: 400 }
      )
    }

    // Insertar o actualizar la fecha simulada
    const { data, error } = await supabase
      .from('system_config' as any)
      .upsert({
        key: 'simulated_date',
        value: date,
        description: 'Fecha simulada global para testing - ELIMINAR EN PRODUCCIÓN'
      }, { onConflict: 'key' })
      .select()
      .single()

    if (error) {
      console.error('Error activando fecha simulada:', error)
      return NextResponse.json(
        { error: 'Error al guardar fecha simulada' },
        { status: 500 }
      )
    }

    console.log('📅 Fecha simulada global ACTIVADA:', date)
    return NextResponse.json({
      success: true,
      simulated: true,
      date: date,
      message: `Fecha simulada activada: ${date}. TODOS los usuarios verán esta fecha.`
    })
  } catch (error) {
    console.error('Error en POST /api/simulated-date:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// DELETE: Desactivar fecha simulada global
export async function DELETE() {
  try {
    const { error } = await supabase
      .from('system_config' as any)
      .delete()
      .eq('key', 'simulated_date')

    if (error) {
      console.error('Error eliminando fecha simulada:', error)
      return NextResponse.json(
        { error: 'Error al eliminar fecha simulada' },
        { status: 500 }
      )
    }

    console.log('📅 Fecha simulada global DESACTIVADA - usando fecha real')
    return NextResponse.json({
      success: true,
      simulated: false,
      message: 'Fecha simulada desactivada. Todos los usuarios verán la fecha real.'
    })
  } catch (error) {
    console.error('Error en DELETE /api/simulated-date:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
