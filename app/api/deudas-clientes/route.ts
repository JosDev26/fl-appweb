import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentDateCR, getMesAnterior, getRangoMes } from "@/lib/dateUtils";
import { checkStandardRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

interface DeudaCliente {
  id: string;
  nombre: string;
  cedula: string;
  tipo: 'usuario' | 'empresa';
  grupoId?: string;
  grupoNombre?: string;
  esGrupoPrincipal?: boolean;
  tarifa_hora: number;
  iva_perc: number;
  // Mes anterior (ya reportado)
  mesAnterior: {
    mes: string;
    totalHoras: number;
    montoHoras: number;
    totalGastos: number;
    totalMensualidades: number;
    subtotal: number;
    iva: number;
    total: number;
  };
  // Mes actual (sin reportar)
  mesActual: {
    mes: string;
    totalHoras: number;
    montoHoras: number;
    totalGastos: number;
    totalMensualidades: number;
    subtotal: number;
    iva: number;
    total: number;
  };
}

// Función para calcular horas desde interval
function calcularHoras(duracion: any): number {
  if (!duracion) return 0;
  
  // Si es string tipo "HH:MM:SS" o "HH:MM"
  if (typeof duracion === 'string') {
    const parts = duracion.split(':');
    const hours = parseInt(parts[0]) || 0;
    const minutes = parseInt(parts[1]) || 0;
    const seconds = parseInt(parts[2]) || 0;
    return hours + minutes / 60 + seconds / 3600;
  }
  
  // Si es objeto con hours, minutes, seconds
  if (typeof duracion === 'object') {
    const hours = duracion.hours || 0;
    const minutes = duracion.minutes || 0;
    const seconds = duracion.seconds || 0;
    return hours + minutes / 60 + seconds / 3600;
  }
  
  return 0;
}

// Obtener datos de un cliente para un mes específico
async function getDatosClienteMes(
  clienteId: string,
  tipo: 'usuario' | 'empresa',
  inicioMes: string,
  finMes: string,
  tarifaHora: number,
  ivaPerc: number
): Promise<{
  totalHoras: number;
  montoHoras: number;
  totalGastos: number;
  totalMensualidades: number;
  subtotal: number;
  iva: number;
  total: number;
}> {
  let trabajosPorHora: any[] = [];
  
  if (tipo === 'usuario') {
    // Para usuarios, buscar por id_cliente directamente
    const { data } = await supabase
      .from('trabajos_por_hora')
      .select('duracion')
      .eq('id_cliente', clienteId)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes);
    trabajosPorHora = data || [];
  } else {
    // Para empresas, buscar por casos
    const { data: casos } = await supabase
      .from('casos')
      .select('id')
      .eq('id_cliente', clienteId);
    
    if (casos && casos.length > 0) {
      const casoIds = casos.map(c => c.id);
      const { data } = await supabase
        .from('trabajos_por_hora')
        .select('duracion')
        .in('caso_asignado', casoIds)
        .gte('fecha', inicioMes)
        .lte('fecha', finMes);
      trabajosPorHora = data || [];
    }
  }

  // Calcular total de horas
  const totalHoras = trabajosPorHora.reduce((sum, t) => sum + calcularHoras(t.duracion), 0);
  const montoHoras = totalHoras * tarifaHora;

  // Obtener gastos (ya vienen con el monto final, NO se les aplica IVA)
  const { data: gastos } = await supabase
    .from('gastos' as any)
    .select('total_cobro')
    .eq('id_cliente', clienteId)
    .gte('fecha', inicioMes)
    .lte('fecha', finMes);
  
  const totalGastos = (gastos || []).reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);

  // Obtener mensualidades
  const { data: solicitudes } = await supabase
    .from('solicitudes')
    .select('monto_por_cuota, se_cobra_iva')
    .eq('id_cliente', clienteId)
    .ilike('modalidad_pago', 'mensualidad');

  let totalMensualidades = 0;
  let totalIVAMensualidades = 0;
  if (solicitudes && solicitudes.length > 0) {
    solicitudes.forEach(s => {
      const montoCuota = s.monto_por_cuota || 0;
      if (s.se_cobra_iva) {
        // El monto incluye IVA, extraerlo para obtener subtotal
        const subtotalCuota = montoCuota / (1 + ivaPerc);
        totalMensualidades += subtotalCuota;
        totalIVAMensualidades += montoCuota - subtotalCuota;
      } else {
        totalMensualidades += montoCuota;
      }
    });
  }

  // Subtotal: servicios + gastos + mensualidades (todo sin IVA)
  const subtotal = montoHoras + totalGastos + totalMensualidades;
  
  // IVA: solo de servicios por hora + IVA extraído de mensualidades
  // IMPORTANTE: Los gastos NO llevan IVA porque total_cobro ya es el monto final
  const ivaServicios = montoHoras * ivaPerc;
  const iva = ivaServicios + totalIVAMensualidades;
  
  // Total: subtotal + IVA
  const total = subtotal + iva;

  // Redondear todos los valores a 2 decimales para evitar errores de punto flotante
  return {
    totalHoras: Math.round(totalHoras * 100) / 100,
    montoHoras: Math.round(montoHoras * 100) / 100,
    totalGastos: Math.round(totalGastos * 100) / 100,
    totalMensualidades: Math.round(totalMensualidades * 100) / 100,
    subtotal: Math.round(subtotal * 100) / 100,
    iva: Math.round(iva * 100) / 100,
    total: Math.round(total * 100) / 100
  };
}

export async function GET(request: NextRequest) {
  // Rate limiting: 100 requests per hour
  const rateLimitResponse = await checkStandardRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    // Obtener fecha actual (puede ser simulada)
    const { searchParams } = new URL(request.url);
    const simulatedDate = searchParams.get('simulatedDate');
    const now = await getCurrentDateCR(simulatedDate);
    
    // Calcular mes actual y mes anterior
    const mesActualYear = now.getFullYear();
    const mesActualMonth = now.getMonth() + 1;
    const { inicioMes: inicioMesActual, finMes: finMesActual } = getRangoMes(mesActualYear, mesActualMonth);
    const mesActualStr = `${mesActualYear}-${String(mesActualMonth).padStart(2, '0')}`;
    
    const { year: mesAnteriorYear, month: mesAnteriorMonth, mesPago } = getMesAnterior(now);
    const { inicioMes: inicioMesAnterior, finMes: finMesAnterior } = getRangoMes(mesAnteriorYear, mesAnteriorMonth);
    
    const deudas: DeudaCliente[] = [];
    
    // Obtener todos los usuarios
    const { data: usuarios } = await supabase
      .from('usuarios')
      .select('id, nombre, cedula, iva_perc, modoPago');
    
    // Obtener todas las empresas
    const { data: empresas } = await supabase
      .from('empresas')
      .select('id, nombre, cedula, tarifa_hora, iva_perc, modoPago');
    
    // Obtener grupos de empresas
    const { data: grupos } = await supabase
      .from('grupos_empresas' as any)
      .select(`
        id,
        nombre,
        empresa_principal_id,
        miembros:grupos_empresas_miembros(empresa_id)
      `);
    
    // Crear mapa de empresa a grupo
    const empresaGrupoMap = new Map<string, { grupoId: string; grupoNombre: string; esPrincipal: boolean }>();
    if (grupos) {
      grupos.forEach((g: any) => {
        // Marcar empresa principal
        empresaGrupoMap.set(g.empresa_principal_id, {
          grupoId: g.id,
          grupoNombre: g.nombre,
          esPrincipal: true
        });
        // Marcar empresas miembros
        (g.miembros || []).forEach((m: any) => {
          if (!empresaGrupoMap.has(m.empresa_id)) {
            empresaGrupoMap.set(m.empresa_id, {
              grupoId: g.id,
              grupoNombre: g.nombre,
              esPrincipal: false
            });
          }
        });
      });
    }
    
    // Procesar usuarios y empresas EN PARALELO para mejorar performance
    const clientesPromises = [
      ...(usuarios || []).map(async (usuario) => {
        const tarifaHora = 90000;
        const ivaPerc = usuario.iva_perc || 0.13;
        
        const [datosAnterior, datosActual] = await Promise.all([
          getDatosClienteMes(usuario.id, 'usuario', inicioMesAnterior, finMesAnterior, tarifaHora, ivaPerc),
          getDatosClienteMes(usuario.id, 'usuario', inicioMesActual, finMesActual, tarifaHora, ivaPerc)
        ]);
        
        if (datosAnterior.total > 0 || datosActual.total > 0) {
          return {
            id: usuario.id,
            nombre: usuario.nombre,
            cedula: usuario.cedula || '',
            tipo: 'usuario' as const,
            tarifa_hora: tarifaHora,
            iva_perc: ivaPerc,
            mesAnterior: { mes: mesPago, ...datosAnterior },
            mesActual: { mes: mesActualStr, ...datosActual }
          };
        }
        return null;
      }),
      ...(empresas || []).map(async (empresa) => {
        const tarifaHora = (empresa as any).tarifa_hora || 90000;
        const ivaPerc = (empresa as any).iva_perc || 0.13;
        const grupoInfo = empresaGrupoMap.get(empresa.id);
        
        const [datosAnterior, datosActual] = await Promise.all([
          getDatosClienteMes(empresa.id, 'empresa', inicioMesAnterior, finMesAnterior, tarifaHora, ivaPerc),
          getDatosClienteMes(empresa.id, 'empresa', inicioMesActual, finMesActual, tarifaHora, ivaPerc)
        ]);
        
        if (datosAnterior.total > 0 || datosActual.total > 0) {
          return {
            id: empresa.id,
            nombre: (empresa as any).nombre,
            cedula: (empresa as any).cedula || '',
            tipo: 'empresa' as const,
            grupoId: grupoInfo?.grupoId,
            grupoNombre: grupoInfo?.grupoNombre,
            esGrupoPrincipal: grupoInfo?.esPrincipal,
            tarifa_hora: tarifaHora,
            iva_perc: ivaPerc,
            mesAnterior: { mes: mesPago, ...datosAnterior },
            mesActual: { mes: mesActualStr, ...datosActual }
          };
        }
        return null;
      })
    ];
    
    const resultados = await Promise.all(clientesPromises);
    deudas.push(...resultados.filter(d => d !== null) as DeudaCliente[]);
    
    // Ordenar: primero grupos (por nombre de grupo), luego empresas sin grupo, luego usuarios
    deudas.sort((a, b) => {
      // Primero ordenar por tipo
      if (a.tipo !== b.tipo) {
        return a.tipo === 'empresa' ? -1 : 1;
      }
      // Si ambos son empresa, ordenar por grupo
      if (a.tipo === 'empresa' && b.tipo === 'empresa') {
        if (a.grupoNombre && !b.grupoNombre) return -1;
        if (!a.grupoNombre && b.grupoNombre) return 1;
        if (a.grupoNombre && b.grupoNombre) {
          if (a.grupoNombre !== b.grupoNombre) {
            return a.grupoNombre.localeCompare(b.grupoNombre);
          }
          // Dentro del mismo grupo, principal primero
          if (a.esGrupoPrincipal && !b.esGrupoPrincipal) return -1;
          if (!a.esGrupoPrincipal && b.esGrupoPrincipal) return 1;
        }
      }
      // Finalmente por nombre
      return a.nombre.localeCompare(b.nombre);
    });
    
    // Calcular totales generales
    const totales = {
      mesAnterior: {
        mes: mesPago,
        totalHoras: 0,
        montoHoras: 0,
        totalGastos: 0,
        totalMensualidades: 0,
        subtotal: 0,
        iva: 0,
        total: 0
      },
      mesActual: {
        mes: mesActualStr,
        totalHoras: 0,
        montoHoras: 0,
        totalGastos: 0,
        totalMensualidades: 0,
        subtotal: 0,
        iva: 0,
        total: 0
      }
    };
    
    deudas.forEach(d => {
      totales.mesAnterior.totalHoras += d.mesAnterior.totalHoras;
      totales.mesAnterior.montoHoras += d.mesAnterior.montoHoras;
      totales.mesAnterior.totalGastos += d.mesAnterior.totalGastos;
      totales.mesAnterior.totalMensualidades += d.mesAnterior.totalMensualidades;
      totales.mesAnterior.subtotal += d.mesAnterior.subtotal;
      totales.mesAnterior.iva += d.mesAnterior.iva;
      totales.mesAnterior.total += d.mesAnterior.total;
      
      totales.mesActual.totalHoras += d.mesActual.totalHoras;
      totales.mesActual.montoHoras += d.mesActual.montoHoras;
      totales.mesActual.totalGastos += d.mesActual.totalGastos;
      totales.mesActual.totalMensualidades += d.mesActual.totalMensualidades;
      totales.mesActual.subtotal += d.mesActual.subtotal;
      totales.mesActual.iva += d.mesActual.iva;
      totales.mesActual.total += d.mesActual.total;
    });
    
    // Redondear totales finales
    totales.mesAnterior.totalHoras = Math.round(totales.mesAnterior.totalHoras * 100) / 100;
    totales.mesAnterior.montoHoras = Math.round(totales.mesAnterior.montoHoras * 100) / 100;
    totales.mesAnterior.totalGastos = Math.round(totales.mesAnterior.totalGastos * 100) / 100;
    totales.mesAnterior.totalMensualidades = Math.round(totales.mesAnterior.totalMensualidades * 100) / 100;
    totales.mesAnterior.subtotal = Math.round(totales.mesAnterior.subtotal * 100) / 100;
    totales.mesAnterior.iva = Math.round(totales.mesAnterior.iva * 100) / 100;
    totales.mesAnterior.total = Math.round(totales.mesAnterior.total * 100) / 100;
    
    totales.mesActual.totalHoras = Math.round(totales.mesActual.totalHoras * 100) / 100;
    totales.mesActual.montoHoras = Math.round(totales.mesActual.montoHoras * 100) / 100;
    totales.mesActual.totalGastos = Math.round(totales.mesActual.totalGastos * 100) / 100;
    totales.mesActual.totalMensualidades = Math.round(totales.mesActual.totalMensualidades * 100) / 100;
    totales.mesActual.subtotal = Math.round(totales.mesActual.subtotal * 100) / 100;
    totales.mesActual.iva = Math.round(totales.mesActual.iva * 100) / 100;
    totales.mesActual.total = Math.round(totales.mesActual.total * 100) / 100;
    
    return NextResponse.json({
      success: true,
      deudas,
      totales,
      fechaActual: now.toISOString().split('T')[0]
    });
    
  } catch (error) {
    console.error('Error en deudas-clientes:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor', details: String(error) },
      { status: 500 }
    );
  }
}
