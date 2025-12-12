import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'

/**
 * GET - Obtener todos los comprobantes pendientes y usuarios con modoPago=true
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Obtener comprobantes
    const { data: receipts, error: receiptsError } = await supabase
      .from('payment_receipts' as any)
      .select('*')
      .order('uploaded_at', { ascending: false })

    console.log('Receipts query result:', { receipts, receiptsError })

    // 2. Obtener usuarios con modoPago = true
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuarios')
      .select('id, nombre, cedula, correo, modoPago')
      .eq('modoPago', true)

    console.log('Usuarios query result:', { count: usuarios?.length, usuariosError })

    // 3. Obtener empresas con modoPago = true  
    const { data: empresas, error: empresasError } = await supabase
      .from('empresas')
      .select('id, nombre, cedula, correo, modoPago')
      .eq('modoPago', true)

    console.log('Empresas query result:', { count: empresas?.length, empresasError })

    // 4. Combinar datos
    const clientesConModoPago = [
      ...((usuarios as any[]) || []).map(u => ({ ...u, tipo: 'cliente' as const })),
      ...((empresas as any[]) || []).map(e => ({ ...e, tipo: 'empresa' as const }))
    ]

    return NextResponse.json({
      success: true,
      data: {
        receipts: receipts || [],
        clientesConModoPago
      }
    })

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Error inesperado' },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Aprobar o rechazar un comprobante
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { receiptId, action, nota } = body

    if (!receiptId || !action) {
      return NextResponse.json(
        { error: 'receiptId y action son requeridos' },
        { status: 400 }
      )
    }

    if (!['aprobar', 'rechazar'].includes(action)) {
      return NextResponse.json(
        { error: 'action debe ser "aprobar" o "rechazar"' },
        { status: 400 }
      )
    }

    // 1. Obtener el comprobante
    const { data: receipt, error: fetchError } = await supabase
      .from('payment_receipts' as any)
      .select('*')
      .eq('id', receiptId)
      .single()

    if (fetchError || !receipt) {
      return NextResponse.json(
        { error: 'Comprobante no encontrado' },
        { status: 404 }
      )
    }

    const userId = (receipt as any).user_id
    const tipoCliente = (receipt as any).tipo_cliente
    const mesPago = (receipt as any).mes_pago // Mover aquí para uso en grupos

    if (action === 'aprobar') {
      // Aprobar: Actualizar estado y desactivar modoPago
      const fechaAprobacion = new Date().toISOString()
      const { error: updateReceiptError } = await supabase
        .from('payment_receipts' as any)
        .update({
          estado: 'aprobado',
          reviewed_at: fechaAprobacion,
          nota_revision: nota || null
        })
        .eq('id', receiptId)

      if (updateReceiptError) {
        console.error('Error updating receipt:', updateReceiptError)
        return NextResponse.json(
          { error: 'Error al actualizar comprobante' },
          { status: 500 }
        )
      }

      // Desactivar modoPago
      const tabla = tipoCliente === 'empresa' ? 'empresas' : 'usuarios'
      const { error: updateModoPagoError } = await supabase
        .from(tabla as any)
        .update({ modoPago: false } as any)
        .eq('id', userId)

      if (updateModoPagoError) {
        console.error('Error updating modo_pago:', updateModoPagoError)
        return NextResponse.json(
          { error: 'Error al desactivar modo pago' },
          { status: 500 }
        )
      }

      // Si es empresa, verificar si es empresa principal de un grupo
      // y desactivar modoPago de las empresas asociadas
      if (tipoCliente === 'empresa') {
        try {
          // Buscar si esta empresa es principal de algún grupo
          const { data: grupo, error: grupoError } = await supabase
            .from('grupos_empresas' as any)
            .select('id, nombre')
            .eq('empresa_principal_id', userId)
            .maybeSingle()

          if (!grupoError && grupo) {
            console.log('🏢 Empresa es principal del grupo:', (grupo as any).nombre)
            
            // Obtener las empresas miembros del grupo
            const { data: miembros, error: miembrosError } = await supabase
              .from('grupos_empresas_miembros' as any)
              .select('empresa_id')
              .eq('grupo_id', (grupo as any).id)

            if (!miembrosError && miembros && miembros.length > 0) {
              const empresaIds = (miembros as any[]).map((m: any) => m.empresa_id)
              console.log('🏢 Desactivando modoPago de empresas asociadas:', empresaIds)

              // Desactivar modoPago de todas las empresas asociadas
              const { error: updateGrupoError } = await supabase
                .from('empresas' as any)
                .update({ modoPago: false } as any)
                .in('id', empresaIds)

              if (updateGrupoError) {
                console.error('❌ Error al desactivar modoPago de empresas del grupo:', updateGrupoError)
              } else {
                console.log('✅ modoPago desactivado para', empresaIds.length, 'empresas del grupo')
              }

              // También actualizar las solicitudes mensualidades de las empresas del grupo
              for (const empresaId of empresaIds) {
                const { data: solicitudesEmpresa, error: solError } = await supabase
                  .from('solicitudes')
                  .select('*')
                  .eq('id_cliente', empresaId)
                  .ilike('modalidad_pago', 'mensualidad')

                if (!solError && solicitudesEmpresa && solicitudesEmpresa.length > 0) {
                  console.log(`📋 Actualizando ${solicitudesEmpresa.length} solicitudes de empresa ${empresaId}`)
                  for (const solicitud of solicitudesEmpresa) {
                    const montoCuota = solicitud.monto_por_cuota || 0
                    const pagoRealizado = montoCuota
                    const nuevoMontoPagado = (solicitud.monto_pagado || 0) + pagoRealizado
                    const costoNeto = solicitud.costo_neto || 0
                    let iva = 0
                    if (solicitud.se_cobra_iva) {
                      iva = solicitud.monto_iva || (costoNeto * 0.13)
                    }
                    const totalAPagar = costoNeto + iva
                    const nuevoSaldoPendiente = Math.max(0, totalAPagar - nuevoMontoPagado)

                    await supabase
                      .from('solicitudes')
                      .update({
                        monto_pagado: nuevoMontoPagado,
                        saldo_pendiente: nuevoSaldoPendiente,
                        updated_at: fechaAprobacion
                      })
                      .eq('id', solicitud.id)
                  }
                }
              }

              // Marcar facturas de empresas del grupo como pagadas
              if (mesPago) {
                for (const empresaId of empresaIds) {
                  const { error: facturaError } = await supabase
                    .from('invoice_payment_deadlines' as any)
                    .update({
                      estado_pago: 'pagado',
                      fecha_pago: fechaAprobacion
                    })
                    .eq('mes_factura', mesPago)
                    .eq('client_id', empresaId)
                    .eq('client_type', 'empresa')

                  if (!facturaError) {
                    console.log(`✅ Factura de empresa ${empresaId} marcada como pagada`)
                  }
                }
              }
            }
          }
        } catch (grupoErr) {
          console.error('❌ Error al procesar grupo de empresas:', grupoErr)
        }
      }

      // Actualizar solicitudes con modalidad mensual
      // IMPORTANTE: Los gastos NO se incluyen en monto_pagado
      console.log('💰 Actualizando solicitudes mensualidades del cliente:', userId)
      try {
        const { data: solicitudesMensuales, error: solicitudesError } = await supabase
          .from('solicitudes')
          .select('*')
          .eq('id_cliente', userId)
          .ilike('modalidad_pago', 'mensualidad')

        if (solicitudesError) {
          console.error('❌ Error al obtener solicitudes:', solicitudesError)
        } else if (solicitudesMensuales && solicitudesMensuales.length > 0) {
          console.log(`📋 Encontradas ${solicitudesMensuales.length} solicitudes mensualidades`)
          
          for (const solicitud of solicitudesMensuales) {
            // Calcular pago realizado SOLO de la cuota (SIN gastos)
            const montoCuota = solicitud.monto_por_cuota || 0
            
            // El pago realizado es solo el monto de la cuota
            // Los gastos se pagan aparte y NO se suman a monto_pagado
            const pagoRealizado = montoCuota
            const nuevoMontoPagado = (solicitud.monto_pagado || 0) + pagoRealizado
            
            // El total_a_pagar debe ser costo_neto + IVA (sin gastos)
            const costoNeto = solicitud.costo_neto || 0
            let iva = 0
            if (solicitud.se_cobra_iva) {
              iva = solicitud.monto_iva || (costoNeto * 0.13)
            }
            const totalAPagar = costoNeto + iva
            const nuevoSaldoPendiente = Math.max(0, totalAPagar - nuevoMontoPagado)
            
            // Actualizar la solicitud
            const { error: updateError } = await supabase
              .from('solicitudes')
              .update({
                monto_pagado: nuevoMontoPagado,
                saldo_pendiente: nuevoSaldoPendiente,
                updated_at: fechaAprobacion
              })
              .eq('id', solicitud.id)
            
            if (updateError) {
              console.error(`❌ Error al actualizar solicitud ${solicitud.id}:`, updateError)
            } else {
              console.log(`✅ Solicitud ${solicitud.id} actualizada:`, {
                titulo: solicitud.titulo,
                montoCuota,
                pagoRealizado,
                nuevoMontoPagado,
                totalAPagar,
                nuevoSaldoPendiente,
                nota: 'Gastos NO incluidos en monto_pagado'
              })
            }
          }
        } else {
          console.log('ℹ️ No se encontraron solicitudes mensualidades para actualizar')
        }
      } catch (err) {
        console.error('❌ Error al actualizar solicitudes:', err)
      }

      // Marcar gastos del mes como pagados
      if (mesPago) {
        try {
          // Parsear mes_pago (formato: "YYYY-MM")
          const [year, month] = mesPago.split('-')
          const startDate = `${year}-${month}-01`
          const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0] // Último día del mes
          
          console.log(`💰 Marcando gastos del mes ${mesPago} como pagados para cliente ${userId}...`)
          
          // Marcar gastos del mes como pagados
          const { error: gastosError } = await supabase
            .from('gastos' as any)
            .update({ 
              estado_pago: 'pagado',
              updated_at: fechaAprobacion
            })
            .eq('id_cliente', userId)
            .gte('fecha', startDate)
            .lte('fecha', endDate)
          
          if (gastosError) {
            console.error('❌ Error al marcar gastos como pagados:', gastosError)
          } else {
            console.log(`✅ Gastos del mes ${mesPago} marcados como pagados`)
          }
        } catch (err) {
          console.error('❌ Error al procesar gastos:', err)
        }
      }

      // Marcar factura como pagada directamente en la base de datos
      console.log('🔍 Intentando actualizar factura con mes_pago:', mesPago, 'userId:', userId, 'tipoCliente:', tipoCliente)
      
      if (mesPago) {
        try {
          // Primero verificar si existe el registro
          const { data: existingDeadline, error: checkError } = await supabase
            .from('invoice_payment_deadlines' as any)
            .select('*')
            .eq('mes_factura', mesPago)
            .eq('client_id', userId)
            .eq('client_type', tipoCliente)
            .single()

          console.log('🔍 Búsqueda de factura existente:', { 
            encontrada: !!existingDeadline, 
            error: checkError?.message,
            datos: existingDeadline 
          })

          if (existingDeadline) {
            const { error: invoiceError } = await supabase
              .from('invoice_payment_deadlines' as any)
              .update({
                estado_pago: 'pagado',
                fecha_pago: fechaAprobacion
              })
              .eq('mes_factura', mesPago)
              .eq('client_id', userId)
              .eq('client_type', tipoCliente)

            if (invoiceError) {
              console.error('❌ Error al actualizar estado de factura:', invoiceError)
            } else {
              console.log('✅ Estado de factura actualizado a pagado:', { mesPago, userId, tipoCliente })
            }
          } else {
            console.warn('⚠️ No se encontró factura para actualizar. Posibles causas:', {
              mesPago,
              userId,
              tipoCliente,
              checkError: checkError?.message
            })
          }
        } catch (err) {
          console.error('❌ Error al actualizar estado de factura:', err)
        }
      } else {
        console.warn('⚠️ El comprobante no tiene mes_pago asociado')
      }

      // ===== ESCRIBIR EN HOJA "Ingresos" DE GOOGLE SHEETS =====
      try {
        console.log('📝 Preparando registro de ingreso para Google Sheets...')
        
        // Obtener datos del cliente
        const tablaCliente = tipoCliente === 'empresa' ? 'empresas' : 'usuarios'
        const { data: clienteData } = await supabase
          .from(tablaCliente as any)
          .select('nombre, esDolar')
          .eq('id', userId)
          .single()
        
        // Obtener solicitudes del cliente para calcular honorarios
        const { data: solicitudes } = await supabase
          .from('solicitudes')
          .select('modalidad_pago, monto_por_cuota, costo_neto')
          .eq('id_cliente', userId)
        
        // Calcular honorarios (suma de cuotas o costos según modalidad)
        let honorarios = 0
        let modalidadPago = 'Mensualidad' // default
        
        if (solicitudes && solicitudes.length > 0) {
          for (const sol of solicitudes) {
            if (sol.modalidad_pago?.toLowerCase().includes('mensualidad')) {
              honorarios += sol.monto_por_cuota || 0
              modalidadPago = 'Mensualidad'
            } else if (sol.modalidad_pago?.toLowerCase().includes('hora')) {
              modalidadPago = 'Cobro por hora'
            } else if (sol.modalidad_pago?.toLowerCase().includes('etapa')) {
              modalidadPago = 'Etapa finalizada'
            }
          }
        }
        
        // Si no hay honorarios de solicitudes, usar el monto declarado
        if (honorarios === 0) {
          honorarios = (receipt as any).monto_declarado || 0
        }
        
        // Obtener gastos pendientes del mes anterior
        const { data: gastosPendientes } = await supabase
          .from('gastos')
          .select('monto')
          .eq('id_cliente', userId)
          .eq('pagado', false)
        
        let reembolsoGastos = 0
        if (gastosPendientes) {
          reembolsoGastos = gastosPendientes.reduce((sum: number, g: any) => sum + (parseFloat(g.monto) || 0), 0)
        }
        
        // Moneda del cliente
        const moneda = (clienteData as any)?.esDolar ? 'Dólares' : 'Colones'
        
        // Servicios (por ahora 0, se implementará después)
        const servicios = 0
        
        // Total del ingreso
        const totalIngreso = honorarios + servicios + reembolsoGastos
        
        // Generar ID único para el ingreso
        const ingresoId = `ING-${Date.now()}-${userId.slice(-4)}`
        
        // Formatear fechas
        const fechaPago = new Date((receipt as any).uploaded_at).toLocaleDateString('es-CR')
        const fechaAprobacionFormateada = new Date(fechaAprobacion).toLocaleDateString('es-CR')
        
        // Preparar fila para Sheets
        // Columnas: A=ID_Ingreso, B=Fecha_Pago, C=Fecha_Aprobacion, D=Cliente, E=Modalidad_Pago, F=Moneda, G=Honorarios, H=Servicios, I=Reembolso_Gastos, J=Total_Ingreso
        const rowData = [
          ingresoId,                    // A: ID_Ingreso
          fechaPago,                    // B: Fecha_Pago
          fechaAprobacionFormateada,    // C: Fecha_Aprobacion
          userId,                       // D: Cliente (ID)
          modalidadPago,                // E: Modalidad_Pago
          moneda,                       // F: Moneda
          honorarios,                   // G: Honorarios
          servicios,                    // H: Servicios
          reembolsoGastos,              // I: Reembolso_Gastos
          totalIngreso                  // J: Total_Ingreso
        ]
        
        console.log('📊 Datos del ingreso:', {
          id: ingresoId,
          cliente: userId,
          moneda,
          honorarios,
          gastos: reembolsoGastos,
          total: totalIngreso
        })
        
        // Escribir en Google Sheets
        await GoogleSheetsService.appendRow('Ingresos', rowData)
        console.log('✅ Ingreso registrado en Google Sheets')
        
        // También guardar en Supabase para consultas rápidas
        await (supabase as any)
          .from('ingresos')
          .upsert({
            id: ingresoId,
            fecha_pago: (receipt as any).uploaded_at,
            fecha_aprobacion: fechaAprobacion,
            id_cliente: userId,
            tipo_cliente: tipoCliente,
            modalidad_pago: modalidadPago,
            moneda: moneda.toLowerCase(),
            honorarios,
            servicios,
            reembolso_gastos: reembolsoGastos,
            total_ingreso: totalIngreso
          }, { onConflict: 'id' })
        
        console.log('✅ Ingreso guardado en Supabase')
        
      } catch (ingresosError) {
        // No fallar la aprobación si falla el registro de ingresos
        console.error('❌ Error registrando ingreso (no crítico):', ingresosError)
      }

      return NextResponse.json({
        success: true,
        message: 'Comprobante aprobado y modo pago desactivado'
      })

    } else {
      // Rechazar: Actualizar estado con nota
      if (!nota) {
        return NextResponse.json(
          { error: 'La nota de rechazo es requerida' },
          { status: 400 }
        )
      }

      console.log('Rechazando comprobante:', { receiptId, nota })

      const { error: updateReceiptError } = await supabase
        .from('payment_receipts' as any)
        .update({
          estado: 'rechazado',
          reviewed_at: new Date().toISOString(),
          nota_revision: nota
        })
        .eq('id', receiptId)

      if (updateReceiptError) {
        console.error('Error updating receipt:', updateReceiptError)
        return NextResponse.json(
          { error: 'Error al actualizar comprobante' },
          { status: 500 }
        )
      }

      console.log('Comprobante rechazado exitosamente:', receiptId)

      return NextResponse.json({
        success: true,
        message: 'Comprobante rechazado'
      })
    }

  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Error inesperado' },
      { status: 500 }
    )
  }
}
