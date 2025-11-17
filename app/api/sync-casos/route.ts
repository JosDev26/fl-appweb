import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'
import { getTableMapping } from '@/lib/sync-config'

export async function POST(request: NextRequest) {
  try {
    console.log('📁 Iniciando sincronización de Casos...')
    
    // Leer TODAS las columnas manualmente (A hasta H) para determinar id_cliente
    const allColumnsData = await GoogleSheetsService.getSheetData('Caso', 'A:H')
    
    if (!allColumnsData || allColumnsData.length < 2) {
      return NextResponse.json({ 
        success: true, 
        message: 'No hay datos para sincronizar',
        stats: { inserted: 0, updated: 0, deleted: 0, errors: 0 }
      })
    }

    // Primera fila son los headers
    const headers = allColumnsData[0]
    const rows = allColumnsData.slice(1)

    console.log(`📊 Headers encontrados:`, headers)
    console.log(`📊 Número de filas:`, rows.length)

    // Encontrar índices de columnas relevantes
    const idCasoIndex = headers.findIndex((h: string) => h === 'ID_Caso')
    const tituloIndex = headers.findIndex((h: string) => h === 'Titulo')
    const idClienteIndex = headers.findIndex((h: string) => h === 'ID_Cliente')
    const idEmpresaIndex = headers.findIndex((h: string) => h === 'ID_Empresa')
    const estadoIndex = headers.findIndex((h: string) => h === 'Estado')
    const materiaIndex = headers.findIndex((h: string) => h === 'Materia')
    const expedienteIndex = headers.findIndex((h: string) => h === 'Expediente')

    if (idCasoIndex === -1 || tituloIndex === -1) {
      throw new Error('No se encontraron las columnas requeridas: ID_Caso y Titulo')
    }

    // Transformar los datos
    const transformedData = rows
      .filter((row: any[]) => row[idCasoIndex] && String(row[idCasoIndex]).trim() !== '')
      .map((row: any[]) => {
        // Determinar id_cliente: preferir ID_Empresa (columna E) sobre ID_Cliente (columna D)
        const idEmpresa = idEmpresaIndex !== -1 ? String(row[idEmpresaIndex] || '').trim() : ''
        const idCliente = idClienteIndex !== -1 ? String(row[idClienteIndex] || '').trim() : ''
        const finalIdCliente = idEmpresa || idCliente || null

        return {
          id: String(row[idCasoIndex]).trim(),
          nombre: String(row[tituloIndex]).trim(),
          id_cliente: finalIdCliente,
          estado: estadoIndex !== -1 ? (String(row[estadoIndex] || '').trim() || null) : null,
          materia: materiaIndex !== -1 ? (String(row[materiaIndex] || '').trim() || null) : null,
          expediente: expedienteIndex !== -1 ? (String(row[expedienteIndex] || '').trim() || null) : null
        }
      })

    console.log(`📋 Primer registro transformado:`, transformedData[0])
    console.log(`📊 Total registros transformados:`, transformedData.length)

    // Obtener casos existentes
    const { data: existingCasos, error: fetchError } = await supabase
      .from('casos')
      .select('*')

    if (fetchError) throw fetchError

    // Crear mapas para comparación
    const existingMap = new Map((existingCasos || []).map((caso: any) => [caso.id, caso]))
    const newIdSet = new Set(transformedData.map((caso: any) => caso.id))
    
    let inserted = 0, updated = 0, deleted = 0, errors = 0
    const errorDetails: any[] = []

    // Eliminar registros que ya no están en Sheets
    for (const existing of existingCasos || []) {
      if (existing.id && !newIdSet.has(existing.id)) {
        const { error } = await supabase
          .from('casos')
          .delete()
          .eq('id', existing.id)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'delete', id: existing.id, error: error.message })
        } else {
          deleted++
        }
      }
    }

    // Insertar o actualizar registros
    for (const caso of transformedData) {
      const existing = existingMap.get(caso.id)
      
      if (existing) {
        // Actualizar si existe
        const updateData: any = {
          nombre: caso.nombre,
          estado: caso.estado,
          materia: caso.materia,
          expediente: caso.expediente,
          id_cliente: caso.id_cliente
        }
        
        // Solo agregar updated_at si la columna existe en la tabla
        if ('updated_at' in existing) {
          updateData.updated_at = new Date().toISOString()
        }
        
        const { error } = await supabase
          .from('casos')
          .update(updateData)
          .eq('id', caso.id)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'update', id: caso.id, error: error.message })
        } else {
          updated++
        }
      } else {
        // Insertar si no existe
        const { error } = await supabase
          .from('casos')
          .insert({
            id: caso.id,
            nombre: caso.nombre,
            estado: caso.estado,
            materia: caso.materia,
            expediente: caso.expediente,
            id_cliente: caso.id_cliente
          })
        
        if (error) {
          errors++
          errorDetails.push({ action: 'insert', id: caso.id, error: error.message })
        } else {
          inserted++
        }
      }
    }

    console.log(`✅ Sincronización completada: ${inserted} insertados, ${updated} actualizados, ${deleted} eliminados, ${errors} errores`)
    
    return NextResponse.json({
      success: true,
      message: 'Sincronización de Casos exitosa',
      stats: { inserted, updated, deleted, errors },
      details: errorDetails.length > 0 ? errorDetails : undefined
    })
  } catch (error) {
    console.error('❌ Error al sincronizar Casos:', error)
    return NextResponse.json(
      { 
        error: 'Error al sincronizar Casos',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sync-casos',
    method: 'POST',
    description: 'Sincroniza la hoja "Caso" de Google Sheets con la tabla casos en Supabase',
    usage: 'POST /api/sync-casos'
  })
}
