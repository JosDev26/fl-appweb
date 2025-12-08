import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { supabase } from '@/lib/supabase'

// Configuración de Google Sheets
const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
const SHEET_NAME = 'Historial Cambio de Etapa'
const RANGE = `'${SHEET_NAME}'!A:I`

// Autenticación con Google (usando el mismo patrón que GoogleSheetsService)
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})

const sheets = google.sheets({ version: 'v4', auth })

// Parsear fecha de formato DD/MM/YYYY a YYYY-MM-DD
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null
  
  // Si ya está en formato ISO
  if (dateStr.includes('-') && dateStr.length === 10) {
    return dateStr
  }
  
  // Formato DD/MM/YYYY
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    const [day, month, year] = parts
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  
  return null
}

// Parsear hora
function parseTime(timeStr: string): string | null {
  if (!timeStr) return null
  // Asumimos que viene en formato HH:MM:SS o HH:MM
  return timeStr
}

// Función principal de sincronización
async function syncClicksEtapa() {
  console.log('🔄 Iniciando sincronización de Clicks Etapa...')
  
  // Verificar configuración
  if (!SPREADSHEET_ID) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID no está configurado')
  }
  
  if (!process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY) {
    throw new Error('Credenciales de Google Sheets no configuradas (CLIENT_EMAIL o PRIVATE_KEY)')
  }
  
  try {
    // 1. Obtener datos de Google Sheets
    console.log(`📋 Leyendo hoja: ${SHEET_NAME}, rango: ${RANGE}`)
    
    let response
    try {
      response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: RANGE,
      })
    } catch (sheetsError: any) {
      // Error común: hoja no existe
      if (sheetsError.message?.includes('Unable to parse range')) {
        throw new Error(`La hoja "${SHEET_NAME}" no existe en el spreadsheet. Verifica el nombre exacto de la hoja.`)
      }
      throw new Error(`Error leyendo Google Sheets: ${sheetsError.message || String(sheetsError)}`)
    }
    
    const rows = response.data.values || []
    console.log(`📊 Filas obtenidas de Sheets: ${rows.length}`)
    
    if (rows.length <= 1) {
      return {
        success: true,
        message: 'Clicks Etapa: 0 leídos, 0 insertados, 0 actualizados, 0 omitidos, 0 errores',
        stats: { leidos: 0, inserted: 0, updated: 0, omitidos: 0, errors: 0 },
        code: 200
      }
    }
    
    // 1.5 Obtener clicks existentes en Supabase y eliminar los que no están en Sheets
    const { data: existingClicks, error: fetchError } = await (supabase as any)
      .from('clicks_etapa')
      .select('id')

    if (fetchError) throw new Error(`Error leyendo clicks: ${fetchError.message}`)

    // Crear set de IDs de Sheets
    const sheetsIdSet = new Set<string>()
    for (const row of rows.slice(1)) {
      const id = row[0]?.toString().trim()
      if (id) sheetsIdSet.add(id)
    }

    // Eliminar de Supabase los que no están en Sheets
    let deletedCount = 0
    for (const existing of existingClicks || []) {
      if (existing.id && !sheetsIdSet.has(existing.id)) {
        const { error: deleteError } = await (supabase as any)
          .from('clicks_etapa')
          .delete()
          .eq('id', existing.id)
        
        if (!deleteError) {
          deletedCount++
          console.log(`🗑️ Click eliminado: ${existing.id}`)
        }
      }
    }
    
    // 2. Procesar filas (saltamos la primera que es el header)
    const dataRows = rows.slice(1)
    let processed = 0
    let errors = 0
    const errorDetails: string[] = []
    
    for (const row of dataRows) {
      try {
        const id = row[0]?.toString().trim() // Columna A - ID_Click
        
        if (!id) {
          continue // Saltar filas sin ID
        }
        
        const fecha = parseDate(row[1]?.toString().trim()) // Columna B - Fecha
        const hora = parseTime(row[2]?.toString().trim())   // Columna C - Hora
        const idEmpresa = row[4]?.toString().trim() || null // Columna E - ID_Empresa
        const idCliente = row[5]?.toString().trim() || null // Columna F - ID_Cliente
        const idSolicitud = row[6]?.toString().trim() || null // Columna G - ID_Solicitud
        const etapaNueva = row[7]?.toString().trim() || null // Columna H - Etapa_Nueva
        
        // Determinar id_cliente unificado y tipo
        let clienteUnificado: string | null = null
        let tipoCliente: string | null = null
        
        if (idEmpresa) {
          clienteUnificado = idEmpresa
          tipoCliente = 'empresa'
        } else if (idCliente) {
          clienteUnificado = idCliente
          tipoCliente = 'cliente'
        }
        
        // 3. Upsert en Supabase
        const { error } = await (supabase as any)
          .from('clicks_etapa')
          .upsert({
            id,
            fecha,
            hora,
            id_cliente: clienteUnificado,
            tipo_cliente: tipoCliente,
            id_solicitud: idSolicitud,
            etapa_nueva: etapaNueva,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'id'
          })
        
        if (error) {
          console.error(`❌ Error en fila ${id}:`, error.message)
          errors++
          // Si es error de tabla no existe, parar todo
          if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
            throw new Error(`La tabla "clicks_etapa" no existe en Supabase. Ejecuta el SQL de creación primero.`)
          }
          errorDetails.push(`${id}: ${error.message}`)
        } else {
          processed++
        }
        
      } catch (rowError) {
        console.error('❌ Error procesando fila:', rowError)
        errors++
        errorDetails.push(`Error procesando fila: ${rowError}`)
      }
    }
    
    console.log(`✅ Sincronización completada: ${processed} procesados, ${deletedCount} eliminados, ${errors} errores`)
    
    return {
      success: true,
      message: `Clicks Etapa: ${dataRows.length} leídos, ${processed} insertados, 0 actualizados, ${deletedCount} eliminados, ${errors} errores`,
      stats: {
        leidos: dataRows.length,
        inserted: processed,
        updated: 0,
        omitidos: deletedCount,
        errors
      },
      details: errorDetails.length > 0 ? errorDetails.slice(0, 10) : undefined,
      code: 200
    }
    
  } catch (error) {
    console.error('❌ Error en sincronización:', error)
    throw error
  }
}

// GET - Ejecutar sincronización (para compatibilidad con /dev)
export async function GET() {
  try {
    const result = await syncClicksEtapa()
    return NextResponse.json(result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { 
        success: false, 
        message: `Clicks Etapa: Error - ${errorMessage}`,
        error: errorMessage,
        code: 500
      },
      { status: 500 }
    )
  }
}

// POST - También ejecuta sincronización
export async function POST() {
  try {
    const result = await syncClicksEtapa()
    return NextResponse.json(result)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { 
        success: false, 
        message: `Clicks Etapa: Error - ${errorMessage}`,
        error: errorMessage,
        code: 500
      },
      { status: 500 }
    )
  }
}
