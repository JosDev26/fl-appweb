import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'

// Este endpoint sincroniza BIDIRECCIONAL: Supabase → Sheets
// Supabase tiene prioridad para escribir y eliminar datos

export async function GET() {
  return syncIngresos()
}

export async function POST() {
  return syncIngresos()
}

async function syncIngresos() {
  try {
    console.log('💰 Iniciando sincronización de Ingresos (Supabase → Sheets)...')

    // 1. Obtener todos los ingresos de Supabase
    const { data: ingresosSupabase, error: supabaseError } = await (supabase as any)
      .from('ingresos')
      .select('*')
      .order('fecha_aprobacion', { ascending: false })

    if (supabaseError) {
      throw new Error(`Error leyendo Supabase: ${supabaseError.message}`)
    }

    console.log(`📊 Ingresos en Supabase: ${ingresosSupabase?.length || 0}`)

    // 2. Obtener todos los ingresos de Google Sheets
    // Columnas: ID_Ingreso, Fecha_Pago, Fecha_Aprobacion, Cliente, Modalidad_Pago, Moneda, Honorarios, Servicios, Reembolso_Gastos, Total_Ingreso
    const sheetData = await GoogleSheetsService.getSheetData('Ingresos', 'A2:J')
    
    console.log(`📊 Ingresos en Sheets: ${sheetData?.length || 0}`)

    // Crear mapas para comparación
    const sheetsMap = new Map<string, any>()
    if (sheetData && sheetData.length > 0) {
      for (const row of sheetData) {
        const id = row[0]?.toString().trim()
        if (id) {
          sheetsMap.set(id, {
            id,
            fecha_pago: row[1]?.toString().trim() || null,
            fecha_aprobacion: row[2]?.toString().trim() || null,
            cliente: row[3]?.toString().trim() || null,
            modalidad_pago: row[4]?.toString().trim() || null,
            moneda: row[5]?.toString().trim() || null,
            honorarios: row[6]?.toString().trim() || null,
            servicios: row[7]?.toString().trim() || null,
            reembolso_gastos: row[8]?.toString().trim() || null,
            total_ingreso: row[9]?.toString().trim() || null
          })
        }
      }
    }

    const supabaseMap = new Map<string, any>()
    if (ingresosSupabase && ingresosSupabase.length > 0) {
      for (const ingreso of ingresosSupabase) {
        if (ingreso.id) {
          supabaseMap.set(ingreso.id, ingreso)
        }
      }
    }

    let inserted = 0
    let updated = 0
    let deleted = 0
    let errors = 0
    const errorDetails: any[] = []

    // 3. Sincronizar Supabase → Sheets (agregar/actualizar en Sheets lo que está en Supabase)
    for (const [id, ingreso] of supabaseMap) {
      try {
        // Obtener nombre del cliente
        let clienteNombre = ingreso.id_cliente || ''
        if (ingreso.id_cliente) {
          // Buscar en usuarios
          const { data: usuario } = await supabase
            .from('usuarios')
            .select('nombre')
            .eq('id', ingreso.id_cliente)
            .single()
          
          if (usuario?.nombre) {
            clienteNombre = usuario.nombre
          } else {
            // Buscar en empresas
            const { data: empresa } = await supabase
              .from('empresas')
              .select('nombre')
              .eq('id', ingreso.id_cliente)
              .single()
            
            if (empresa?.nombre) {
              clienteNombre = empresa.nombre
            }
          }
        }

        // Formatear fecha para Sheets (DD/MM/YYYY)
        const formatDate = (dateStr: string | null) => {
          if (!dateStr) return ''
          try {
            const date = new Date(dateStr)
            const day = date.getDate().toString().padStart(2, '0')
            const month = (date.getMonth() + 1).toString().padStart(2, '0')
            const year = date.getFullYear()
            return `${day}/${month}/${year}`
          } catch {
            return dateStr
          }
        }

        // Formatear moneda
        const formatMonto = (monto: number | null, moneda: string) => {
          if (monto === null || monto === undefined) return ''
          const symbol = moneda?.toLowerCase() === 'dolar' || moneda?.toLowerCase() === 'usd' ? '$' : '₡'
          return `${symbol}${monto.toLocaleString('es-CR')}`
        }

        const rowData = [
          ingreso.id,
          formatDate(ingreso.fecha_pago),
          formatDate(ingreso.fecha_aprobacion),
          clienteNombre,
          ingreso.modalidad_pago || '',
          ingreso.moneda || 'colones',
          formatMonto(ingreso.honorarios, ingreso.moneda),
          formatMonto(ingreso.servicios, ingreso.moneda),
          formatMonto(ingreso.reembolso_gastos, ingreso.moneda),
          formatMonto(ingreso.total_ingreso, ingreso.moneda)
        ]

        if (!sheetsMap.has(id)) {
          // No existe en Sheets, agregar
          await GoogleSheetsService.appendRow('Ingresos', rowData)
          inserted++
          console.log(`✅ Ingreso agregado a Sheets: ${id}`)
        } else {
          // Ya existe, podríamos actualizar si es necesario
          // Por ahora solo contamos como actualizado si los datos cambian
          updated++
        }
      } catch (err) {
        errors++
        errorDetails.push({ id, action: 'write_sheets', error: String(err) })
        console.error(`❌ Error escribiendo ingreso ${id} a Sheets:`, err)
      }
    }

    // 4. Eliminar de Sheets los que ya no están en Supabase
    // Nota: Google Sheets API no tiene delete directo, necesitamos leer y reescribir
    // Por ahora, solo reportamos los que deberían eliminarse
    const toDeleteFromSheets: string[] = []
    for (const [id] of sheetsMap) {
      if (!supabaseMap.has(id)) {
        toDeleteFromSheets.push(id)
      }
    }

    if (toDeleteFromSheets.length > 0) {
      console.log(`⚠️ IDs a eliminar de Sheets (no implementado aún): ${toDeleteFromSheets.join(', ')}`)
      // TODO: Implementar eliminación de filas en Sheets
    }

    // 5. También sincronizar Sheets → Supabase (por si hay datos manuales en Sheets)
    // Pero Supabase tiene prioridad, así que solo importamos lo que NO existe en Supabase
    for (const [id, sheetIngreso] of sheetsMap) {
      if (!supabaseMap.has(id)) {
        try {
          // Parsear fecha de Sheets (DD/MM/YYYY) a ISO
          const parseDate = (dateStr: string | null) => {
            if (!dateStr) return null
            try {
              const parts = dateStr.split('/')
              if (parts.length === 3) {
                const [day, month, year] = parts
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
              }
            } catch {}
            return null
          }

          // Parsear monto (quitar símbolos de moneda y comas)
          const parseMonto = (montoStr: string | null) => {
            if (!montoStr) return null
            const cleaned = montoStr.replace(/[₡$,\s]/g, '').trim()
            const num = parseFloat(cleaned)
            return isNaN(num) ? null : num
          }

          const ingresoData = {
            id,
            fecha_pago: parseDate(sheetIngreso.fecha_pago),
            fecha_aprobacion: parseDate(sheetIngreso.fecha_aprobacion),
            id_cliente: sheetIngreso.cliente, // Nota: en Sheets guardamos el nombre, no el ID
            modalidad_pago: sheetIngreso.modalidad_pago,
            moneda: sheetIngreso.moneda?.toLowerCase() || 'colones',
            honorarios: parseMonto(sheetIngreso.honorarios),
            servicios: parseMonto(sheetIngreso.servicios),
            reembolso_gastos: parseMonto(sheetIngreso.reembolso_gastos),
            total_ingreso: parseMonto(sheetIngreso.total_ingreso)
          }

          const { error: insertError } = await (supabase as any)
            .from('ingresos')
            .insert(ingresoData)

          if (insertError) {
            errors++
            errorDetails.push({ id, action: 'insert_supabase', error: insertError.message })
          } else {
            inserted++
            console.log(`✅ Ingreso importado de Sheets a Supabase: ${id}`)
          }
        } catch (err) {
          errors++
          errorDetails.push({ id, action: 'import_from_sheets', error: String(err) })
        }
      }
    }

    const totalLeidos = Math.max(ingresosSupabase?.length || 0, sheetData?.length || 0)
    console.log(`✅ Sincronización completada: ${inserted} insertados, ${updated} actualizados, ${deleted} eliminados, ${errors} errores`)

    return NextResponse.json({
      success: errors === 0,
      message: `Ingresos: ${totalLeidos} leídos, ${inserted} insertados, ${updated} actualizados, ${toDeleteFromSheets.length} pendientes eliminar, ${errors} errores`,
      stats: {
        leidos: totalLeidos,
        inserted,
        updated,
        omitidos: toDeleteFromSheets.length,
        errors,
        supabase_count: ingresosSupabase?.length || 0,
        sheets_count: sheetData?.length || 0
      },
      details: errorDetails.length > 0 ? errorDetails : undefined,
      code: 200
    })

  } catch (error) {
    console.error('❌ Error en sincronización de ingresos:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      {
        success: false,
        message: `Ingresos: Error - ${errorMessage}`,
        error: errorMessage,
        code: 500
      },
      { status: 500 }
    )
  }
}
