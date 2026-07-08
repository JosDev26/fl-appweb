import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  obtenerExpedientesInactivos,
  aplicarFiltrosUi,
  paginar,
  PAGE_SIZE,
  type FiltroModalidad,
} from '@/lib/expedientes-inactivos'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const filtroModalidad = (searchParams.get('filtroModalidad') || 'all') as FiltroModalidad
    const filtroCliente = (searchParams.get('filtroCliente') || '').toLowerCase().trim()

    // 1. Obtener todos los inactivos (queries + cálculo centralizado en lib/)
    const inactivos = await obtenerExpedientesInactivos(supabase)

    // 2. Aplicar filtros de UI
    const resultado = aplicarFiltrosUi(inactivos, filtroModalidad, filtroCliente)

    // 3. Paginar
    const { paginado, total, totalPages } = paginar(resultado, page, PAGE_SIZE)

    return NextResponse.json({
      solicitudes: paginado,
      total,
      page,
      totalPages,
    })
  } catch (error) {
    console.error('[expedientes-inactivos] Error interno:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
