import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'

export async function POST(request: NextRequest) {
  try {
    console.log('� Iniciando sincronización de Solicitudes...')
    
    // Leer TODAS las columnas manualmente (A hasta T)
    const allColumnsData = await GoogleSheetsService.getSheetData('Solicitudes', 'A:T')
    
    if (!allColumnsData || allColumnsData.length < 2) {
      return NextResponse.json({ 
        success: true, 
        message: 'No hay datos para sincronizar',
        stats: { inserted: 0, updated: 0, deleted: 0, errors: 0 }
      })
    }

    // Primera fila son los headers
    const headers = allColumnsData[0]
    const rows = allColumnsData.slice(1)

    console.log(`📊 Headers encontrados:`, headers)
    console.log(`📊 Número de filas:`, rows.length)

    // Encontrar índices de columnas relevantes (búsqueda insensible a mayúsculas/minúsculas)
    const findHeader = (headerName: string) => {
      const index = headers.findIndex((h: string) => 
        String(h).toLowerCase().trim() === headerName.toLowerCase().trim()
      )
      if (index === -1) {
        console.warn(`⚠️ No se encontró el header: ${headerName}`)
      } else {
        console.log(`✅ Header '${headerName}' encontrado en índice ${index}: ${headers[index]}`)
      }
      return index
    }

    const idSolicitudIndex = findHeader('ID_Solicitud') // A
    const idClienteFisicoIndex = findHeader('ID_Cliente') // D (para físicos) 
    // Nota: Columna E también se llama ID_Cliente pero para jurídicos
    // Necesitamos buscar ambas columnas D y E
    const tituloIndex = findHeader('Titulo') // F
    const descripcionIndex = findHeader('Descripcion') // G
    const materiaIndex = findHeader('Materia') // H
    const etapaActualIndex = findHeader('Etapa_Actual') // I
    const modalidadPagoIndex = findHeader('Modalidad_Pago') // J
    const costoNetoIndex = findHeader('Costo_Neto') // K
    const seCobraIVAIndex = findHeader('SeCobra_IVA') // L
    const montoIVAIndex = findHeader('Monto_IVA') // M
    const cantidadCuotasIndex = findHeader('Cantidad_Cuotas') // N
    const montoPorCuotaIndex = findHeader('MontoxCuota') // O
    const totalAPagarIndex = findHeader('Total_a_Pagar') // P
    const estadoPagoIndex = findHeader('Estado_Pago') // Q
    const montoPagadoIndex = findHeader('Monto_Pagado') // R
    const saldoPendienteIndex = findHeader('Saldo_Pendiente') // S
    const expedienteIndex = findHeader('Expediente') // T

    if (idSolicitudIndex === -1) {
      throw new Error('No se encontró la columna requerida: ID_Solicitud')
    }

    // Función para convertir montos (remueve ₡, $, comas)
    const parseMontoToNumber = (value: any): number | null => {
      if (!value || value === '' || value === 'NULL' || value === 'null') return null
      const numStr = String(value).replace(/[₡$,]/g, '').trim()
      const num = parseFloat(numStr)
      return isNaN(num) ? null : num
    }

    // Función para convertir booleanos
    const parseBoolean = (value: any): boolean => {
      if (typeof value === 'boolean') return value
      const str = String(value || '').toLowerCase().trim()
      return str === 'true' || str === 'yes' || str === 'sí' || str === 'si' || str === '1'
    }

    // Transformar los datos
    const transformedData = rows
      .filter((row: any[]) => row[idSolicitudIndex] && String(row[idSolicitudIndex]).trim() !== '')
      .map((row: any[]) => {
        // Tomar ID_Cliente de columna D o E (la que tenga dato)
        let idCliente = null
        if (idClienteFisicoIndex !== -1) {
          const idD = String(row[idClienteFisicoIndex] || '').trim()
          const idE = String(row[idClienteFisicoIndex + 1] || '').trim() // E es D+1
          idCliente = idD || idE || null
        }
        
        return {
          id: String(row[idSolicitudIndex]).trim(),
          id_cliente: idCliente,
          titulo: tituloIndex !== -1 ? (String(row[tituloIndex] || '').trim() || null) : null,
          descripcion: descripcionIndex !== -1 ? (String(row[descripcionIndex] || '').trim() || null) : null,
          materia: materiaIndex !== -1 ? (String(row[materiaIndex] || '').trim() || null) : null,
          etapa_actual: etapaActualIndex !== -1 ? (String(row[etapaActualIndex] || '').trim() || null) : null,
          modalidad_pago: modalidadPagoIndex !== -1 ? (String(row[modalidadPagoIndex] || '').trim() || null) : null,
          costo_neto: costoNetoIndex !== -1 ? parseMontoToNumber(row[costoNetoIndex]) : null,
          se_cobra_iva: seCobraIVAIndex !== -1 ? parseBoolean(row[seCobraIVAIndex]) : false,
          monto_iva: montoIVAIndex !== -1 ? parseMontoToNumber(row[montoIVAIndex]) : null,
          cantidad_cuotas: cantidadCuotasIndex !== -1 ? (parseInt(String(row[cantidadCuotasIndex] || '')) || null) : null,
          monto_por_cuota: montoPorCuotaIndex !== -1 ? parseMontoToNumber(row[montoPorCuotaIndex]) : null,
          total_a_pagar: totalAPagarIndex !== -1 ? parseMontoToNumber(row[totalAPagarIndex]) : null,
          estado_pago: estadoPagoIndex !== -1 ? (String(row[estadoPagoIndex] || '').trim() || null) : null,
          monto_pagado: montoPagadoIndex !== -1 ? parseMontoToNumber(row[montoPagadoIndex]) : null,
          saldo_pendiente: saldoPendienteIndex !== -1 ? parseMontoToNumber(row[saldoPendienteIndex]) : null,
          expediente: expedienteIndex !== -1 ? (String(row[expedienteIndex] || '').trim() || null) : null
        }
      })

    console.log(`� Primer registro transformado:`, transformedData[0])
    console.log(`📊 Total registros transformados:`, transformedData.length)

    // Obtener solicitudes existentes
    const { data: existingSolicitudes, error: fetchError } = await supabase
      .from('solicitudes')
      .select('*')

    if (fetchError) throw fetchError

    // Crear mapas para comparación
    const existingMap = new Map((existingSolicitudes || []).map((solicitud: any) => [solicitud.id, solicitud]))
    const newIdSet = new Set(transformedData.map((solicitud: any) => solicitud.id))
    
    let inserted = 0, updated = 0, deleted = 0, errors = 0
    const errorDetails: any[] = []

    // Eliminar registros que ya no están en Sheets
    for (const existing of existingSolicitudes || []) {
      if (existing.id && !newIdSet.has(existing.id)) {
        const { error } = await supabase
          .from('solicitudes')
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
    for (const solicitud of transformedData) {
      const existing = existingMap.get(solicitud.id)
      
      if (existing) {
        // Actualizar si existe
        const updateData: any = {
          id_cliente: solicitud.id_cliente,
          titulo: solicitud.titulo,
          descripcion: solicitud.descripcion,
          materia: solicitud.materia,
          etapa_actual: solicitud.etapa_actual,
          modalidad_pago: solicitud.modalidad_pago,
          costo_neto: solicitud.costo_neto,
          se_cobra_iva: solicitud.se_cobra_iva,
          monto_iva: solicitud.monto_iva,
          cantidad_cuotas: solicitud.cantidad_cuotas,
          monto_por_cuota: solicitud.monto_por_cuota,
          total_a_pagar: solicitud.total_a_pagar,
          estado_pago: solicitud.estado_pago,
          monto_pagado: solicitud.monto_pagado,
          saldo_pendiente: solicitud.saldo_pendiente,
          expediente: solicitud.expediente,
          updated_at: new Date().toISOString()
        }
        
        const { error } = await supabase
          .from('solicitudes')
          .update(updateData)
          .eq('id', solicitud.id)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'update', id: solicitud.id, error: error.message })
        } else {
          updated++
        }
      } else {
        // Insertar si no existe
        const { error } = await supabase
          .from('solicitudes')
          .insert({
            ...solicitud,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        
        if (error) {
          errors++
          errorDetails.push({ action: 'insert', id: solicitud.id, error: error.message })
        } else {
          inserted++
        }
      }
    }

    console.log(`✅ Sincronización completada: ${inserted} insertados, ${updated} actualizados, ${deleted} eliminados, ${errors} errores`)
    
    return NextResponse.json({
      success: true,
      message: 'Sincronización de Solicitudes exitosa',
      stats: { inserted, updated, deleted, errors },
      details: errorDetails.length > 0 ? errorDetails : undefined
    })
  } catch (error) {
    console.error('❌ Error al sincronizar Solicitudes:', error)
    return NextResponse.json(
      { 
        error: 'Error al sincronizar Solicitudes',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sync-solicitudes',
    method: 'POST',
    description: 'Sincroniza la hoja "Solicitudes" de Google Sheets con la tabla solicitudes en Supabase',
    usage: 'POST /api/sync-solicitudes'
  })
}
