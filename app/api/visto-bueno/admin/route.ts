import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyDevAdminSession } from '@/lib/auth-utils'
import { checkStandardRateLimit } from '@/lib/rate-limit'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ============================================================================
// TIPOS
// ============================================================================

interface VistoBuenoRecord {
  id: string
  clientId: string
  clientType: 'cliente' | 'empresa'
  clientName: string
  clientCedula: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  fechaVistoBueno: string | null
  fechaRechazo: string | null
  motivoRechazo: string | null
  archivoUrl: string | null
}

interface VistoBuenoResponse {
  aprobados: VistoBuenoRecord[]
  rechazados: VistoBuenoRecord[]
  pendientes: VistoBuenoRecord[]
}

// ============================================================================
// GET: Obtener estado de visto bueno de todos los clientes para un mes
// ============================================================================

export async function GET(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    // Verificar autenticación de admin
    const authResult = await verifyDevAdminSession(request)
    if (!authResult.valid) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      )
    }

    // Obtener mes de los query params
    const { searchParams } = new URL(request.url)
    const mes = searchParams.get('mes')

    if (!mes) {
      return NextResponse.json(
        { error: 'El parámetro mes es requerido' },
        { status: 400 }
      )
    }

    // Validar formato de mes
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
      return NextResponse.json(
        { error: 'Formato de mes inválido. Use YYYY-MM' },
        { status: 400 }
      )
    }

    // Calcular rango del mes para filtrar trabajos_por_hora
    const [year, month] = mes.split('-').map(Number)
    const inicioMes = `${mes}-01`
    // Calcular último día del mes sin usar toISOString() para evitar problemas de timezone
    const lastDay = new Date(year, month, 0).getDate()
    const finMes = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    // 1. Obtener todos los clientes con darVistoBueno Y modoPago activos
    // NOTA: Los campos en la DB son camelCase: "darVistoBueno" y "modoPago"
    const [usuariosResponse, empresasResponse] = await Promise.all([
      supabase
        .from('usuarios')
        .select('id, nombre, cedula')
        .eq('darVistoBueno', true)
        .eq('modoPago', true),
      supabase
        .from('empresas')
        .select('id, nombre, cedula')
        .eq('darVistoBueno', true)
        .eq('modoPago', true)
    ])

    const usuariosRaw = (usuariosResponse.data || []) as any[]
    const empresasRaw = (empresasResponse.data || []) as any[]

    // 2. Obtener todos los client IDs con trabajos_por_hora en el mes (single query instead of N+1)
    const allClientIds = [
      ...usuariosRaw.map(u => u.id),
      ...empresasRaw.map(e => e.id)
    ]
    
    // Fetch distinct client IDs that have trabajos_por_hora in the date range
    const { data: clientsConHoras } = await supabase
      .from('trabajos_por_hora')
      .select('id_cliente')
      .in('id_cliente', allClientIds)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
    
    // Create a Set for O(1) lookup
    const clientsConHorasSet = new Set(
      (clientsConHoras || []).map((r: any) => r.id_cliente)
    )

    // Filter usuarios and empresas by those that have trabajos_por_hora
    const usuarios = usuariosRaw.filter(u => clientsConHorasSet.has(u.id))
    const empresas = empresasRaw.filter(e => clientsConHorasSet.has(e.id))

    // 3. Obtener registros de visto bueno para el mes
    // Note: Using 'as any' because visto_bueno_mensual is not in generated Supabase types yet
    const { data: vistoBuenoRecords, error: vbError } = await (supabase as any)
      .from('visto_bueno_mensual')
      .select('*')
      .eq('mes', mes)

    if (vbError) {
      console.error('Error obteniendo visto bueno:', vbError)
      return NextResponse.json(
        { error: 'Error al obtener datos de visto bueno' },
        { status: 500 }
      )
    }

    // 4. Crear mapa de registros por cliente
    const vbMap = new Map<string, any>()
    for (const record of (vistoBuenoRecords || [])) {
      const key = `${record.client_type}:${record.client_id}`
      vbMap.set(key, record)
    }

    // 5. Procesar y categorizar resultados
    const result: VistoBuenoResponse = {
      aprobados: [],
      rechazados: [],
      pendientes: []
    }

    // Helper to derive estado: check explicit estado first, then fall back to 'dado' field
    const deriveEstado = (vbRecord: any): 'aprobado' | 'rechazado' | 'pendiente' => {
      if (vbRecord?.estado) return vbRecord.estado
      if (vbRecord?.dado) return 'aprobado'
      return 'pendiente'
    }

    // Collect all records that need signed URLs for parallel fetching
    const recordsNeedingUrls: { record: VistoBuenoRecord; path: string }[] = []

    // Procesar usuarios
    for (const usuario of usuarios) {
      const key = `cliente:${usuario.id}`
      const vbRecord = vbMap.get(key)
      
      const estado = deriveEstado(vbRecord)
      const record: VistoBuenoRecord = {
        id: vbRecord?.id || '',
        clientId: usuario.id,
        clientType: 'cliente',
        clientName: usuario.nombre || 'Sin nombre',
        clientCedula: usuario.cedula || 'Sin cédula',
        estado,
        fechaVistoBueno: vbRecord?.fecha_visto_bueno || null,
        fechaRechazo: vbRecord?.fecha_rechazo || null,
        motivoRechazo: vbRecord?.motivo_rechazo || null,
        archivoUrl: null
      }

      // Queue for parallel URL generation if needed
      if (vbRecord?.archivo_rechazo_path) {
        recordsNeedingUrls.push({ record, path: vbRecord.archivo_rechazo_path })
      }

      // Categorizar
      if (record.estado === 'aprobado') {
        result.aprobados.push(record)
      } else if (record.estado === 'rechazado') {
        result.rechazados.push(record)
      } else {
        result.pendientes.push(record)
      }
    }

    // Procesar empresas
    for (const empresa of empresas) {
      const key = `empresa:${empresa.id}`
      const vbRecord = vbMap.get(key)
      
      const estado = deriveEstado(vbRecord)
      const record: VistoBuenoRecord = {
        id: vbRecord?.id || '',
        clientId: empresa.id,
        clientType: 'empresa',
        clientName: empresa.nombre || 'Sin nombre',
        clientCedula: empresa.cedula || 'Sin cédula',
        estado,
        fechaVistoBueno: vbRecord?.fecha_visto_bueno || null,
        fechaRechazo: vbRecord?.fecha_rechazo || null,
        motivoRechazo: vbRecord?.motivo_rechazo || null,
        archivoUrl: null
      }

      // Queue for parallel URL generation if needed
      if (vbRecord?.archivo_rechazo_path) {
        recordsNeedingUrls.push({ record, path: vbRecord.archivo_rechazo_path })
      }

      // Categorizar
      if (record.estado === 'aprobado') {
        result.aprobados.push(record)
      } else if (record.estado === 'rechazado') {
        result.rechazados.push(record)
      } else {
        result.pendientes.push(record)
      }
    }

    // Generate signed URLs in parallel
    if (recordsNeedingUrls.length > 0) {
      const urlResults = await Promise.all(
        recordsNeedingUrls.map(({ path }) =>
          supabase.storage.from('visto-bueno-rechazos').createSignedUrl(path, 3600)
        )
      )
      // Assign URLs back to records
      urlResults.forEach((result, idx) => {
        recordsNeedingUrls[idx].record.archivoUrl = result.data?.signedUrl || null
      })
    }

    // 5. Ordenar por nombre
    result.aprobados.sort((a, b) => a.clientName.localeCompare(b.clientName))
    result.rechazados.sort((a, b) => a.clientName.localeCompare(b.clientName))
    result.pendientes.sort((a, b) => a.clientName.localeCompare(b.clientName))

    return NextResponse.json({
      success: true,
      mes,
      data: result,
      counts: {
        aprobados: result.aprobados.length,
        rechazados: result.rechazados.length,
        pendientes: result.pendientes.length,
        total: result.aprobados.length + result.rechazados.length + result.pendientes.length
      }
    })

  } catch (error) {
    console.error('Error en GET /api/visto-bueno/admin:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
