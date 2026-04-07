import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentDateCR, getMesAnterior, getRangoMes } from "@/lib/dateUtils";
import { checkStandardRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Parsea duración en formato "HH:MM" o decimal a minutos
 */
function parseDuracionMinutos(duracion: string): number {
  if (!duracion) return 0;
  if (duracion.includes(':')) {
    const [h, m] = duracion.split(':').map(Number);
    return (h * 60) + m;
  }
  return Math.round(parseFloat(duracion) * 60);
}

/**
 * GET /api/meses-pendientes
 * 
 * Retorna todos los meses con items pendientes para un cliente (últimos 12 meses).
 * Cada mes incluye desglose de montos, estado de factura y comprobante.
 */
export async function GET(request: NextRequest) {
  const rateLimitResponse = await checkStandardRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const userId = request.headers.get('x-user-id');
    const tipoCliente = request.headers.get('x-tipo-cliente');

    if (!userId || !tipoCliente) {
      return NextResponse.json({ error: "Usuario no autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let validatedSimulatedDate: string | null = null;
    if (isDev) {
      const rawSimulatedDate = searchParams.get('simulatedDate')?.trim();
      if (rawSimulatedDate && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/.test(rawSimulatedDate)) {
        const parsed = Date.parse(rawSimulatedDate);
        if (!isNaN(parsed)) validatedSimulatedDate = rawSimulatedDate;
      }
    }

    const now = await getCurrentDateCR(validatedSimulatedDate);
    const { year, month } = getMesAnterior(now);

    // Rango: desde 12 meses antes del mes de reporte, hasta fin del mes de reporte
    const fechaLimite12Meses = new Date(year, month - 12, 1).toISOString().split('T')[0];
    const { finMes: finMesReporte } = getRangoMes(year, month);

    // Obtener tarifa e IVA del cliente
    let tarifaHora = 90000;
    let ivaPerc = 0.13;
    let nombreCliente = '';

    if (tipoCliente === 'empresa') {
      const { data: empresa } = await supabase
        .from('empresas')
        .select('nombre, tarifa_hora, iva_perc')
        .eq('id', userId)
        .maybeSingle();
      if (empresa) {
        nombreCliente = (empresa as any).nombre || '';
        tarifaHora = (empresa as any).tarifa_hora || 90000;
        ivaPerc = (empresa as any).iva_perc ?? 0.13;
      }
    } else {
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('nombre, iva_perc')
        .eq('id', userId)
        .maybeSingle();
      if (usuario) {
        nombreCliente = (usuario as any).nombre || '';
        ivaPerc = (usuario as any).iva_perc ?? 0.13;
      }
    }

    // ===== Obtener TODOS los items pendientes del cliente en los últimos 12 meses =====
    
    // Trabajos por hora
    let tphItems: any[] = [];
    if (tipoCliente === 'usuario') {
      const { data } = await supabase
        .from('trabajos_por_hora')
        .select('fecha, duracion, estado_pago')
        .eq('id_cliente', userId)
        .gte('fecha', fechaLimite12Meses)
        .lte('fecha', finMesReporte);
      tphItems = data || [];
    } else {
      const { data: casos } = await supabase
        .from('casos')
        .select('id')
        .eq('id_cliente', userId);
      if (casos && casos.length > 0) {
        const casoIds = casos.map(c => c.id);
        const { data } = await supabase
          .from('trabajos_por_hora')
          .select('fecha, duracion, estado_pago')
          .in('caso_asignado', casoIds)
          .gte('fecha', fechaLimite12Meses)
          .lte('fecha', finMesReporte);
        tphItems = data || [];
      }
    }

    // Gastos (no cancelados)
    const { data: gastosItems } = await supabase
      .from('gastos' as any)
      .select('fecha, total_cobro, estado_pago')
      .eq('id_cliente', userId)
      .neq('estado_pago', 'cancelado')
      .gte('fecha', fechaLimite12Meses)
      .lte('fecha', finMesReporte);

    // Servicios profesionales (no cancelados)
    const { data: spItems } = await supabase
      .from('servicios_profesionales' as any)
      .select('fecha, costo, gastos, iva, total, estado_pago')
      .eq('id_cliente', userId)
      .neq('estado_pago', 'cancelado')
      .gte('fecha', fechaLimite12Meses)
      .lte('fecha', finMesReporte);

    // Solicitudes mensuales (no dependen de mes, son recurrentes)
    const { data: solicitudes } = await supabase
      .from('solicitudes')
      .select('monto_por_cuota, se_cobra_iva, saldo_pendiente, estado_pago')
      .eq('id_cliente', userId)
      .ilike('modalidad_pago', 'mensualidad');

    // ===== Agrupar items por mes =====
    const mesesMap = new Map<string, {
      tphMinutos: number;
      tphCantidad: number;
      gastosMonto: number;
      gastosCantidad: number;
      spMonto: number;
      spCantidad: number;
      tieneItemsPendientes: boolean;
    }>();

    // Helper: obtener mes YYYY-MM de una fecha
    const getMesFromFecha = (fecha: string): string => fecha.substring(0, 7);

    // Agrupar TPH - incluir items del mes actual tanto pendientes como nuevos (sin estado_pago)
    for (const item of tphItems) {
      const mes = getMesFromFecha(item.fecha);
      const mesMostrar = `${year}-${String(month).padStart(2, '0')}`;
      // Items del mes de reporte: incluir todos (son del mes actual)
      // Items de meses anteriores: solo pendientes
      if (mes === mesMostrar || item.estado_pago === 'pendiente' || !item.estado_pago) {
        if (!mesesMap.has(mes)) {
          mesesMap.set(mes, { tphMinutos: 0, tphCantidad: 0, gastosMonto: 0, gastosCantidad: 0, spMonto: 0, spCantidad: 0, tieneItemsPendientes: true });
        }
        const entry = mesesMap.get(mes)!;
        entry.tphMinutos += parseDuracionMinutos(item.duracion);
        entry.tphCantidad++;
      }
    }

    // Agrupar gastos
    for (const item of (gastosItems || []) as any[]) {
      const mes = getMesFromFecha(item.fecha);
      const mesMostrar = `${year}-${String(month).padStart(2, '0')}`;
      if (mes === mesMostrar || item.estado_pago === 'pendiente') {
        if (!mesesMap.has(mes)) {
          mesesMap.set(mes, { tphMinutos: 0, tphCantidad: 0, gastosMonto: 0, gastosCantidad: 0, spMonto: 0, spCantidad: 0, tieneItemsPendientes: true });
        }
        const entry = mesesMap.get(mes)!;
        entry.gastosMonto += item.total_cobro || 0;
        entry.gastosCantidad++;
      }
    }

    // Agrupar servicios profesionales
    for (const item of (spItems || []) as any[]) {
      const mes = getMesFromFecha(item.fecha);
      const mesMostrar = `${year}-${String(month).padStart(2, '0')}`;
      if (mes === mesMostrar || item.estado_pago === 'pendiente') {
        if (!mesesMap.has(mes)) {
          mesesMap.set(mes, { tphMinutos: 0, tphCantidad: 0, gastosMonto: 0, gastosCantidad: 0, spMonto: 0, spCantidad: 0, tieneItemsPendientes: true });
        }
        const entry = mesesMap.get(mes)!;
        entry.spMonto += item.total || 0;
        entry.spCantidad++;
      }
    }

    // Calcular mensualidades (aplican al mes de reporte)
    let totalMensualidades = 0;
    let totalIVAMensualidades = 0;
    (solicitudes || []).forEach((s: any) => {
      if (s.saldo_pendiente <= 0) return; // Skip fully paid
      const montoCuota = s.monto_por_cuota || 0;
      if (s.se_cobra_iva) {
        const subtotalCuota = montoCuota / (1 + ivaPerc);
        totalMensualidades += subtotalCuota;
        totalIVAMensualidades += montoCuota - subtotalCuota;
      } else {
        totalMensualidades += montoCuota;
      }
    });

    // Agregar mensualidades al mes de reporte si hay
    const mesReporte = `${year}-${String(month).padStart(2, '0')}`;
    if (totalMensualidades > 0) {
      if (!mesesMap.has(mesReporte)) {
        mesesMap.set(mesReporte, { tphMinutos: 0, tphCantidad: 0, gastosMonto: 0, gastosCantidad: 0, spMonto: 0, spCantidad: 0, tieneItemsPendientes: true });
      }
    }

    // ===== Obtener facturas y comprobantes existentes =====
    const mesesArray = Array.from(mesesMap.keys());

    // Facturas (invoice_payment_deadlines)
    const { data: facturas } = await supabase
      .from('invoice_payment_deadlines' as any)
      .select('mes_factura, estado_pago, file_path')
      .eq('client_id', userId)
      .eq('client_type', tipoCliente === 'usuario' ? 'cliente' : 'empresa')
      .in('mes_factura', mesesArray);
    
    const facturasMap = new Map<string, { existe: boolean; estadoPago: string; filePath: string }>();
    (facturas || []).forEach((f: any) => {
      facturasMap.set(f.mes_factura, { existe: true, estadoPago: f.estado_pago, filePath: f.file_path });
    });

    // Comprobantes (payment_receipts)
    const { data: comprobantes } = await supabase
      .from('payment_receipts' as any)
      .select('mes_pago, estado')
      .eq('user_id', userId)
      .eq('tipo_cliente', tipoCliente === 'usuario' ? 'cliente' : 'empresa')
      .in('mes_pago', mesesArray)
      .in('estado', ['pendiente', 'aprobado']);
    
    const comprobantesMap = new Map<string, { existe: boolean; estado: string }>();
    (comprobantes || []).forEach((c: any) => {
      comprobantesMap.set(c.mes_pago, { existe: true, estado: c.estado });
    });

    // ===== Construir respuesta por mes (ordenado cronológicamente) =====
    const mesesOrdenados = Array.from(mesesMap.entries())
      .sort(([a], [b]) => a.localeCompare(b));

    const mesesPendientes = mesesOrdenados.map(([mes, data]) => {
      const horasDecimal = data.tphMinutos / 60;
      const montoHoras = horasDecimal * tarifaHora;
      const esMesReporte = mes === mesReporte;
      const montoMensualidades = esMesReporte ? totalMensualidades : 0;
      const ivaMensualidades = esMesReporte ? totalIVAMensualidades : 0;

      // Subtotal: horas + gastos + servicios profesionales + mensualidades
      const subtotal = montoHoras + data.gastosMonto + data.spMonto + montoMensualidades;
      // IVA: solo sobre horas y mensualidades (gastos y SP ya incluyen todo en total_cobro/total)
      const ivaHoras = montoHoras * ivaPerc;
      const montoIVA = ivaHoras + ivaMensualidades;
      const totalAPagar = subtotal + montoIVA;

      const factura = facturasMap.get(mes);
      const comprobante = comprobantesMap.get(mes);

      // Nombre del mes legible
      const [y, m] = mes.split('-').map(Number);
      const mesTexto = new Date(y, m - 1, 1).toLocaleString('es-CR', { month: 'long', year: 'numeric' });

      return {
        mes,
        mesTexto,
        montoHoras,
        horasDecimal: parseFloat(horasDecimal.toFixed(2)),
        cantidadTrabajos: data.tphCantidad,
        montoGastos: data.gastosMonto,
        cantidadGastos: data.gastosCantidad,
        montoServicios: data.spMonto,
        cantidadServicios: data.spCantidad,
        montoMensualidades,
        ivaMensualidades,
        subtotal,
        ivaPerc,
        montoIVA,
        totalAPagar,
        tieneFactura: factura?.existe || false,
        facturaEstadoPago: factura?.estadoPago || null,
        tieneComprobante: comprobante?.existe || false,
        comprobanteEstado: comprobante?.estado || null,
        puedeSubirComprobante: !comprobante?.existe,
      };
    });

    // Filtrar meses que realmente tienen monto > 0
    const mesesConMonto = mesesPendientes.filter(m => m.totalAPagar > 0);

    const granTotal = mesesConMonto.reduce((sum, m) => sum + m.totalAPagar, 0);

    return NextResponse.json({
      success: true,
      tipoCliente,
      nombreCliente,
      tarifaHora,
      ivaPerc,
      mesReporte,
      meses: mesesConMonto,
      cantidadMeses: mesesConMonto.length,
      granTotal,
    });

  } catch (error: any) {
    console.error('Error al obtener meses pendientes:', error);
    return NextResponse.json(
      { error: error.message || "Error desconocido" },
      { status: 500 }
    );
  }
}
