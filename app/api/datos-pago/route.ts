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
    let trabajosPorHora = [];
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
    
    // Convertir totalMinutos a formato HH:MM
    Object.values(trabajosPorCaso).forEach((caso: any) => {
      const horas = Math.floor(caso.totalMinutos / 60);
      const minutos = caso.totalMinutos % 60;
      caso.totalHoras = `${horas}:${minutos.toString().padStart(2, '0')}`;
    });

    return NextResponse.json({
      success: true,
      tipoCliente,
      trabajosPorHora: Object.values(trabajosPorCaso),
      solicitudesMensuales: solicitudes || [],
      totalMensualidades,
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
