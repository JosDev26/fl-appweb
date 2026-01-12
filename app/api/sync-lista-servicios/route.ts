import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'
import { checkSyncRateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  // Rate limiting: 5 requests per minute per IP
  const rateLimitResponse = await checkSyncRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  return syncListaServicios()
}

export async function POST(request: NextRequest) {
  // Rate limiting: 5 requests per minute per IP
  const rateLimitResponse = await checkSyncRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  return syncListaServicios()
}

async function syncListaServicios() {
  try {
    console.log('🔄 Iniciando sincronización de Lista de Servicios...')

    // 1. Obtener datos de Google Sheets (columnas A:D)
    const SHEET_NAME = 'Lista_Servicios'
    const sheetData = await GoogleSheetsService.getSheetData(SHEET_NAME, 'A2:D')

    if (!sheetData || sheetData.length === 0) {
      console.log('⚠️ No hay datos en la hoja de lista de servicios')
      return NextResponse.json({
        success: true,
        message: 'Lista_Servicios: 0 leídos, 0 insertados, 0 actualizados, 0 omitidos, 0 errores',
        stats: { leidos: 0, inserted: 0, updated: 0, omitidos: 0, errors: 0 },
        code: 200
      })
    }

    console.log(`📊 Encontrados ${sheetData.length} registros en Sheets`)

    // 1.1 Obtener servicios existentes en Supabase
    const { data: existingServicios, error: fetchError } = await supabase
      .from('lista_servicios' as any)
      .select('id')

    if (fetchError) throw fetchError

    // Crear set de IDs de Sheets
    const sheetsIdSet = new Set<string>()
    for (const row of sheetData) {
      const id = row[0]?.toString().trim()
      if (id) sheetsIdSet.add(id)
    }

    // 1.2 Eliminar de Supabase los que no están en Sheets
    let deletedCount = 0
    for (const existing of (existingServicios || []) as any[]) {
      if (existing.id && !sheetsIdSet.has(existing.id)) {
        const { error: deleteError } = await supabase
          .from('lista_servicios' as any)
          .delete()
          .eq('id', existing.id)
        
        if (!deleteError) {
          deletedCount++
          console.log(`🗑️ Servicio eliminado del catálogo: ${existing.id}`)
        }
      }
    }

    // 2. Función para parsear montos (remover ₡, $, comas)
    const parseMonto = (value: string | undefined): number | null => {
      if (!value || value === '' || value === 'NULL') return null
      const numStr = value.replace(/[₡$,]/g, '').trim()
      const num = parseFloat(numStr)
      return isNaN(num) ? null : num
    }

    // 3. Procesar cada fila
    let syncedCount = 0
    let errorCount = 0
    let skippedCount = 0
    let warningCount = 0
    const errorDetails: any[] = []

    for (const row of sheetData) {
      try {
        // Columnas según la estructura (A=0, B=1, C=2, D=3)
        const id = row[0]?.toString().trim()              // A (índice 0): ID_Servicio
        const titulo = row[1]?.toString().trim()          // B (índice 1): Titulo
        const precioCrcStr = row[2]?.toString().trim()    // C (índice 2): Precio_CRC (ej: ₡123,540)
        const precioUsdStr = row[3]?.toString().trim()    // D (índice 3): Precio_USD (ej: $12)

        // Validar que tenga al menos el ID
        if (!id) {
          console.log('⚠️ Registro sin ID, saltando...')
          skippedCount++
          continue
        }

        // Parsear precios
        const precioCrc = parseMonto(precioCrcStr)
        const precioUsd = parseMonto(precioUsdStr)

        // Validar regla de negocio: solo uno de los dos precios debe tener valor
        if (precioCrc !== null && precioUsd !== null) {
          console.log(`⚠️ Servicio ${id} tiene ambos precios (CRC=${precioCrc}, USD=${precioUsd}). Sincronizando ambos valores con warning.`)
          warningCount++
        }

        // Preparar datos para insertar/actualizar
        const servicioData = {
          id,
          titulo: titulo || null,
          precio_crc: precioCrc,
          precio_usd: precioUsd
        }

        // Debug: mostrar lo que se está procesando
        console.log(`📝 Procesando servicio: ID=${id}, Titulo=${titulo || 'null'}, CRC=${precioCrc ?? 'null'}, USD=${precioUsd ?? 'null'}`)

        // 4. Insertar o actualizar en Supabase
        const { error } = await supabase
          .from('lista_servicios' as any)
          .upsert(servicioData, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (error) {
          console.error(`❌ Error al sincronizar servicio ${id}:`, error.message)
          errorCount++
          errorDetails.push({
            id,
            titulo,
            error: error.message
          })
        } else {
          syncedCount++
        }

      } catch (error) {
        console.error('❌ Error al procesar fila:', error)
        errorCount++
      }
    }

    console.log(`✅ Sincronización completada: ${syncedCount} exitosos, ${deletedCount} eliminados, ${skippedCount} omitidos (sin ID), ${warningCount} con ambos precios, ${errorCount} errores`)

    return NextResponse.json({
      success: errorCount === 0,
      message: `Lista_Servicios: ${sheetData.length} leídos, ${syncedCount} sincronizados, ${deletedCount} eliminados, ${skippedCount} omitidos, ${warningCount} warnings, ${errorCount} errores`,
      stats: {
        leidos: sheetData.length,
        inserted: syncedCount,
        updated: 0,
        omitidos: skippedCount,
        deleted: deletedCount,
        warnings: warningCount,
        errors: errorCount
      },
      details: errorDetails.length > 0 ? errorDetails : undefined,
      code: 200
    })

  } catch (error) {
    console.error('❌ Error en sincronización de lista de servicios:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'Lista_Servicios: Error interno del servidor',
        code: 500
      },
      { status: 500 }
    )
  }
}
