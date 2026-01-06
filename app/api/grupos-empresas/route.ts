import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkStandardRateLimit } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: Obtener todos los grupos o un grupo específico
export async function GET(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { searchParams } = new URL(request.url)
    const grupoId = searchParams.get('id')
    const empresaId = searchParams.get('empresaId')

    // Si se busca por empresa (para saber si es principal de un grupo)
    if (empresaId) {
      const { data: grupo, error } = await supabase
        .from('grupos_empresas' as any)
        .select(`
          *,
          miembros:grupos_empresas_miembros(
            empresa_id
          )
        `)
        .eq('empresa_principal_id', empresaId)
        .maybeSingle()

      if (error) throw error

      if (grupo) {
        // Obtener nombres de las empresas miembros
        const empresaIds = ((grupo as any).miembros || []).map((m: any) => m.empresa_id)
        
        let empresasInfo: any[] = []
        if (empresaIds.length > 0) {
          const { data: empresas } = await supabase
            .from('empresas')
            .select('id, nombre, iva_perc')
            .in('id', empresaIds)
          
          empresasInfo = empresas || []
        }

        return NextResponse.json({
          success: true,
          grupo: {
            ...grupo,
            empresas_asociadas: empresasInfo
          }
        })
      }

      return NextResponse.json({ success: true, grupo: null })
    }

    // Si se busca un grupo específico por ID
    if (grupoId) {
      const { data: grupo, error } = await supabase
        .from('grupos_empresas' as any)
        .select(`
          *,
          miembros:grupos_empresas_miembros(
            empresa_id
          )
        `)
        .eq('id', grupoId)
        .single()

      if (error) throw error

      // Obtener info de empresa principal
      const { data: empresaPrincipal } = await supabase
        .from('empresas')
        .select('id, nombre, iva_perc')
        .eq('id', (grupo as any).empresa_principal_id)
        .single()

      // Obtener info de empresas miembros
      const empresaIds = ((grupo as any).miembros || []).map((m: any) => m.empresa_id)
      let empresasInfo: any[] = []
      if (empresaIds.length > 0) {
        const { data: empresas } = await supabase
          .from('empresas')
          .select('id, nombre, iva_perc')
          .in('id', empresaIds)
        
        empresasInfo = empresas || []
      }

      return NextResponse.json({
        success: true,
        grupo: {
          ...grupo,
          empresa_principal: empresaPrincipal,
          empresas_asociadas: empresasInfo
        }
      })
    }

    // Obtener todos los grupos
    const { data: grupos, error } = await supabase
      .from('grupos_empresas' as any)
      .select(`
        *,
        miembros:grupos_empresas_miembros(
          empresa_id
        )
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Enriquecer con nombres de empresas
    const gruposEnriquecidos = await Promise.all((grupos || []).map(async (grupo: any) => {
      // Obtener nombre de empresa principal
      const { data: empresaPrincipal } = await supabase
        .from('empresas')
        .select('id, nombre')
        .eq('id', grupo.empresa_principal_id)
        .single()

      // Obtener nombres de empresas miembros
      const empresaIds = (grupo.miembros || []).map((m: any) => m.empresa_id)
      let empresasInfo: any[] = []
      if (empresaIds.length > 0) {
        const { data: empresas } = await supabase
          .from('empresas')
          .select('id, nombre')
          .in('id', empresaIds)
        
        empresasInfo = empresas || []
      }

      return {
        ...grupo,
        empresa_principal: empresaPrincipal,
        empresas_asociadas: empresasInfo
      }
    }))

    return NextResponse.json({
      success: true,
      grupos: gruposEnriquecidos
    })

  } catch (error) {
    console.error('Error en GET /api/grupos-empresas:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

// POST: Crear un nuevo grupo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { nombre, empresa_principal_id, empresas_asociadas } = body

    if (!nombre || !empresa_principal_id) {
      return NextResponse.json(
        { error: 'Nombre y empresa principal son requeridos' },
        { status: 400 }
      )
    }

    // Verificar que la empresa principal existe
    const { data: empresaPrincipal, error: errorEmpresa } = await supabase
      .from('empresas')
      .select('id, nombre')
      .eq('id', empresa_principal_id)
      .single()

    if (errorEmpresa || !empresaPrincipal) {
      return NextResponse.json(
        { error: 'La empresa principal no existe' },
        { status: 400 }
      )
    }

    // Verificar que la empresa principal no esté ya en otro grupo (como principal o miembro)
    const { data: grupoExistente } = await supabase
      .from('grupos_empresas' as any)
      .select('id')
      .eq('empresa_principal_id', empresa_principal_id)
      .maybeSingle()

    if (grupoExistente) {
      return NextResponse.json(
        { error: 'Esta empresa ya es principal de otro grupo' },
        { status: 400 }
      )
    }

    const { data: miembroExistente } = await supabase
      .from('grupos_empresas_miembros' as any)
      .select('id')
      .eq('empresa_id', empresa_principal_id)
      .maybeSingle()

    if (miembroExistente) {
      return NextResponse.json(
        { error: 'Esta empresa ya es miembro de otro grupo' },
        { status: 400 }
      )
    }

    // Crear el grupo
    const { data: grupo, error: errorGrupo } = await supabase
      .from('grupos_empresas' as any)
      .insert({
        nombre,
        empresa_principal_id
      })
      .select()
      .single()

    if (errorGrupo) throw errorGrupo

    // Agregar empresas asociadas si se proporcionan
    if (empresas_asociadas && empresas_asociadas.length > 0) {
      const miembros = empresas_asociadas.map((empresaId: string) => ({
        grupo_id: (grupo as any).id,
        empresa_id: empresaId
      }))

      const { error: errorMiembros } = await supabase
        .from('grupos_empresas_miembros' as any)
        .insert(miembros)

      if (errorMiembros) {
        // Si falla, eliminar el grupo creado
        await supabase.from('grupos_empresas' as any).delete().eq('id', (grupo as any).id)
        throw errorMiembros
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Grupo creado exitosamente',
      grupo
    })

  } catch (error) {
    console.error('Error en POST /api/grupos-empresas:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

// PUT: Agregar o quitar empresas de un grupo
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { grupo_id, action, empresa_id } = body

    if (!grupo_id || !action || !empresa_id) {
      return NextResponse.json(
        { error: 'grupo_id, action y empresa_id son requeridos' },
        { status: 400 }
      )
    }

    if (action === 'add') {
      // Verificar que la empresa no esté en otro grupo
      const { data: miembroExistente } = await supabase
        .from('grupos_empresas_miembros' as any)
        .select('id')
        .eq('empresa_id', empresa_id)
        .maybeSingle()

      if (miembroExistente) {
        return NextResponse.json(
          { error: 'Esta empresa ya es miembro de otro grupo' },
          { status: 400 }
        )
      }

      // Verificar que no sea empresa principal de ningún grupo
      const { data: esPrincipal } = await supabase
        .from('grupos_empresas' as any)
        .select('id')
        .eq('empresa_principal_id', empresa_id)
        .maybeSingle()

      if (esPrincipal) {
        return NextResponse.json(
          { error: 'Esta empresa es principal de otro grupo' },
          { status: 400 }
        )
      }

      // Agregar al grupo
      const { error } = await supabase
        .from('grupos_empresas_miembros' as any)
        .insert({
          grupo_id,
          empresa_id
        })

      if (error) throw error

      return NextResponse.json({
        success: true,
        message: 'Empresa agregada al grupo'
      })

    } else if (action === 'remove') {
      // Quitar del grupo
      const { error } = await supabase
        .from('grupos_empresas_miembros' as any)
        .delete()
        .eq('grupo_id', grupo_id)
        .eq('empresa_id', empresa_id)

      if (error) throw error

      return NextResponse.json({
        success: true,
        message: 'Empresa removida del grupo'
      })
    }

    return NextResponse.json(
      { error: 'Acción no válida. Use "add" o "remove"' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Error en PUT /api/grupos-empresas:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}

// DELETE: Eliminar un grupo
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const grupoId = searchParams.get('id')

    if (!grupoId) {
      return NextResponse.json(
        { error: 'ID del grupo es requerido' },
        { status: 400 }
      )
    }

    // Los miembros se eliminan automáticamente por CASCADE
    const { error } = await supabase
      .from('grupos_empresas' as any)
      .delete()
      .eq('id', grupoId)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'Grupo eliminado exitosamente'
    })

  } catch (error) {
    console.error('Error en DELETE /api/grupos-empresas:', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
