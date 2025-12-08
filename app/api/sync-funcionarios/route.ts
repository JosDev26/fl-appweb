import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'
import { getTableMapping } from '@/lib/sync-config'

export async function GET() {
  return syncFuncionarios()
}

export async function POST() {
  return syncFuncionarios()
}

async function syncFuncionarios() {
  try {
    console.log('👨‍💼 Iniciando sincronización de Funcionarios...')
    
    // Obtener configuración de mapeo
    const mapping = getTableMapping('Funcionarios')
    if (!mapping) {
      throw new Error('No se encontró configuración para la hoja "Funcionarios"')
    }

    // Leer datos de Google Sheets
    const funcionariosData = await GoogleSheetsService.readSheet('Funcionarios')
    
    console.log(`📊 Datos leídos de Google Sheets:`, funcionariosData.length, 'registros')
    if (funcionariosData.length > 0) {
      console.log(`📋 Primer registro:`, funcionariosData[0])
    }
    
    const transformedData = funcionariosData

    // Obtener funcionarios existentes
    const { data: existingFuncionarios, error: fetchError } = await supabase
      .from('funcionarios')
      .select('*')

    if (fetchError) throw fetchError

    // Crear mapas para comparación
    const existingMap = new Map((existingFuncionarios || []).map((func: any) => [func.id, func]))
    const newIdSet = new Set(transformedData.map((func: any) => func.id))
    
    let inserted = 0, updated = 0, deleted = 0, errors = 0
    const errorDetails: any[] = []

    // Eliminar registros que ya no están en Sheets
    for (const existing of existingFuncionarios || []) {
      if (existing.id && !newIdSet.has(existing.id)) {
        const { error } = await supabase
          .from('funcionarios')
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
    for (const funcionario of transformedData) {
      const existing = existingMap.get(funcionario.id)
      
      if (existing) {
        // Actualizar si existe
        const { error } = await supabase
          .from('funcionarios')
          .update({
            nombre: funcionario.nombre
          })
          .eq('id', funcionario.id)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'update', id: funcionario.id, error: error.message })
        } else {
          updated++
        }
      } else {
        // Insertar si no existe
        const { error } = await supabase
          .from('funcionarios')
          .insert({
            id: funcionario.id,
            nombre: funcionario.nombre
          })
        
        if (error) {
          errors++
          errorDetails.push({ action: 'insert', id: funcionario.id, error: error.message })
        } else {
          inserted++
        }
      }
    }

    const omitidos = deleted
    console.log(`✅ Sincronización completada: ${inserted} insertados, ${updated} actualizados, ${omitidos} omitidos, ${errors} errores`)
    
    return NextResponse.json({
      success: true,
      message: `Funcionarios: ${funcionariosData.length} leídos, ${inserted} insertados, ${updated} actualizados, ${omitidos} omitidos, ${errors} errores`,
      stats: { leidos: funcionariosData.length, inserted, updated, omitidos, errors },
      details: errorDetails.length > 0 ? errorDetails : undefined,
      code: 200
    })
  } catch (error) {
    console.error('❌ Error al sincronizar Funcionarios:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { 
        success: false,
        message: `Funcionarios: Error - ${errorMessage}`,
        error: errorMessage,
        code: 500
      },
      { status: 500 }
    )
  }
}
