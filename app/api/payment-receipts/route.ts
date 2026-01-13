import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'
import { checkStandardRateLimit } from '@/lib/rate-limit'
import { isValidUUID, isValidSessionToken, parseCookies, verifyDevAdminSession, generateUniqueId } from '@/lib/auth-utils'

// === Security Utilities ===
const isDev = process.env.NODE_ENV === 'development'

// Validar formato mes_pago (YYYY-MM)
function isValidMesPago(mes: string | null | undefined): boolean {
  if (!mes) return false
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes)
}

// Sanitize string para prevenir XSS/SQL injection en notas
function sanitizeNota(nota: string | null | undefined): string | null {
  if (!nota) return null
  // Remove potentially dangerous characters while keeping normal text
  return nota
    .replace(/<[^>]*>/g, '') // Strip HTML tags
    .replace(/[<>'"&]/g, '') // Remove special chars
    .substring(0, 500) // Limit length
    .trim()
}

/**
 * GET - Obtener todos los comprobantes pendientes y usuarios con modoPago=true
 * Protected: Requires dev admin authentication
 */
export async function GET(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  // Verify dev admin authentication
  const authResult = await verifyDevAdminSession(request)
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    )
  }

  try {
    // 1. Obtener comprobantes
    const { data: receipts, error: receiptsError } = await supabase
      .from('payment_receipts' as any)
      .select('*')
      .order('uploaded_at', { ascending: false })

    if (isDev) console.log('Receipts query result:', { count: receipts?.length, error: receiptsError?.message })

    // 2. Obtener usuarios con modoPago = true
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuarios')
      .select('id, nombre, cedula, correo, modoPago')
      .eq('modoPago', true)

    if (isDev) console.log('Usuarios query result:', { count: usuarios?.length, error: usuariosError?.message })

    // 3. Obtener empresas con modoPago = true  
    const { data: empresas, error: empresasError } = await supabase
      .from('empresas')
      .select('id, nombre, cedula, correo, modoPago')
      .eq('modoPago', true)

    if (isDev) console.log('Empresas query result:', { count: empresas?.length, error: empresasError?.message })

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
    if (isDev) console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Error inesperado' },
      { status: 500 }
    )
  }
}

/**
 * PATCH - Aprobar o rechazar un comprobante
 * Protected: Requires dev admin authentication
 */
export async function PATCH(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  // Verify dev admin authentication
  const authResult = await verifyDevAdminSession(request)
  if (!authResult.valid) {
    return NextResponse.json(
      { error: 'No autorizado' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { receiptId, action, nota } = body

    // Validate receiptId is a valid UUID
    if (!receiptId || !isValidUUID(receiptId)) {
      return NextResponse.json(
        { error: 'receiptId inválido' },
        { status: 400 }
      )
    }

    if (!action) {
      return NextResponse.json(
        { error: 'action es requerido' },
        { status: 400 }
      )
    }

    if (!['aprobar', 'rechazar'].includes(action)) {
      return NextResponse.json(
        { error: 'action debe ser "aprobar" o "rechazar"' },
        { status: 400 }
      )
    }

    // Sanitize nota to prevent XSS
    const sanitizedNota = sanitizeNota(nota)

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

    // Validate mesPago format if present
    if (mesPago && !isValidMesPago(mesPago)) {
      if (isDev) console.warn('Invalid mesPago format:', mesPago)
      return NextResponse.json(
        { error: 'Formato de mes de pago inválido' },
        { status: 400 }
      )
    }

    if (action === 'aprobar') {
      // Aprobar: Usar RPC atómico para actualizar estado y desactivar modoPago
      const { data: rpcResult, error: rpcError } = await (supabase as any)
        .rpc('approve_payment_receipt', {
          p_receipt_id: receiptId,
          p_user_id: userId,
          p_tipo_cliente: tipoCliente,
          p_nota: sanitizedNota
        })

      if (rpcError) {
        if (isDev) console.error('Error in approve_payment_receipt RPC:', rpcError)
        return NextResponse.json(
          { error: 'Error al aprobar comprobante' },
          { status: 500 }
        )
      }

      // Check RPC result
      const result = rpcResult as { success: boolean; error?: string; message?: string; fecha_aprobacion?: string }
      if (!result.success) {
        if (isDev) console.error('RPC returned error:', result.error, result.message)
        
        // Map RPC errors to appropriate responses
        if (result.error === 'receipt_not_found') {
          return NextResponse.json(
            { error: 'Comprobante no encontrado' },
            { status: 404 }
          )
        }
        if (result.error?.includes('client_not_found')) {
          return NextResponse.json(
            { error: 'Cliente no encontrado' },
            { status: 404 }
          )
        }
        return NextResponse.json(
          { error: result.message || 'Error al aprobar comprobante' },
          { status: 500 }
        )
      }

      const fechaAprobacion = result.fecha_aprobacion || new Date().toISOString()

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
            if (isDev) console.log('🏢 Empresa es principal del grupo:', (grupo as any).nombre)
            
            // Obtener las empresas miembros del grupo
            const { data: miembros, error: miembrosError } = await supabase
              .from('grupos_empresas_miembros' as any)
              .select('empresa_id')
              .eq('grupo_id', (grupo as any).id)

            if (!miembrosError && miembros && miembros.length > 0) {
              const empresaIds = (miembros as any[]).map((m: any) => m.empresa_id)
              if (isDev) console.log('🏢 Desactivando modoPago de empresas asociadas:', empresaIds.length)

              // BATCH: Desactivar modoPago de todas las empresas asociadas (single query)
              const { error: updateGrupoError } = await supabase
                .from('empresas' as any)
                .update({ modoPago: false } as any)
                .in('id', empresaIds)

              if (updateGrupoError) {
                if (isDev) console.error('❌ Error al desactivar modoPago de empresas del grupo:', updateGrupoError)
              } else {
                if (isDev) console.log('✅ modoPago desactivado para', empresaIds.length, 'empresas del grupo')
              }

              // BATCH: Get ALL solicitudes for all empresas in one query
              const { data: todasSolicitudes, error: solError } = await supabase
                .from('solicitudes')
                .select('*')
                .in('id_cliente', empresaIds)
                .ilike('modalidad_pago', 'mensualidad')

              if (!solError && todasSolicitudes && todasSolicitudes.length > 0) {
                if (isDev) console.log(`📋 Actualizando ${todasSolicitudes.length} solicitudes de empresas del grupo`)
                
                // Process each solicitud and batch updates
                const updates = todasSolicitudes.map(solicitud => {
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
                  
                  return {
                    id: solicitud.id,
                    monto_pagado: nuevoMontoPagado,
                    saldo_pendiente: nuevoSaldoPendiente,
                    updated_at: fechaAprobacion
                  }
                })

                // Execute updates in parallel batches with error tracking
                const grupoResults = await Promise.allSettled(
                  updates.map(update => 
                    supabase
                      .from('solicitudes')
                      .update({
                        monto_pagado: update.monto_pagado,
                        saldo_pendiente: update.saldo_pendiente,
                        updated_at: update.updated_at
                      })
                      .eq('id', update.id)
                      .then(result => ({ updateId: update.id, ...result }))
                  )
                )
                
                // Track failures for logging
                const failedGrupoUpdates = grupoResults
                  .map((result, index) => ({ result, updateId: updates[index].id }))
                  .filter(({ result }) => 
                    result.status === 'rejected' || 
                    (result.status === 'fulfilled' && result.value?.error)
                  )
                  .map(({ updateId }) => updateId)
                
                if (failedGrupoUpdates.length > 0) {
                  if (isDev) console.error(`❌ ${failedGrupoUpdates.length} solicitudes de grupo fallaron:`, failedGrupoUpdates)
                } else if (isDev) {
                  console.log(`✅ ${updates.length} solicitudes de grupo actualizadas`)
                }
              }

              // BATCH: Marcar facturas, gastos y servicios de empresas del grupo
              if (mesPago) {
                const [yearStr, monthStr] = mesPago.split('-')
                const yearNum = parseInt(yearStr, 10)
                const monthNum = parseInt(monthStr, 10)
                const startDate = `${yearStr}-${monthStr}-01`
                // Calculate last day of month: monthNum gives us the next month's index (0-based), day 0 gives last day of previous month
                const endDate = new Date(yearNum, monthNum, 0).toISOString().split('T')[0]
                
                // BATCH: Update all facturas in one query using IN clause
                const { error: facturasError } = await supabase
                  .from('invoice_payment_deadlines' as any)
                  .update({
                    estado_pago: 'pagado',
                    fecha_pago: fechaAprobacion
                  })
                  .eq('mes_factura', mesPago)
                  .in('client_id', empresaIds)
                  .eq('client_type', 'empresa')

                if (facturasError) {
                  if (isDev) console.error(`❌ Error actualizando facturas para empresas [${empresaIds.join(', ')}]:`, facturasError)
                } else if (isDev) {
                  console.log(`✅ Facturas de ${empresaIds.length} empresas marcadas como pagadas`)
                }

                // BATCH: Update all gastos in one query using IN clause
                const { error: gastosError } = await supabase
                  .from('gastos' as any)
                  .update({ 
                    estado_pago: 'pagado',
                    updated_at: fechaAprobacion
                  })
                  .in('id_cliente', empresaIds)
                  .gte('fecha', startDate)
                  .lte('fecha', endDate)

                if (gastosError) {
                  if (isDev) console.error(`❌ Error actualizando gastos para empresas [${empresaIds.join(', ')}]:`, gastosError)
                } else if (isDev) {
                  console.log(`✅ Gastos de ${empresaIds.length} empresas marcados como pagados`)
                }

                // BATCH: Update all servicios in one query using IN clause
                const { error: serviciosError } = await supabase
                  .from('servicios_profesionales' as any)
                  .update({ 
                    estado_pago: 'pagado',
                    updated_at: fechaAprobacion
                  })
                  .in('id_cliente', empresaIds)
                  .neq('estado_pago', 'cancelado')
                  .gte('fecha', startDate)
                  .lte('fecha', endDate)

                if (serviciosError) {
                  if (isDev) console.error(`❌ Error actualizando servicios para empresas [${empresaIds.join(', ')}]:`, serviciosError)
                } else if (isDev) {
                  console.log(`✅ Servicios de ${empresaIds.length} empresas marcados como pagados`)
                }
              }
            }
          }
        } catch (grupoErr) {
          if (isDev) console.error('❌ Error al procesar grupo de empresas:', grupoErr)
        }
      }

      // Actualizar solicitudes con modalidad mensual
      // IMPORTANTE: Los gastos NO se incluyen en monto_pagado
      if (isDev) console.log('💰 Actualizando solicitudes mensualidades del cliente:', userId)
      try {
        const { data: solicitudesMensuales, error: solicitudesError } = await supabase
          .from('solicitudes')
          .select('*')
          .eq('id_cliente', userId)
          .ilike('modalidad_pago', 'mensualidad')

        if (solicitudesError) {
          if (isDev) console.error('❌ Error al obtener solicitudes:', solicitudesError)
        } else if (solicitudesMensuales && solicitudesMensuales.length > 0) {
          if (isDev) console.log(`📋 Encontradas ${solicitudesMensuales.length} solicitudes mensualidades`)
          
          // Calculate all updates first
          const solicitudUpdates = solicitudesMensuales.map(solicitud => {
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
            
            return {
              id: solicitud.id,
              monto_pagado: nuevoMontoPagado,
              saldo_pendiente: nuevoSaldoPendiente,
              updated_at: fechaAprobacion
            }
          })

          // Execute all updates in parallel
          const results = await Promise.allSettled(
            solicitudUpdates.map(update =>
              supabase
                .from('solicitudes')
                .update({
                  monto_pagado: update.monto_pagado,
                  saldo_pendiente: update.saldo_pendiente,
                  updated_at: update.updated_at
                })
                .eq('id', update.id)
            )
          )
          
          const failures = results.filter(r => r.status === 'rejected').length
          if (failures > 0 && isDev) {
            console.error(`❌ ${failures} solicitudes fallaron al actualizar`)
          } else if (isDev) {
            console.log(`✅ ${solicitudUpdates.length} solicitudes actualizadas`)
          }
        } else {
          if (isDev) console.log('ℹ️ No se encontraron solicitudes mensualidades para actualizar')
        }
      } catch (err) {
        if (isDev) console.error('❌ Error al actualizar solicitudes:', err)
      }

      // Marcar gastos del mes como pagados
      if (mesPago) {
        try {
          // Parsear mes_pago (formato: "YYYY-MM")
          const [year, month] = mesPago.split('-')
          const startDate = `${year}-${month}-01`
          const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0] // Último día del mes
          
          if (isDev) console.log(`💰 Marcando gastos del mes ${mesPago} como pagados para cliente ${userId}...`)
          
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
            if (isDev) console.error('❌ Error al marcar gastos como pagados:', gastosError)
          } else {
            if (isDev) console.log(`✅ Gastos del mes ${mesPago} marcados como pagados`)
          }
          
          // Marcar servicios profesionales del mes como pagados
          if (isDev) console.log(`💰 Marcando servicios profesionales del mes ${mesPago} como pagados para cliente ${userId}...`)
          
          const { error: serviciosError } = await supabase
            .from('servicios_profesionales' as any)
            .update({ 
              estado_pago: 'pagado',
              updated_at: fechaAprobacion
            })
            .eq('id_cliente', userId)
            .neq('estado_pago', 'cancelado') // No cambiar los cancelados
            .gte('fecha', startDate)
            .lte('fecha', endDate)
          
          if (serviciosError) {
            if (isDev) console.error('❌ Error al marcar servicios como pagados:', serviciosError)
          } else {
            if (isDev) console.log(`✅ Servicios profesionales del mes ${mesPago} marcados como pagados`)
          }
        } catch (err) {
          if (isDev) console.error('❌ Error al procesar gastos:', err)
        }
      }

      // Marcar factura como pagada directamente en la base de datos
      if (isDev) console.log('🔍 Intentando actualizar factura con mes_pago:', mesPago)
      
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

          if (isDev) console.log('🔍 Búsqueda de factura existente:', { 
            encontrada: !!existingDeadline, 
            error: checkError?.message
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
              if (isDev) console.error('❌ Error al actualizar estado de factura:', invoiceError)
            } else {
              if (isDev) console.log('✅ Estado de factura actualizado a pagado')
            }
          } else {
            if (isDev) console.warn('⚠️ No se encontró factura para actualizar')
          }
        } catch (err) {
          if (isDev) console.error('❌ Error al actualizar estado de factura:', err)
        }
      } else {
        if (isDev) console.warn('⚠️ El comprobante no tiene mes_pago asociado')
      }

      // ===== ESCRIBIR EN HOJA "Ingresos" DE GOOGLE SHEETS =====
      try {
        if (isDev) console.log('📝 Preparando registro de ingreso para Google Sheets...')
        
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
        
        // Generar ID único para el ingreso (collision-resistant)
        const ingresoId = generateUniqueId('ING', userId.slice(-4))
        
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
        
        if (isDev) console.log('📊 Datos del ingreso:', { id: ingresoId, total: totalIngreso })
        
        // Escribir en Google Sheets
        await GoogleSheetsService.appendRow('Ingresos', rowData)
        if (isDev) console.log('✅ Ingreso registrado en Google Sheets')
        
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
        
        if (isDev) console.log('✅ Ingreso guardado en Supabase')
        
      } catch (ingresosError) {
        // No fallar la aprobación si falla el registro de ingresos
        if (isDev) console.error('❌ Error registrando ingreso (no crítico):', ingresosError)
      }

      return NextResponse.json({
        success: true,
        message: 'Comprobante aprobado y modo pago desactivado'
      })

    } else {
      // Rechazar: Actualizar estado con nota
      if (!sanitizedNota) {
        return NextResponse.json(
          { error: 'La nota de rechazo es requerida' },
          { status: 400 }
        )
      }

      if (isDev) console.log('Rechazando comprobante:', receiptId)

      const { error: updateReceiptError } = await supabase
        .from('payment_receipts' as any)
        .update({
          estado: 'rechazado',
          reviewed_at: new Date().toISOString(),
          nota_revision: sanitizedNota
        })
        .eq('id', receiptId)

      if (updateReceiptError) {
        if (isDev) console.error('Error updating receipt:', updateReceiptError)
        return NextResponse.json(
          { error: 'Error al actualizar comprobante' },
          { status: 500 }
        )
      }

      if (isDev) console.log('Comprobante rechazado exitosamente:', receiptId)

      return NextResponse.json({
        success: true,
        message: 'Comprobante rechazado'
      })
    }

  } catch (error) {
    if (isDev) console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
