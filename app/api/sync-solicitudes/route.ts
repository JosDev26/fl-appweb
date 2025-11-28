import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'

export async function GET() {
  return syncSolicitudes()
}

export async function POST() {
  return syncSolicitudes()
}

async function syncSolicitudes() {
  try {
    console.log('📋 Iniciando sincronización de Solicitudes...')
    
    // Leer TODAS las columnas manualmente (A hasta S)
    const allColumnsData = await GoogleSheetsService.getSheetData('Solicitudes', 'A:S')
    
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

    // Índices de columnas según la nueva estructura:
    // A=0: ID_Solicitud
    // C=2: ID_Cliente (físico)
    // D=3: ID_Cliente (jurídico)
    // E=4: Titulo
    // F=5: Descripcion
    // G=6: Materia
    // H=7: Etapa_Actual
    // I=8: Modalidad_Pago
    // J=9: Costo_Neto
    // K=10: SeCobra_IVA
    // L=11: Monto_IVA
    // M=12: Cantidad_Cuotas
    // N=13: MontoxCuota
    // O=14: Total_a_Pagar
    // P=15: Estado_Pago
    // Q=16: Monto_Pagado
    // R=17: Saldo_Pendiente
    // S=18: Expediente

    const idSolicitudIndex = 0      // A: ID_Solicitud
    const idClienteFisicoIndex = 2  // C: ID_Cliente (físico)
    const idClienteJuridicoIndex = 3 // D: ID_Cliente (jurídico)
    const tituloIndex = 4           // E: Titulo
    const descripcionIndex = 5      // F: Descripcion
    const materiaIndex = 6          // G: Materia
    const etapaActualIndex = 7      // H: Etapa_Actual
    const modalidadPagoIndex = 8    // I: Modalidad_Pago
    const costoNetoIndex = 9        // J: Costo_Neto
    const seCobraIVAIndex = 10      // K: SeCobra_IVA
    const montoIVAIndex = 11        // L: Monto_IVA
    const cantidadCuotasIndex = 12  // M: Cantidad_Cuotas
    const montoPorCuotaIndex = 13   // N: MontoxCuota
    const totalAPagarIndex = 14     // O: Total_a_Pagar
    const estadoPagoIndex = 15      // P: Estado_Pago
    const montoPagadoIndex = 16     // Q: Monto_Pagado
    const saldoPendienteIndex = 17  // R: Saldo_Pendiente
    const expedienteIndex = 18      // S: Expediente

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
        // Tomar ID_Cliente de columna C (físico) o D (jurídico), la que tenga dato
        const idFisico = String(row[idClienteFisicoIndex] || '').trim()
        const idJuridico = String(row[idClienteJuridicoIndex] || '').trim()
        const idCliente = idFisico || idJuridico || null
        
        return {
          id: String(row[idSolicitudIndex]).trim(),
          id_cliente: idCliente,
          titulo: String(row[tituloIndex] || '').trim() || null,
          descripcion: String(row[descripcionIndex] || '').trim() || null,
          materia: String(row[materiaIndex] || '').trim() || null,
          etapa_actual: String(row[etapaActualIndex] || '').trim() || null,
          modalidad_pago: String(row[modalidadPagoIndex] || '').trim() || null,
          costo_neto: parseMontoToNumber(row[costoNetoIndex]),
          se_cobra_iva: parseBoolean(row[seCobraIVAIndex]),
          monto_iva: parseMontoToNumber(row[montoIVAIndex]),
          cantidad_cuotas: parseInt(String(row[cantidadCuotasIndex] || '')) || null,
          monto_por_cuota: parseMontoToNumber(row[montoPorCuotaIndex]),
          total_a_pagar: parseMontoToNumber(row[totalAPagarIndex]),
          estado_pago: String(row[estadoPagoIndex] || '').trim() || null,
          monto_pagado: parseMontoToNumber(row[montoPagadoIndex]),
          saldo_pendiente: parseMontoToNumber(row[saldoPendienteIndex]),
          expediente: String(row[expedienteIndex] || '').trim() || null
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
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { 
        success: false,
        message: `Error al sincronizar Solicitudes: ${errorMessage}`,
        error: errorMessage
      },
      { status: 500 }
    )
  }
}
