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
    
    // DEBUG: Mostrar TODOS los IDs y nombres de Sheets
    console.log('📋 === EMPRESAS EN GOOGLE SHEETS ===')
    empresasData.forEach((emp: any, i: number) => {
      console.log(`  [${i}] ID="${emp.id}" | Nombre="${emp.nombre}"`)
    })
    console.log('📋 === FIN LISTA SHEETS ===')
    
    // Los datos ya vienen transformados desde readEmpresas
    const transformedData = empresasData

    // Obtener empresas existentes
    const { data: existingEmpresas, error: fetchError } = await supabase
      .from('empresas')
      .select('*')

    if (fetchError) throw fetchError

    // DEBUG: Mostrar TODOS los IDs y nombres de Supabase
    console.log('📋 === EMPRESAS EN SUPABASE ===')
    ;(existingEmpresas || []).forEach((emp: any, i: number) => {
      console.log(`  [${i}] ID="${emp.id}" | Nombre="${emp.nombre}"`)
    })
    console.log('📋 === FIN LISTA SUPABASE ===')

    // Crear mapas para comparación
    const existingMap = new Map((existingEmpresas || []).map((emp: any) => [emp.id, emp]))
    const newIdSet = new Set(transformedData.map((emp: any) => emp.id))
    
    // DEBUG: Log de IDs para detectar discrepancias
    console.log('🔍 IDs en Supabase:', Array.from(existingMap.keys()).slice(0, 10), '... total:', existingMap.size)
    console.log('🔍 IDs en Sheets:', Array.from(newIdSet).slice(0, 10), '... total:', newIdSet.size)
    
    let inserted = 0, updated = 0, deleted = 0, skippedDeletes = 0, errors = 0
    const errorDetails: any[] = []

    // ⚠️ DESHABILITADO: Eliminar registros que ya no están en Sheets
    // Esto evita eliminaciones accidentales por diferencias en IDs
    // Para habilitar, cambiar ENABLE_DELETE a true
    const ENABLE_DELETE = false
    
    for (const existing of existingEmpresas || []) {
      if (existing.id && !newIdSet.has(existing.id)) {
        if (ENABLE_DELETE) {
          const { error } = await supabase
            .from('empresas')
            .delete()
            .eq('id', existing.id)
          
          if (error) {
            errors++
            errorDetails.push({ action: 'delete', id: existing.id, error: error.message })
          } else {
            deleted++
            console.log(`🗑️ Eliminado: ${existing.id} (${existing.nombre})`)
          }
        } else {
          skippedDeletes++
          console.log(`⚠️ NO eliminado (protección activa): ${existing.id} (${existing.nombre}) - No encontrado en Sheets`)
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

    console.log(`✅ Sincronización completada: ${inserted} insertadas, ${updated} actualizadas, ${deleted} eliminadas, ${skippedDeletes} protegidas, ${errors} errores`)
    
    return NextResponse.json({
      success: true,
      message: 'Sincronización de Empresas exitosa',
      stats: { inserted, updated, deleted, skippedDeletes, errors },
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
