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
    const modoPago = searchParams.get('modo_pago')
    const tipo = searchParams.get('tipo')

    // Nuevo: Obtener clientes con filtro de modo_pago (usuarios + empresas combinados)
    if (modoPago === 'all') {
      const [usuariosRes, empresasRes] = await Promise.all([
        supabase
          .from('usuarios')
          .select('id, id_sheets, nombre, cedula, correo, modoPago, darVistoBueno')
          .order('nombre', { ascending: true }),
        supabase
          .from('empresas')
          .select('id, id_sheets, nombre, cedula, correo, modoPago, darVistoBueno')
          .order('nombre', { ascending: true })
      ])

      if (usuariosRes.error) {
        console.error('Error al obtener usuarios:', usuariosRes.error)
        return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 })
      }
      if (empresasRes.error) {
        console.error('Error al obtener empresas:', empresasRes.error)
        return NextResponse.json({ error: 'Error al obtener empresas' }, { status: 500 })
      }

      const usuariosConTipo = (usuariosRes.data || []).map(u => ({ ...u, tipo: 'cliente' as const }))
      const empresasConTipo = (empresasRes.data || []).map(e => ({ ...e, tipo: 'empresa' as const }))
      const allClients = [...usuariosConTipo, ...empresasConTipo]

      return NextResponse.json({
        success: true,
        clients: allClients
      })
    }

    // Nuevo: Obtener solo usuarios o solo empresas según tipo
    if (tipo === 'cliente') {
      const { data: usuarios, error } = await supabase
        .from('usuarios')
        .select('id, id_sheets, nombre, cedula, correo, modoPago, darVistoBueno')
        .order('nombre', { ascending: true })

      if (error) {
        console.error('Error al obtener usuarios:', error)
        return NextResponse.json({ error: 'Error al obtener clientes' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        clients: (usuarios || []).map(u => ({ ...u, tipo: 'cliente' as const }))
      })
    }

    if (tipo === 'empresa') {
      const all = searchParams.get('all') === 'true'
      
      const { data: empresas, error } = await supabase
        .from('empresas')
        .select(all ? 'id, nombre, cedula, correo, modoPago, darVistoBueno, iva_perc, tarifa_hora' : 'id, nombre, cedula, correo, modoPago, darVistoBueno')
        .order('nombre', { ascending: true })

      if (error) {
        console.error('Error al obtener empresas:', error)
        return NextResponse.json({ error: 'Error al obtener empresas' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        empresas: empresas || [],
        clients: (empresas || []).map((e: any) => ({ ...e, tipo: 'empresa' as const }))
      })
    }

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
      { error: 'Parámetro requerido: getAll, getAllEmpresas, modo_pago, o tipo' },
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

// Actualizar darVistoBueno de un cliente o empresa, o resetear modoPago
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { clientId, tipo, darVistoBueno, action } = body

    // Acción especial: resetear modoPago de todos los clientes y empresas
    if (action === 'resetAllModoPago') {
      const [usuariosRes, empresasRes] = await Promise.all([
        supabase
          .from('usuarios')
          .update({ modoPago: false })
          .eq('modoPago', true)
          .select('id'),
        supabase
          .from('empresas')
          .update({ modoPago: false })
          .eq('modoPago', true)
          .select('id')
      ])

      if (usuariosRes.error) {
        console.error('Error reseteando usuarios:', usuariosRes.error)
        return NextResponse.json(
          { error: 'Error reseteando modoPago de usuarios' },
          { status: 500 }
        )
      }

      if (empresasRes.error) {
        console.error('Error reseteando empresas:', empresasRes.error)
        return NextResponse.json(
          { error: 'Error reseteando modoPago de empresas' },
          { status: 500 }
        )
      }

      const usuariosActualizados = usuariosRes.data?.length || 0
      const empresasActualizadas = empresasRes.data?.length || 0

      return NextResponse.json({
        success: true,
        message: `modoPago reseteado: ${usuariosActualizados} usuarios, ${empresasActualizadas} empresas`,
        usuariosActualizados,
        empresasActualizadas
      })
    }

    // Actualización normal de darVistoBueno
    if (!clientId || !tipo || typeof darVistoBueno !== 'boolean') {
      return NextResponse.json(
        { error: 'Parámetros requeridos: clientId, tipo, darVistoBueno' },
        { status: 400 }
      )
    }

    const table = tipo === 'cliente' ? 'usuarios' : 'empresas'

    const { data, error } = await supabase
      .from(table)
      .update({ darVistoBueno })
      .eq('id', clientId)
      .select()
      .single()

    if (error) {
      console.error(`Error actualizando ${tipo}:`, error)
      return NextResponse.json(
        { error: `Error actualizando ${tipo}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `${tipo} actualizado correctamente`,
      data
    })

  } catch (error) {
    console.error('Error en PATCH /api/client:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
