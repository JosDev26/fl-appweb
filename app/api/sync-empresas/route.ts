import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'
import { getTableMapping } from '@/lib/sync-config'

export async function GET() {
  return syncEmpresas()
}

export async function POST() {
  return syncEmpresas()
}

async function syncEmpresas() {
  try {
    console.log('🏢 Iniciando sincronización de Empresas...')
    
    // Obtener configuración de mapeo
    const mapping = getTableMapping('Empresas')
    if (!mapping) {
      throw new Error('No se encontró configuración para la hoja "Empresas"')
    }

    // Leer datos de Google Sheets
    const empresasData = await GoogleSheetsService.readEmpresas()
    
    console.log(`📊 Datos leídos de Google Sheets:`, empresasData.length, 'registros')
    if (empresasData.length > 0) {
      console.log(`📋 Primer registro:`, empresasData[0])
    }
    
    // Los datos ya vienen transformados desde readEmpresas
    const transformedData = empresasData

    // Obtener empresas existentes
    const { data: existingEmpresas, error: fetchError } = await supabase
      .from('empresas')
      .select('*')

    if (fetchError) throw fetchError

    // Crear mapas para comparación
    const existingMap = new Map((existingEmpresas || []).map((emp: any) => [emp.id, emp]))
    const newIdSet = new Set(transformedData.map((emp: any) => emp.id))
    
    let inserted = 0, updated = 0, deleted = 0, errors = 0
    const errorDetails: any[] = []

    // Eliminar registros que ya no están en Sheets
    for (const existing of existingEmpresas || []) {
      if (existing.id && !newIdSet.has(existing.id)) {
        const { error } = await supabase
          .from('empresas')
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
    for (const empresa of transformedData) {
      const existing = existingMap.get(empresa.id)
      
      if (existing) {
        // Actualizar si existe
        const { error } = await supabase
          .from('empresas')
          .update({
            ...empresa,
            updated_at: new Date().toISOString()
          })
          .eq('id', empresa.id)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'update', id: empresa.id, error: error.message })
        } else {
          updated++
        }
      } else {
        // Insertar si no existe
        const { error } = await supabase
          .from('empresas')
          .insert(empresa)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'insert', id: empresa.id, error: error.message })
        } else {
          inserted++
        }
      }
    }

    console.log(`✅ Sincronización completada: ${inserted} insertadas, ${updated} actualizadas, ${deleted} eliminadas, ${errors} errores`)
    
    return NextResponse.json({
      success: true,
      message: 'Sincronización de Empresas exitosa',
      stats: { inserted, updated, deleted, errors },
      details: errorDetails.length > 0 ? errorDetails : undefined
    })
  } catch (error) {
    console.error('❌ Error al sincronizar Empresas:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { 
        success: false,
        message: `Error al sincronizar Empresas: ${errorMessage}`,
        error: errorMessage
      },
      { status: 500 }
    )
  }
}
