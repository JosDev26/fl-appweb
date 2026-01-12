import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentDateCR, getMesAnterior, getRangoMes } from "@/lib/dateUtils";
import { checkStandardRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Only log in development mode
const isDev = process.env.NODE_ENV === 'development';

// Función auxiliar para obtener datos de pago de una empresa específica
async function getDatosEmpresa(
  empresaId: string, 
  inicioMes: string, 
  finMes: string
): Promise<{
  trabajosPorHora: any[];
  gastos: any[];
  solicitudes: any[];
  serviciosProfesionales: any[];
  empresa: { nombre: string; tarifa_hora: number; iva_perc: number } | null;
}> {
  // Obtener info de la empresa
  const { data: empresaData } = await supabase
    .from('empresas')
    .select('nombre, tarifa_hora, iva_perc')
    .eq('id', empresaId)
    .maybeSingle();

  // Obtener casos de la empresa
  const { data: casos } = await supabase
    .from('casos')
    .select('id')
    .eq('id_cliente', empresaId);

  let trabajosPorHora: any[] = [];
  if (casos && casos.length > 0) {
    const casoIds = casos.map(c => c.id);
    const { data } = await supabase
      .from('trabajos_por_hora')
      .select('*, casos!fk_caso(nombre, expediente)')
      .in('caso_asignado', casoIds)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false });
    trabajosPorHora = data || [];
  }

  // Obtener gastos
  const { data: gastos } = await supabase
    .from('gastos' as any)
    .select(`id, producto, fecha, total_cobro, funcionarios:id_responsable (nombre)`)
    .eq('id_cliente', empresaId)
    .gte('fecha', inicioMes)
    .lte('fecha', finMes)
    .order('fecha', { ascending: false });

  // Obtener solicitudes mensuales
  const { data: solicitudes } = await supabase
    .from('solicitudes')
    .select('*')
    .eq('id_cliente', empresaId)
    .ilike('modalidad_pago', 'mensualidad');

  // Obtener servicios profesionales (NO cancelados)
  const { data: serviciosProfesionales } = await supabase
    .from('servicios_profesionales' as any)
    .select(`
      id, id_caso, id_servicio, fecha, costo, gastos, iva, total, estado_pago,
      funcionarios:id_responsable (nombre),
      lista_servicios:id_servicio (titulo)
    `)
    .eq('id_cliente', empresaId)
    .neq('estado_pago', 'cancelado')
    .gte('fecha', inicioMes)
    .lte('fecha', finMes)
    .order('fecha', { ascending: false });

  return {
    trabajosPorHora: trabajosPorHora || [],
    gastos: gastos || [],
    solicitudes: solicitudes || [],
    serviciosProfesionales: serviciosProfesionales || [],
    empresa: empresaData ? {
      nombre: (empresaData as any).nombre,
      tarifa_hora: (empresaData as any).tarifa_hora || 90000,
      iva_perc: (empresaData as any).iva_perc || 0.13
    } : null
  };
}

export async function GET(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

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

    // Usar fecha simulada si se proporciona, sino usar fecha global o fecha real Costa Rica
    // SECURITY: Only allow simulated dates in development environment
    const { searchParams } = new URL(request.url)
    let validatedSimulatedDate: string | null = null
    
    if (isDev) {
      const rawSimulatedDate = searchParams.get('simulatedDate')?.trim()
      if (rawSimulatedDate) {
        // Validate format: YYYY-MM-DD or ISO-8601 date
        const dateFormatRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?)?$/
        if (dateFormatRegex.test(rawSimulatedDate)) {
          // Also validate it's a valid date
          const parsedDate = Date.parse(rawSimulatedDate)
          if (!isNaN(parsedDate)) {
            validatedSimulatedDate = rawSimulatedDate
            console.log('📅 [datos-pago] simulatedDate validated:', validatedSimulatedDate)
          } else {
            console.warn('📅 [datos-pago] simulatedDate parse failed, ignoring:', rawSimulatedDate)
          }
        } else {
          console.warn('📅 [datos-pago] simulatedDate invalid format (expected YYYY-MM-DD), ignoring:', rawSimulatedDate)
        }
      }
    } else if (searchParams.get('simulatedDate')) {
      // Log warning if someone tries to use simulatedDate in production
      console.warn('⚠️ [datos-pago] simulatedDate parameter ignored in production environment')
    }
    
    const now = await getCurrentDateCR(validatedSimulatedDate)
    if (isDev) console.log('📅 [datos-pago] getCurrentDateCR retornó:', now.toISOString())
    
    // IMPORTANTE: Los clientes ven las horas/gastos del MES ANTERIOR
    // Si hoy es diciembre, se muestran datos de NOVIEMBRE
    // Usa zona horaria de Costa Rica (UTC-6)
    
    const { year, month, mesPago } = getMesAnterior(now)
    const { inicioMes: inicioMesStr, finMes: finMesStr } = getRangoMes(year, month)
    
    if (isDev) console.log('📅 [datos-pago] Mes anterior:', mesPago, '| Rango:', inicioMesStr, 'a', finMesStr)

    // Verificar si es empresa principal de un grupo
    let esGrupoPrincipal = false;
    let empresasDelGrupo: { id: string; nombre: string; iva_perc: number }[] = [];
    
    if (tipoCliente === 'empresa') {
      const { data: grupo } = await supabase
        .from('grupos_empresas' as any)
        .select(`
          id,
          nombre,
          miembros:grupos_empresas_miembros(empresa_id)
        `)
        .eq('empresa_principal_id', userId)
        .maybeSingle();

      if (grupo) {
        esGrupoPrincipal = true;
        // Obtener info de las empresas miembros
        const empresaIds = ((grupo as any).miembros || []).map((m: any) => m.empresa_id);
        if (empresaIds.length > 0) {
          const { data: empresasInfo } = await supabase
            .from('empresas')
            .select('id, nombre, iva_perc')
            .in('id', empresaIds);
          empresasDelGrupo = (empresasInfo || []).map((e: any) => ({
            id: e.id,
            nombre: e.nombre,
            iva_perc: e.iva_perc || 0.13
          }));
        }
        if (isDev) console.log('🏢 [datos-pago] Es empresa principal de grupo con', empresasDelGrupo.length, 'empresas asociadas');
      }
    }

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
    let nombreCliente = ''; // Nombre del cliente para mostrar
    if (tipoCliente === 'empresa') {
      const { data: empresa, error: empresaError } = await supabase
        .from('empresas')
        .select('nombre, tarifa_hora, iva_perc, "darVistoBueno"')
        .eq('id', userId)
        .maybeSingle();
      
      if (!empresaError && empresa) {
        nombreCliente = (empresa as any).nombre || '';
        tarifaHora = (empresa as any).tarifa_hora || 90000;
        ivaPerc = (empresa as any).iva_perc || 0.13;
        darVistoBueno = (empresa as any).darVistoBueno || false;
      }
    } else {
      // Para usuarios, obtener darVistoBueno
      const { data: usuario, error: usuarioError } = await supabase
        .from('usuarios')
        .select('nombre, "darVistoBueno"')
        .eq('id', userId)
        .maybeSingle();
      
      if (!usuarioError && usuario) {
        nombreCliente = (usuario as any).nombre || '';
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

    // Obtener servicios profesionales del mes anterior (NO cancelados)
    const { data: serviciosProfesionales, error: serviciosError } = await supabase
      .from('servicios_profesionales' as any)
      .select(`
        id,
        id_caso,
        id_servicio,
        fecha,
        costo,
        gastos,
        iva,
        total,
        estado_pago,
        funcionarios:id_responsable (nombre),
        lista_servicios:id_servicio (titulo)
      `)
      .eq('id_cliente', userId)
      .neq('estado_pago', 'cancelado')
      .gte('fecha', inicioMesStr)
      .lte('fecha', finMesStr)
      .order('fecha', { ascending: false });
    
    if (serviciosError) {
      if (isDev) console.error('Error al obtener servicios profesionales:', serviciosError);
    }
    
    // Calcular total de servicios profesionales (el campo 'total' ya incluye todo)
    const totalServiciosProfesionales = (serviciosProfesionales || []).reduce(
      (sum: number, s: any) => sum + (s.total || 0), 
      0
    );

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
      if (isDev) console.log('🔍 SOLICITUDES MENSUALIDADES:', solicitudes.length);
      solicitudes.forEach(s => {
        if (isDev) console.log(`  - ${s.titulo}: monto_por_cuota=${s.monto_por_cuota}, se_cobra_iva=${s.se_cobra_iva}`);
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

    // DEBUG: Log detallado de trabajos (only in dev)
    if (isDev) {
      console.log('🔍 [DEBUG] EMPRESA PRINCIPAL trabajos:', trabajosPorHora.length);
      console.log('🔍 [DEBUG] EMPRESA PRINCIPAL minutos totales:', totalMinutosGlobal);
    }

    // Calcular totales de servicios profesionales
    // Cálculo correcto: minutos / 60 para obtener horas decimales
    const totalHorasDecimal = totalMinutosGlobal / 60;
    
    const costoServiciosTarifa = totalHorasDecimal * tarifaHora;
    const costoServiciosEstandar = totalHorasDecimal * 90000;
    const ahorroComparativo = costoServiciosEstandar - costoServiciosTarifa;

    // Calcular totales
    // Subtotal (sin IVA): servicios tarifa_hora + gastos + mensualidades + servicios profesionales
    // NOTA: totalServiciosProfesionales ya es el monto final (como gastos.total_cobro), no lleva IVA adicional
    const subtotal = costoServiciosTarifa + totalGastos + totalMensualidades + totalServiciosProfesionales;
    
    // IVA total: IVA solo de servicios + IVA extraído de mensualidades
    // IMPORTANTE: Los gastos NO llevan IVA porque total_cobro ya es el monto final
    const ivaServicios = costoServiciosTarifa * ivaPerc;
    const montoIVA = ivaServicios + totalIVAMensualidades;
    
    // Total a pagar: subtotal + IVA
    const totalAPagar = subtotal + montoIVA;

    // ========== DATOS DE EMPRESAS ASOCIADAS (GRUPOS) ==========
    interface DatosEmpresaGrupo {
      empresaId: string;
      empresaNombre: string;
      ivaPerc: number;
      trabajosPorHora: any[];
      gastos: any[];
      solicitudes: any[];
      serviciosProfesionales: any[];
      totalServiciosProfesionales: number;
      totalMinutos: number;
      totalHoras: number;
      tarifaHora: number;
      costoServicios: number;
      totalGastos: number;
      totalMensualidades: number;
      totalIVAMensualidades: number;
      subtotal: number;
      ivaServicios: number;
      montoIVA: number;
      total: number;
    }
    
    let datosEmpresasGrupo: DatosEmpresaGrupo[] = [];
    let totalGrupoSubtotal = 0;
    let totalGrupoIVA = 0;
    let totalGrupoAPagar = 0;
    
    if (esGrupoPrincipal && empresasDelGrupo.length > 0) {
      if (isDev) console.log('🏢 [datos-pago] Cargando datos de', empresasDelGrupo.length, 'empresas asociadas...');
      
      for (const empresaAsociada of empresasDelGrupo) {
        const datosEmp = await getDatosEmpresa(empresaAsociada.id, inicioMesStr, finMesStr);
        
        // DEBUG: Log de empresa asociada (only in dev)
        if (isDev) {
          console.log(`🔍 [DEBUG] EMPRESA ASOCIADA: ${empresaAsociada.nombre} trabajos:`, datosEmp.trabajosPorHora.length);
        }
        
        // Calcular totales para esta empresa
        let empTotalMinutos = 0;
        datosEmp.trabajosPorHora.forEach((t: any) => {
          if (t.duracion) {
            const duracion = t.duracion;
            let minutos = 0;
            if (duracion.includes(':')) {
              const [h, m] = duracion.split(':').map(Number);
              minutos = (h * 60) + m;
            } else {
              const horas = parseFloat(duracion);
              minutos = Math.round(horas * 60);
            }
            empTotalMinutos += minutos;
          }
        });
        
        const empTarifaHora = datosEmp.empresa?.tarifa_hora || 90000;
        const empIvaPerc = empresaAsociada.iva_perc;
        const empTotalHoras = empTotalMinutos / 60;
        const empCostoServicios = empTotalHoras * empTarifaHora;
        const empTotalGastos = datosEmp.gastos.reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);
        
        // Calcular total de servicios profesionales (el campo 'total' ya incluye todo)
        const empTotalServiciosProfesionales = datosEmp.serviciosProfesionales.reduce(
          (sum: number, s: any) => sum + (s.total || 0), 
          0
        );
        
        // Calcular mensualidades de la empresa asociada
        let empTotalMensualidades = 0;
        let empTotalIVAMensualidades = 0;
        datosEmp.solicitudes.forEach((s: any) => {
          const montoCuota = s.monto_por_cuota || 0;
          if (s.se_cobra_iva) {
            const subtotalCuota = montoCuota / (1 + empIvaPerc);
            empTotalMensualidades += subtotalCuota;
            empTotalIVAMensualidades += montoCuota - subtotalCuota;
          } else {
            empTotalMensualidades += montoCuota;
          }
        });
        
        const empSubtotal = empCostoServicios + empTotalGastos + empTotalMensualidades + empTotalServiciosProfesionales;
        const empIvaServicios = empCostoServicios * empIvaPerc;
        const empMontoIVA = empIvaServicios + empTotalIVAMensualidades;
        const empTotal = empSubtotal + empMontoIVA;
        
        datosEmpresasGrupo.push({
          empresaId: empresaAsociada.id,
          empresaNombre: empresaAsociada.nombre,
          ivaPerc: empIvaPerc,
          trabajosPorHora: datosEmp.trabajosPorHora,
          gastos: datosEmp.gastos,
          solicitudes: datosEmp.solicitudes,
          serviciosProfesionales: datosEmp.serviciosProfesionales,
          totalServiciosProfesionales: empTotalServiciosProfesionales,
          totalMinutos: empTotalMinutos,
          totalHoras: empTotalHoras,
          tarifaHora: empTarifaHora,
          costoServicios: empCostoServicios,
          totalGastos: empTotalGastos,
          totalMensualidades: empTotalMensualidades,
          totalIVAMensualidades: empTotalIVAMensualidades,
          subtotal: empSubtotal,
          ivaServicios: empIvaServicios,
          montoIVA: empMontoIVA,
          total: empTotal
        });
        
        totalGrupoSubtotal += empSubtotal;
        totalGrupoIVA += empMontoIVA;
        totalGrupoAPagar += empTotal;
        
        if (isDev) console.log(`  📊 ${empresaAsociada.nombre}: Total=${empTotal}`);
      }
    }
    
    // Gran total incluyendo empresa principal y asociadas
    const granTotalSubtotal = subtotal + totalGrupoSubtotal;
    const granTotalIVA = montoIVA + totalGrupoIVA;
    const granTotalAPagar = totalAPagar + totalGrupoAPagar;

    // Debug logs (only in development)
    if (isDev) {
      console.log('📊 CÁLCULO DE PAGO (MES ANTERIOR):');
      console.log('  - Mes:', mesPago, '| Total:', totalAPagar);
      if (esGrupoPrincipal) {
        console.log('  🏢 GRUPO - Gran total:', granTotalAPagar);
      }
    }

    return NextResponse.json({
      success: true,
      tipoCliente,
      nombreCliente,
      darVistoBueno,
      trabajosPorHora: Object.values(trabajosPorCaso),
      solicitudesMensuales: solicitudes || [],
      totalMensualidades,
      totalIVAMensualidades,
      gastos: gastos || [],
      totalGastos,
      serviciosProfesionales: serviciosProfesionales || [],
      totalServiciosProfesionales,
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
      mesActual: new Date(year, month - 1, 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' }),
      mesActualISO: `${year}-${String(month).padStart(2, '0')}`,
      mesActualText: `Datos del mes anterior: ${new Date(year, month - 1, 1).toLocaleString('es-ES', { month: 'long', year: 'numeric' })}`,
      // Datos del grupo
      esGrupoPrincipal,
      empresasDelGrupo: esGrupoPrincipal ? datosEmpresasGrupo : [],
      totalGrupoSubtotal: esGrupoPrincipal ? totalGrupoSubtotal : 0,
      totalGrupoIVA: esGrupoPrincipal ? totalGrupoIVA : 0,
      totalGrupoAPagar: esGrupoPrincipal ? totalGrupoAPagar : 0,
      granTotalSubtotal: esGrupoPrincipal ? granTotalSubtotal : subtotal,
      granTotalIVA: esGrupoPrincipal ? granTotalIVA : montoIVA,
      granTotalAPagar: esGrupoPrincipal ? granTotalAPagar : totalAPagar
    });

  } catch (error: any) {
    console.error('Error al obtener datos de pago:', error);
    return NextResponse.json(
      { error: error.message || "Error desconocido" },
      { status: 500 }
    );
  }
}
