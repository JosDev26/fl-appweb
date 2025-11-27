import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Obtener todos los clientes o empresas
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const getAll = searchParams.get('getAll') === 'true'
    const getAllEmpresas = searchParams.get('getAllEmpresas') === 'true'

    // Obtener todos los usuarios (clientes)
    if (getAll) {
      const { data: usuarios, error } = await supabase
        .from('usuarios')
        .select('id, nombre, cedula, darVistoBueno, modoPago')
        .order('nombre', { ascending: true })

      if (error) {
        console.error('Error al obtener usuarios:', error)
        return NextResponse.json(
          { error: 'Error al obtener clientes' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        clientes: usuarios || []
      })
    }

    // Obtener todas las empresas
    if (getAllEmpresas) {
      const { data: empresas, error } = await supabase
        .from('empresas')
        .select('id, nombre, cedula, darVistoBueno, modoPago')
        .order('nombre', { ascending: true })

      if (error) {
        console.error('Error al obtener empresas:', error)
        return NextResponse.json(
          { error: 'Error al obtener empresas' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        empresas: empresas || []
      })
    }

    // Si no se especifica ningún parámetro
    return NextResponse.json(
      { error: 'Parámetro requerido: getAll o getAllEmpresas' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Error en GET /api/client:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
