import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'

export async function GET() {
  return syncGastos()
}

export async function POST() {
  return syncGastos()
}

async function syncGastos() {
  try {
    console.log('🔄 Iniciando sincronización de Gastos...')

    // 1. Obtener datos de Google Sheets (columnas A:Q)
    const SHEET_NAME = 'Gastos'
    const sheetData = await GoogleSheetsService.getSheetData(SHEET_NAME, 'A2:Q')

    if (!sheetData || sheetData.length === 0) {
      console.log('⚠️ No hay datos en la hoja de gastos')
      return NextResponse.json({
        success: true,
        message: 'No hay datos para sincronizar',
        synced: 0
      })
    }

    console.log(`📊 Encontrados ${sheetData.length} registros en Sheets`)

    // 2. Procesar cada fila
    let syncedCount = 0
    let errorCount = 0
    const errorDetails: any[] = []

    for (const row of sheetData) {
      try {
        // Columnas según la estructura actualizada (A=0, B=1, C=2, etc.)
        const id = row[0]?.toString().trim()                     // A (índice 0): ID_Gasto
        const idAsociacion = row[2]?.toString().trim()           // C (índice 2): ID_Asociacion
        const idSolicitud = row[3]?.toString().trim()            // D (índice 3): ID_Solicitud
        const idCasoCol = row[4]?.toString().trim()              // E (índice 4): ID_Caso
        const idClienteCol = row[6]?.toString().trim()           // G (índice 6): ID_Cliente
        const idEmpresaCol = row[7]?.toString().trim()           // H (índice 7): ID_Empresa
        const idResponsable = row[8]?.toString().trim()          // I (índice 8): ID_Responsable
        const fechaStr = row[9]?.toString().trim()               // J (índice 9): Fecha
        const producto = row[11]?.toString().trim()              // L (índice 11): Producto
        const totalCobroStr = row[16]?.toString().trim()         // Q (índice 16): Total_Cobro

        // Validar que tenga al menos el ID
        if (!id) {
          console.log('⚠️ Registro sin ID, saltando...')
          continue
        }

        // Determinar ID_Caso (columna D o E, la que tenga dato)
        const idCaso = idSolicitud || idCasoCol || null
        
        // Determinar ID_Cliente (columna G o H, la que tenga dato)
        const idCliente = idClienteCol || idEmpresaCol || null

        // Parsear la fecha (detectar formato automáticamente)
        let fecha = null
        if (fechaStr) {
          try {
            const parts = fechaStr.split('/')
            if (parts.length === 3) {
              const [part1, part2, part3] = parts
              const num1 = parseInt(part1)
              const num2 = parseInt(part2)
              const year = part3
              
              // Si el primer número es mayor a 12, es DD/MM/YYYY
              // Si el segundo número es mayor a 12, es MM/DD/YYYY
              // Si ambos son <= 12, asumimos DD/MM/YYYY por defecto
              let day, month
              if (num1 > 12) {
                // Definitivamente DD/MM/YYYY
                day = part1
                month = part2
              } else if (num2 > 12) {
                // Definitivamente MM/DD/YYYY
                month = part1
                day = part2
              } else {
                // Ambiguo, asumimos DD/MM/YYYY
                day = part1
                month = part2
              }
              
              fecha = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
            }
          } catch (error) {
            console.log(`⚠️ Error al parsear fecha: ${fechaStr}`)
          }
        }

        // Parsear el monto (remover ₡, $, comas)
        let totalCobro = null
        if (totalCobroStr) {
          const numStr = totalCobroStr.replace(/[₡$,]/g, '').trim()
          const num = parseFloat(numStr)
          totalCobro = isNaN(num) ? null : num
        }

        // Validar que el funcionario existe si hay id_responsable
        let responsableValido = null
        if (idResponsable) {
          const { data: funcionarioExiste } = await supabase
            .from('funcionarios')
            .select('id')
            .eq('id', idResponsable)
            .maybeSingle()
          
          if (funcionarioExiste) {
            responsableValido = idResponsable
          } else {
            console.log(`⚠️ Funcionario ${idResponsable} no existe en la BD, usando null`)
          }
        }

        // Preparar datos para insertar/actualizar
        const gastoData = {
          id,
          id_asociacion: idAsociacion || null,
          id_caso: idCaso,
          id_responsable: responsableValido,
          id_cliente: idCliente,
          fecha: fecha,
          producto: producto || null,
          total_cobro: totalCobro,
          updated_at: new Date().toISOString()
        }

        // Debug: mostrar lo que se está procesando
        console.log(`📝 Procesando gasto: ID=${id}, Responsable=${responsableValido || 'null'}, Producto=${producto}, Total=${totalCobro}`)

        // 3. Insertar o actualizar en Supabase
        const { error } = await supabase
          .from('gastos' as any)
          .upsert(gastoData, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (error) {
          console.error(`❌ Error al sincronizar gasto ${id}:`, error.message)
          errorCount++
          errorDetails.push({
            id,
            producto,
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

    console.log(`✅ Sincronización completada: ${syncedCount} exitosos, ${errorCount} errores`)

    return NextResponse.json({
      success: errorCount === 0,
      message: `Gastos: ${sheetData.length} leídos, ${syncedCount} sincronizados, ${errorCount} errores`,
      synced: syncedCount,
      errors: errorCount,
      total: sheetData.length,
      details: errorDetails.length > 0 ? errorDetails : undefined
    })

  } catch (error) {
    console.error('❌ Error en sincronización de gastos:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        success: false,
        message: `Error al sincronizar Gastos: ${errorMessage}`,
        error: errorMessage
      },
      { status: 500 }
    )
  }
}
