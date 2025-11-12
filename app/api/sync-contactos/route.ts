import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'
import { getTableMapping } from '@/lib/sync-config'

export async function POST(request: NextRequest) {
  try {
    console.log('👥 Iniciando sincronización de Contactos...')
    
    // Obtener configuración de mapeo
    const mapping = getTableMapping('Contacto')
    if (!mapping) {
      throw new Error('No se encontró configuración para la hoja "Contacto"')
    }

    // Leer datos de Google Sheets
    const contactosData = await GoogleSheetsService.readSheet('Contacto')
    
    console.log(`📊 Datos leídos de Google Sheets:`, contactosData.length, 'registros')
    if (contactosData.length > 0) {
      console.log(`📋 Primer registro:`, contactosData[0])
    }
    
    const transformedData = contactosData

    // Obtener contactos existentes
    const { data: existingContactos, error: fetchError } = await supabase
      .from('contactos')
      .select('*')

    if (fetchError) throw fetchError

    // Crear mapas para comparación
    const existingMap = new Map((existingContactos || []).map((cont: any) => [cont.id, cont]))
    const newIdSet = new Set(transformedData.map((cont: any) => cont.id))
    
    let inserted = 0, updated = 0, deleted = 0, errors = 0
    const errorDetails: any[] = []

    // Eliminar registros que ya no están en Sheets
    for (const existing of existingContactos || []) {
      if (existing.id && !newIdSet.has(existing.id)) {
        const { error } = await supabase
          .from('contactos')
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
    for (const contacto of transformedData) {
      const existing = existingMap.get(contacto.id)
      
      if (existing) {
        // Actualizar si existe
        const { error } = await supabase
          .from('contactos')
          .update({
            ...contacto,
            updated_at: new Date().toISOString()
          })
          .eq('id', contacto.id)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'update', id: contacto.id, error: error.message })
        } else {
          updated++
        }
      } else {
        // Insertar si no existe
        const { error } = await supabase
          .from('contactos')
          .insert(contacto)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'insert', id: contacto.id, error: error.message })
        } else {
          inserted++
        }
      }
    }

    console.log(`✅ Sincronización completada: ${inserted} insertados, ${updated} actualizados, ${deleted} eliminados, ${errors} errores`)
    
    return NextResponse.json({
      success: true,
      message: 'Sincronización de Contactos exitosa',
      stats: { inserted, updated, deleted, errors },
      details: errorDetails.length > 0 ? errorDetails : undefined
    })
  } catch (error) {
    console.error('❌ Error al sincronizar Contactos:', error)
    return NextResponse.json(
      { 
        error: 'Error al sincronizar Contactos',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sync-contactos',
    method: 'POST',
    description: 'Sincroniza la hoja "Contacto" de Google Sheets con la tabla contactos en Supabase',
    usage: 'POST /api/sync-contactos'
  })
}
