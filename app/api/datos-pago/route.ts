import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Obtener el userId de los headers (asumiendo que viene de la sesión)
    const userId = request.headers.get('x-user-id');
    const tipoCliente = request.headers.get('x-tipo-cliente'); // 'usuario' o 'empresa'

    if (!userId || !tipoCliente) {
      return NextResponse.json(
        { error: "Usuario no autenticado" },
        { status: 401 }
      );
    }

    // Calcular el primer día del mes actual
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const inicioMesStr = inicioMes.toISOString().split('T')[0];

    // Obtener trabajos por hora del mes actual
    let trabajosPorHora: any[] = [];
    if (tipoCliente === 'usuario') {
      // Para usuarios, buscar directamente por id_cliente
      const { data, error } = await supabase
        .from('trabajos_por_hora')
        .select('*, casos!fk_caso(nombre, expediente)')
        .eq('id_cliente', userId)
        .gte('fecha', inicioMesStr)
        .order('fecha', { ascending: false });

      if (error) throw error;
      trabajosPorHora = data || [];
    } else {
      // Para empresas, buscar casos de la empresa y luego sus trabajos
      const { data: casos, error: casosError } = await supabase
        .from('casos')
        .select('id')
        .eq('id_cliente', userId);

      if (casosError) throw casosError;

      if (casos && casos.length > 0) {
        const casoIds = casos.map(c => c.id);
        const { data, error } = await supabase
          .from('trabajos_por_hora')
          .select('*, casos!fk_caso(nombre, expediente)')
          .in('caso_asignado', casoIds)
          .gte('fecha', inicioMesStr)
          .order('fecha', { ascending: false });

        if (error) throw error;
        trabajosPorHora = data || [];
      }
    }

    // Obtener datos de empresa (tarifa_hora, iva_perc) si es empresa
    let tarifaHora = 90000; // Tarifa estándar por defecto
    let ivaPerc = 0.13; // IVA por defecto
    if (tipoCliente === 'empresa') {
      const { data: empresa, error: empresaError } = await supabase
        .from('empresas')
        .select('tarifa_hora, iva_perc')
        .eq('id', userId)
        .single();
      
      if (!empresaError && empresa) {
        tarifaHora = empresa.tarifa_hora || 90000;
        ivaPerc = empresa.iva_perc || 0.13;
      }
    }

    // Obtener gastos del mes actual del cliente con detalles
    const { data: gastos, error: gastosError } = await supabase
      .from('gastos' as any)
      .select(`
        id,
        producto,
        fecha,
        total_cobro,
        funcionarios:id_responsable (
          nombre
        )
      `)
      .eq('id_cliente', userId)
      .gte('fecha', inicioMesStr)
      .order('fecha', { ascending: false });
    
    if (gastosError) throw gastosError;
    
    const totalGastos = (gastos || []).reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);

    // Obtener solicitudes con modalidad mensual
    const { data: solicitudes, error: solicitudesError } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('id_cliente', userId)
      .ilike('modalidad_pago', 'mensualidad');

    if (solicitudesError) throw solicitudesError;

    // Calcular totales
    let totalMensualidades = 0;
    if (solicitudes && solicitudes.length > 0) {
      totalMensualidades = solicitudes.reduce((sum, s) => {
        return sum + (s.monto_por_cuota || 0);
      }, 0);
    }

    // Agrupar trabajos por hora por caso
    const trabajosPorCaso: { [key: string]: any } = {};
    trabajosPorHora.forEach((trabajo: any) => {
      const casoId = trabajo.caso_asignado || 'sin_caso';
      if (!trabajosPorCaso[casoId]) {
        trabajosPorCaso[casoId] = {
          caso: trabajo.casos || { nombre: 'Sin caso', expediente: null },
          trabajos: [],
          totalMinutos: 0
        };
      }
      trabajosPorCaso[casoId].trabajos.push(trabajo);
      
      // Sumar minutos (formato puede ser "2:30" o "2.5")
      if (trabajo.duracion) {
        const duracion = trabajo.duracion;
        let minutos = 0;
        if (duracion.includes(':')) {
          const [h, m] = duracion.split(':').map(Number);
          minutos = (h * 60) + m;
        } else {
          const horas = parseFloat(duracion);
          minutos = Math.round(horas * 60);
        }
        trabajosPorCaso[casoId].totalMinutos += minutos;
      }
    });
    
    // Convertir totalMinutos a formato HH:MM y calcular totales
    let totalMinutosGlobal = 0;
    Object.values(trabajosPorCaso).forEach((caso: any) => {
      const horas = Math.floor(caso.totalMinutos / 60);
      const minutos = caso.totalMinutos % 60;
      caso.totalHoras = `${horas}:${minutos.toString().padStart(2, '0')}`;
      totalMinutosGlobal += caso.totalMinutos;
    });

    // Calcular totales de servicios profesionales
    // Cálculo correcto: minutos / 60 para obtener horas decimales
    const totalHorasDecimal = totalMinutosGlobal / 60;
    
    const costoServiciosTarifa = totalHorasDecimal * tarifaHora;
    const costoServiciosEstandar = totalHorasDecimal * 90000;
    const ahorroComparativo = costoServiciosEstandar - costoServiciosTarifa;

    // Calcular total antes de IVA
    const subtotal = costoServiciosTarifa + totalMensualidades + totalGastos;
    const montoIVA = subtotal * ivaPerc;
    const totalAPagar = subtotal + montoIVA;

    return NextResponse.json({
      success: true,
      tipoCliente,
      trabajosPorHora: Object.values(trabajosPorCaso),
      solicitudesMensuales: solicitudes || [],
      totalMensualidades,
      gastos: gastos || [],
      totalGastos,
      totalMinutosGlobal,
      totalHorasDecimal: parseFloat(totalHorasDecimal.toFixed(2)),
      tarifaHora,
      tarifaEstandar: 90000,
      costoServiciosTarifa,
      costoServiciosEstandar,
      ahorroComparativo,
      subtotal,
      ivaPerc,
      montoIVA,
      totalAPagar,
      mesActual: inicioMes.toLocaleString('es-ES', { month: 'long', year: 'numeric' })
    });

  } catch (error: any) {
    console.error('Error al obtener datos de pago:', error);
    return NextResponse.json(
      { error: error.message || "Error desconocido" },
      { status: 500 }
    );
  }
}
