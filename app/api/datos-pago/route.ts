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
    
    // IMPORTANTE: Los clientes ven las horas/gastos del MES ANTERIOR
    // Si hoy es diciembre, se muestran datos de NOVIEMBRE
    
    // Calcular el primer día del mes anterior (método seguro)
    const year = now.getFullYear()
    const month = now.getMonth() // 0-11
    
    const inicioMes = new Date(year, month - 1, 1, 0, 0, 0, 0)
    const inicioMesStr = inicioMes.toISOString().split('T')[0]
    
    // Calcular el último día del mes anterior
    const finMes = new Date(year, month, 0, 23, 59, 59, 999) // día 0 = último día del mes anterior
    const finMesStr = finMes.toISOString().split('T')[0]

    // Obtener trabajos por hora del mes anterior
    let trabajosPorHora: any[] = [];
    if (tipoCliente === 'usuario') {
      // Para usuarios, buscar directamente por id_cliente
      const { data, error } = await supabase
        .from('trabajos_por_hora')
        .select('*, casos!fk_caso(nombre, expediente)')
        .eq('id_cliente', userId)
        .gte('fecha', inicioMesStr)
        .lte('fecha', finMesStr)
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
          .lte('fecha', finMesStr)
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

    // Obtener gastos del mes anterior del cliente con detalles
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
      .lte('fecha', finMesStr)
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

    // Calcular totales de mensualidades
    // Si se_cobra_iva = true: monto_por_cuota incluye IVA (ej: ₡50,000 = ₡44,248 + ₡5,752 IVA)
    // Si se_cobra_iva = false: monto_por_cuota NO incluye IVA (ej: ₡50,000 sin IVA)
    let totalMensualidades = 0; // Total SIN IVA
    let totalIVAMensualidades = 0; // IVA extraído
    
    if (solicitudes && solicitudes.length > 0) {
      console.log('🔍 SOLICITUDES MENSUALIDADES:', solicitudes.length);
      solicitudes.forEach(s => {
        console.log(`  - ${s.titulo}: monto_por_cuota=${s.monto_por_cuota}, se_cobra_iva=${s.se_cobra_iva}, monto_iva=${s.monto_iva}`);
        const montoCuota = s.monto_por_cuota || 0;
        
        if (s.se_cobra_iva) {
          // El monto incluye IVA, extraerlo
          // monto_cuota = subtotal + IVA
          // subtotal = monto_cuota / 1.13
          // IVA = monto_cuota - subtotal
          const subtotalCuota = montoCuota / (1 + ivaPerc);
          const ivaCuota = montoCuota - subtotalCuota;
          
          totalMensualidades += subtotalCuota;
          totalIVAMensualidades += ivaCuota;
        } else {
          // No se cobra IVA, el monto es el subtotal
          totalMensualidades += montoCuota;
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
    // Subtotal (sin IVA): servicios + gastos + mensualidades sin IVA
    const subtotal = costoServiciosTarifa + totalGastos + totalMensualidades;
    
    // IVA total: IVA solo de servicios + IVA extraído de mensualidades
    // IMPORTANTE: Los gastos NO llevan IVA porque total_cobro ya es el monto final
    const ivaServicios = costoServiciosTarifa * ivaPerc;
    const montoIVA = ivaServicios + totalIVAMensualidades;
    
    // Total a pagar: subtotal + IVA
    const totalAPagar = subtotal + montoIVA;

    // Debug logs
    console.log('📊 CÁLCULO DE PAGO (MES ANTERIOR):');
    console.log('  - Fecha actual/simulada:', now.toISOString().split('T')[0]);
    console.log('  - Mes a mostrar:', inicioMes.toLocaleString('es-ES', { month: 'long', year: 'numeric' }));
    console.log('  - Rango de fechas:', `${inicioMesStr} a ${finMesStr}`);
    console.log('  - Costo servicios:', costoServiciosTarifa);
    console.log('  - Total gastos (sin IVA):', totalGastos);
    console.log('  - Total mensualidades (sin IVA):', totalMensualidades);
    console.log('  - Subtotal:', subtotal);
    console.log('  - IVA servicios:', ivaServicios);
    console.log('  - IVA mensualidades:', totalIVAMensualidades);
    console.log('  - Monto IVA total:', montoIVA);
    console.log('  - Total a pagar:', totalAPagar);

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
      mesActualISO: `${inicioMes.getFullYear()}-${String(inicioMes.getMonth() + 1).padStart(2, '0')}`,
      // Información adicional para debugging
      mesActualText: `Datos del mes anterior: ${inicioMes.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}`
    });

  } catch (error: any) {
    console.error('Error al obtener datos de pago:', error);
    return NextResponse.json(
      { error: error.message || "Error desconocido" },
      { status: 500 }
    );
  }
}
