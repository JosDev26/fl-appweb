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

    // Usar fecha simulada si se proporciona
    const { searchParams } = new URL(request.url)
    const simulatedDate = searchParams.get('simulatedDate')
    const now = simulatedDate ? new Date(simulatedDate + 'T12:00:00') : new Date()
    
    // Calcular el primer día del mes (simulado o actual)
    const inicioMes = new Date(now);
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
    let darVistoBueno = false; // Requiere dar visto bueno
    if (tipoCliente === 'empresa') {
      const { data: empresa, error: empresaError } = await supabase
        .from('empresas')
        .select('tarifa_hora, iva_perc, "darVistoBueno"')
        .eq('id', userId)
        .maybeSingle();
      
      if (!empresaError && empresa) {
        tarifaHora = (empresa as any).tarifa_hora || 90000;
        ivaPerc = (empresa as any).iva_perc || 0.13;
        darVistoBueno = (empresa as any).darVistoBueno || false;
      }
    } else {
      // Para usuarios, obtener darVistoBueno
      const { data: usuario, error: usuarioError } = await supabase
        .from('usuarios')
        .select('"darVistoBueno"')
        .eq('id', userId)
        .maybeSingle();
      
      if (!usuarioError && usuario) {
        darVistoBueno = (usuario as any).darVistoBueno || false;
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

    // Calcular totales de mensualidades (sin IVA, se calcula después)
    let totalMensualidades = 0;
    let totalIVAMensualidades = 0;
    if (solicitudes && solicitudes.length > 0) {
      solicitudes.forEach(s => {
        const montoCuota = s.monto_por_cuota || 0;
        totalMensualidades += montoCuota;
        
        // Si la solicitud cobra IVA, sumar su monto_iva
        if (s.se_cobra_iva && s.monto_iva) {
          // El monto_iva en la BD es el IVA total, calculamos la proporción por cuota
          if (s.cantidad_cuotas && s.cantidad_cuotas > 0) {
            totalIVAMensualidades += s.monto_iva / s.cantidad_cuotas;
          } else {
            totalIVAMensualidades += s.monto_iva;
          }
        } else if (s.se_cobra_iva && s.costo_neto) {
          // Si no hay monto_iva pero se cobra IVA, calcular basado en costo_neto
          const ivaSolicitud = (s.costo_neto * ivaPerc);
          if (s.cantidad_cuotas && s.cantidad_cuotas > 0) {
            totalIVAMensualidades += ivaSolicitud / s.cantidad_cuotas;
          } else {
            totalIVAMensualidades += ivaSolicitud;
          }
        }
      });
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

    // Calcular totales
    // Subtotal: servicios + mensualidades (sin IVA) + gastos
    const subtotal = costoServiciosTarifa + totalMensualidades + totalGastos;
    
    // IVA: sobre servicios y gastos + IVA específico de mensualidades
    const ivaServiciosGastos = (costoServiciosTarifa + totalGastos) * ivaPerc;
    const montoIVA = ivaServiciosGastos + totalIVAMensualidades;
    
    const totalAPagar = subtotal + montoIVA;

    return NextResponse.json({
      success: true,
      tipoCliente,
      darVistoBueno,
      trabajosPorHora: Object.values(trabajosPorCaso),
      solicitudesMensuales: solicitudes || [],
      totalMensualidades,
      totalIVAMensualidades,
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
      mesActual: inicioMes.toLocaleString('es-ES', { month: 'long', year: 'numeric' }),
      mesActualISO: `${inicioMes.getFullYear()}-${String(inicioMes.getMonth() + 1).padStart(2, '0')}`
    });

  } catch (error: any) {
    console.error('Error al obtener datos de pago:', error);
    return NextResponse.json(
      { error: error.message || "Error desconocido" },
      { status: 500 }
    );
  }
}
