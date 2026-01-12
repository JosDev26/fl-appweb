import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'
import { checkSyncRateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  // Rate limiting: 5 requests per minute per IP
  const rateLimitResponse = await checkSyncRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  return syncServiciosProfesionales()
}

export async function POST(request: NextRequest) {
  // Rate limiting: 5 requests per minute per IP
  const rateLimitResponse = await checkSyncRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  return syncServiciosProfesionales()
}

async function syncServiciosProfesionales() {
  try {
    console.log('🔄 Iniciando sincronización de Servicios Profesionales...')

    // 1. Obtener datos de Google Sheets (columnas A:M)
    const SHEET_NAME = 'Servicios'
    const sheetData = await GoogleSheetsService.getSheetData(SHEET_NAME, 'A2:M')

    if (!sheetData || sheetData.length === 0) {
      console.log('⚠️ No hay datos en la hoja de servicios')
      return NextResponse.json({
        success: true,
        message: 'Servicios Profesionales: 0 leídos, 0 insertados, 0 actualizados, 0 omitidos, 0 errores',
        stats: { leidos: 0, inserted: 0, updated: 0, omitidos: 0, errors: 0 },
        code: 200
      })
    }

    console.log(`📊 Encontrados ${sheetData.length} registros en Sheets`)

    // 1.1 Obtener servicios existentes en Supabase (incluyendo estado_pago)
    const { data: existingServicios, error: fetchError } = await supabase
      .from('servicios_profesionales' as any)
      .select('id, estado_pago')

    if (fetchError) throw fetchError

    // Crear mapa de IDs existentes con su estado_pago
    const existingEstadoPago = new Map<string, string>()
    for (const existing of (existingServicios || []) as any[]) {
      if (existing.id) {
        existingEstadoPago.set(existing.id, existing.estado_pago || 'pendiente')
      }
    }

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
          .from('servicios_profesionales' as any)
          .delete()
          .eq('id', existing.id)
        
        if (!deleteError) {
          deletedCount++
          console.log(`🗑️ Servicio eliminado: ${existing.id}`)
        }
      }
    }

    // 2. Batch validation: Get all valid funcionarios IDs at once
    const allResponsableIds = new Set<string>()
    for (const row of sheetData) {
      const idResponsable = row[6]?.toString().trim()
      if (idResponsable) allResponsableIds.add(idResponsable)
    }

    // Fetch all valid funcionarios in a single query
    let validResponsableIds = new Set<string>()
    if (allResponsableIds.size > 0) {
      const { data: funcionarios } = await supabase
        .from('funcionarios')
        .select('id')
        .in('id', Array.from(allResponsableIds))
      
      if (funcionarios) {
        validResponsableIds = new Set(funcionarios.map((f: any) => f.id))
      }
    }

    // 3. Procesar cada fila
    let syncedCount = 0
    let errorCount = 0
    let skippedCount = 0
    const errorDetails: any[] = []

    for (const row of sheetData) {
      try {
        // Columnas según la estructura (A=0, B=1, C=2, etc.)
        const id = row[0]?.toString().trim()                        // A (índice 0): ID_Honoriario
        const idCasoSheets = row[1]?.toString().trim()              // B (índice 1): ID_Caso
        const idSolicitudSheets = row[2]?.toString().trim()         // C (índice 2): ID_Solicitud
        const idClienteSheets = row[3]?.toString().trim()           // D (índice 3): ID_Cliente (físico)
        // Columna E (índice 4): tipo_cliente - NO SE LEE, se preserva en Sheets
        const idEmpresaSheets = row[5]?.toString().trim()           // F (índice 5): ID_Empresa (jurídico)
        const idResponsable = row[6]?.toString().trim()             // G (índice 6): ID_Responsable
        const idServicio = row[7]?.toString().trim()                // H (índice 7): ID_Servicio
        const fechaStr = row[8]?.toString().trim()                  // I (índice 8): Fecha
        const costoStr = row[9]?.toString().trim()                  // J (índice 9): Costo
        const gastosStr = row[10]?.toString().trim()                // K (índice 10): Gastos
        const ivaStr = row[11]?.toString().trim()                   // L (índice 11): IVA
        const totalStr = row[12]?.toString().trim()                 // M (índice 12): Total

        // Validar que tenga al menos el ID
        if (!id) {
          console.log('⚠️ Registro sin ID, saltando...')
          skippedCount++
          continue
        }

        // Determinar id_caso (columna B o C, la que tenga dato)
        // Solo uno de los dos puede tener valor
        const idCaso = idCasoSheets || idSolicitudSheets || null

        // Determinar id_cliente (columna D o F, la que tenga dato)
        // Solo uno de los dos puede tener valor
        const idCliente = idClienteSheets || idEmpresaSheets || null

        // Parsear la fecha (formato DD/MM/YYYY)
        let fecha = null
        if (fechaStr) {
          try {
            const parts = fechaStr.split('/')
            if (parts.length === 3) {
              const [part1, part2, part3] = parts
              const num1 = parseInt(part1)
              const num2 = parseInt(part2)
              
              // Detectar formato automáticamente
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
                // Ambiguo, asumimos DD/MM/YYYY (formato usado en Costa Rica)
                day = part1
                month = part2
              }
              
              fecha = `${part3}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
            }
          } catch (error) {
            console.log(`⚠️ Error al parsear fecha: ${fechaStr}`)
          }
        }

        // Función para parsear montos (remover ₡, $, comas)
        const parseMonto = (value: string | undefined): number | null => {
          if (!value || value === '' || value === 'NULL') return null
          const numStr = value.replace(/[₡$,]/g, '').trim()
          const num = parseFloat(numStr)
          return isNaN(num) ? null : num
        }

        // Parsear montos
        const costo = parseMonto(costoStr)
        const gastos = parseMonto(gastosStr)
        const iva = parseMonto(ivaStr)
        const total = parseMonto(totalStr)

        // Validar que el funcionario existe usando el batch lookup
        let responsableValido = null
        if (idResponsable && validResponsableIds.has(idResponsable)) {
          responsableValido = idResponsable
        } else if (idResponsable) {
          console.log(`⚠️ Funcionario ${idResponsable} no existe en la BD, usando null`)
        }

        // Preparar datos para insertar/actualizar
        // IMPORTANTE: Preservar estado_pago si el registro ya existe
        const existingEstado = existingEstadoPago.get(id)
        const servicioData = {
          id,
          id_caso_sheets: idCasoSheets || null,
          id_solicitud_sheets: idSolicitudSheets || null,
          id_caso: idCaso,
          id_cliente_sheets: idClienteSheets || null,
          id_empresa_sheets: idEmpresaSheets || null,
          id_cliente: idCliente,
          id_responsable: responsableValido,
          id_servicio: idServicio || null,
          fecha,
          costo,
          gastos,
          iva,
          total,
          // Preservar estado_pago existente, o 'pendiente' para nuevos registros
          estado_pago: existingEstado || 'pendiente'
        }

        // Debug: mostrar lo que se está procesando
        console.log(`📝 Procesando servicio: ID=${id}, Caso=${idCaso || 'null'}, Cliente=${idCliente || 'null'}, Total=${total}`)

        // 3. Insertar o actualizar en Supabase
        const { error } = await supabase
          .from('servicios_profesionales' as any)
          .upsert(servicioData, {
            onConflict: 'id',
            ignoreDuplicates: false
          })

        if (error) {
          console.error(`❌ Error al sincronizar servicio ${id}:`, error.message)
          errorCount++
          errorDetails.push({
            id,
            total,
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

    console.log(`✅ Sincronización completada: ${syncedCount} exitosos, ${deletedCount} eliminados, ${skippedCount} omitidos (sin ID), ${errorCount} errores`)

    return NextResponse.json({
      success: errorCount === 0,
      message: `Servicios Profesionales: ${sheetData.length} leídos, ${syncedCount} sincronizados, ${deletedCount} eliminados, ${skippedCount} omitidos, ${errorCount} errores`,
      stats: {
        leidos: sheetData.length,
        inserted: syncedCount,
        updated: 0,
        omitidos: skippedCount,
        deleted: deletedCount,
        errors: errorCount
      },
      details: errorDetails.length > 0 ? errorDetails : undefined,
      code: 200
    })

  } catch (error) {
    console.error('❌ Error en sincronización de servicios profesionales:', error)
    return NextResponse.json(
      {
        success: false,
        message: 'Servicios Profesionales: Error interno del servidor',
        code: 500
      },
      { status: 500 }
    )
  }
}
