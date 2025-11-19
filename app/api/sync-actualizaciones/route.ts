import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'

export async function POST() {
  try {
    console.log('🔄 Iniciando sincronización de actualizaciones...')

    // 1. Obtener datos de Google Sheets (todas las columnas A:Z)
    const SHEET_NAME = 'Actualizaciones'
    const sheetData = await GoogleSheetsService.getSheetData(SHEET_NAME, 'A2:Z')

    if (!sheetData || sheetData.length === 0) {
      console.log('⚠️ No hay datos en la hoja de actualizaciones')
      return NextResponse.json({
        success: true,
        message: 'No hay datos para sincronizar',
        synced: 0
      })
    }

    console.log(`📊 Encontrados ${sheetData.length} registros en Sheets`)

    // 2. Leer headers para debugging
    const headers = await GoogleSheetsService.getSheetData(SHEET_NAME, 'A1:Z1')
    console.log('📋 Headers de la hoja:', headers[0])

    // 3. Procesar cada fila
    let syncedCount = 0
    let errorCount = 0

    for (const row of sheetData) {
      try {
        // Columnas según la estructura REAL de Sheets
        const id = row[0]?.toString().trim()                    // A: ID_Actualizacion
        const tipoCliente = row[1]?.toString().trim()           // B: Tipo_Cliente
        const idClienteFisico = row[2]?.toString().trim()       // C: ID_Cliente (si es físico)
        const idClienteJuridico = row[2]?.toString().trim()     // C: ID_Cliente (si es jurídico)
        // Columna D está vacía o tiene otro dato
        const idSolicitud = row[4]?.toString().trim()           // E: ID_Solicitud (CORREGIDO)
        const comentario = row[5]?.toString().trim()            // F: Comentario
        const tiempoStr = row[6]?.toString().trim()             // G: Tiempo
        const etapaActual = row[7]?.toString().trim()           // H: Etapa_Actual

        // Debug: mostrar lo que se está leyendo
        console.log(`📝 Procesando: ID=${id}, ID_Solicitud=${idSolicitud}, Tipo=${tipoCliente}`)

        // Validar que tenga al menos el ID
        if (!id) {
          console.log('⚠️ Registro sin ID, saltando...')
          continue
        }

        // Validar que tenga ID_Solicitud
        if (!idSolicitud) {
          console.log(`⚠️ Actualización ${id} sin ID_Solicitud, columna D vacía`)
          console.log(`   Fila completa:`, row)
        }

        // Determinar el ID del cliente según el tipo
        let idCliente = null
        if (tipoCliente === 'Físico' || tipoCliente === 'Fisico') {
          idCliente = idClienteFisico
        } else if (tipoCliente === 'Jurídico' || tipoCliente === 'Juridico') {
          idCliente = idClienteJuridico
        }

        // Parsear la fecha (formato: DD/MM/YYYY HH:MM:SS)
        let tiempo = null
        if (tiempoStr) {
          try {
            // Formato esperado: "14/11/2025 13:44:37"
            const [datePart, timePart] = tiempoStr.split(' ')
            if (datePart && timePart) {
              const [day, month, year] = datePart.split('/')
              const [hours, minutes, seconds] = timePart.split(':')
              
              // Crear fecha en formato ISO
              tiempo = new Date(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hours),
                parseInt(minutes),
                parseInt(seconds)
              ).toISOString()
            }
          } catch (error) {
            console.log(`⚠️ Error al parsear fecha: ${tiempoStr}`)
          }
        }

        // Preparar datos para insertar/actualizar
        const actualizacionData = {
          id,
          tipo_cliente: tipoCliente || null,
          id_cliente: idCliente || null,
          id_solicitud: idSolicitud || null,
          comentario: comentario || null,
          tiempo: tiempo,
          etapa_actual: etapaActual || null,
          updated_at: new Date().toISOString()
        }

        // 3. Insertar o actualizar en Supabase
        const { error } = await supabase
          .from('actualizaciones')
          .upsert(actualizacionData, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (error) {
          console.error(`❌ Error al sincronizar actualización ${id}:`, error.message)
          errorCount++
        } else {
          syncedCount++
        }

      } catch (error) {
        console.error('❌ Error al procesar fila:', error)
        errorCount++
      }
    }

    console.log(`✅ Sincronización completada: ${syncedCount} exitosos, ${errorCount} errores`)

    return NextResponse.json({
      success: true,
      message: 'Sincronización de actualizaciones completada',
      synced: syncedCount,
      errors: errorCount,
      total: sheetData.length
    })

  } catch (error) {
    console.error('❌ Error en sincronización de actualizaciones:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Error al sincronizar actualizaciones',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
