import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'
import { getTableMapping } from '@/lib/sync-config'

export async function GET() {
  return syncUsuarios()
}

export async function POST() {
  return syncUsuarios()
}

async function syncUsuarios() {
  try {
    console.log('👤 Iniciando sincronización de Usuarios (Clientes)...')
    
    // Obtener configuración de mapeo
    const mapping = getTableMapping('Clientes')
    if (!mapping) {
      throw new Error('No se encontró configuración para la hoja "Clientes"')
    }

    // Leer datos de Google Sheets
    const clientesData = await GoogleSheetsService.readSheet('Clientes')
    
    console.log(`📊 Datos leídos de Google Sheets:`, clientesData.length, 'registros')
    if (clientesData.length > 0) {
      console.log(`📋 Primer registro:`, clientesData[0])
    }

    // Obtener usuarios existentes
    const { data: existingUsuarios, error: fetchError } = await supabase
      .from('usuarios')
      .select('*')

    if (fetchError) throw fetchError

    // Crear mapas para comparación
    const existingMap = new Map((existingUsuarios || []).map((u: any) => [u.id, u]))
    const newIdSet = new Set(clientesData.map((c: any) => c.id))
    
    let inserted = 0, updated = 0, skipped = 0, errors = 0
    const errorDetails: any[] = []

    // Procesar cada registro de Sheets
    for (const cliente of clientesData) {
      if (!cliente.id) {
        skipped++
        continue
      }

      const existing = existingMap.get(cliente.id)
      
      // Preparar datos para upsert (sin password ni campos que no vienen de Sheets)
      const userData = {
        id: cliente.id,
        nombre: cliente.nombre || null,
        correo: cliente.correo || null,
        telefono: cliente.telefono || null,
        tipo_cedula: cliente.tipo_cedula || null,
        cedula: cliente.cedula || null,
        esDolar: cliente.esDolar ?? false,
        iva_perc: cliente.iva_perc ?? 0.13
      }
      
      if (existing) {
        // Actualizar si existe - preservar password y otros campos locales
        const { error } = await supabase
          .from('usuarios')
          .update({
            nombre: userData.nombre,
            correo: userData.correo,
            telefono: userData.telefono,
            tipo_cedula: userData.tipo_cedula,
            cedula: userData.cedula,
            esDolar: userData.esDolar,
            iva_perc: userData.iva_perc
          })
          .eq('id', cliente.id)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'update', id: cliente.id, error: error.message })
        } else {
          updated++
        }
      } else {
        // Insertar si no existe
        const { error } = await supabase
          .from('usuarios')
          .insert({
            ...userData,
            modoPago: false // Valor por defecto requerido (boolean)
          })
        
        if (error) {
          errors++
          errorDetails.push({ action: 'insert', id: cliente.id, error: error.message })
        } else {
          inserted++
        }
      }
    }

    console.log(`✅ Sincronización completada: ${inserted} insertados, ${updated} actualizados, ${skipped} omitidos, ${errors} errores`)
    
    return NextResponse.json({
      success: true,
      message: `Usuarios: ${clientesData.length} leídos, ${inserted} insertados, ${updated} actualizados, ${skipped} omitidos, ${errors} errores`,
      stats: { 
        leidos: clientesData.length,
        inserted, 
        updated, 
        skipped, 
        errors 
      },
      details: errorDetails.length > 0 ? errorDetails : undefined
    })
  } catch (error) {
    console.error('❌ Error al sincronizar Usuarios:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { 
        success: false,
        message: `Error al sincronizar Usuarios: ${errorMessage}`,
        error: errorMessage
      },
      { status: 500 }
    )
  }
}
