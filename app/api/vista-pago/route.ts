import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentDateCR, getMesAnterior, getRangoMes } from "@/lib/dateUtils";
import { checkStandardRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Tipos de modalidad de pago para clasificación
type TipoModalidad = 'Mensualidad' | 'Etapa Finalizada' | 'Único Pago' | 'Cobro por hora' | 'Solo gastos-servicios';

// Interfaz para proyectos con modalidad Mensualidad
interface ProyectoMensualidad {
  id: string;
  titulo: string;
  costoNeto: number;        // Sin IVA
  montoIva: number;         // IVA
  totalProyecto: number;    // Con IVA (total_a_pagar)
  cantidadCuotas: number;
  montoPorCuota: number;
  montoPagado: number;
  saldoPendiente: number;
}

interface ClienteVistaPago {
  id: string;
  nombre: string;
  cedula: string;
  tipo: 'usuario' | 'empresa';
  tipoModalidad: TipoModalidad;
  modoPago: boolean;
  fechaActivacionModoPago: string | null;
  
  // Grupo info
  grupoId?: string;
  grupoNombre?: string;
  esGrupoPrincipal?: boolean;
  
  // Payment data
  mes: string;
  totalHoras: number;
  montoHoras: number;
  tarifaHora: number;
  totalGastos: number;
  totalServiciosProfesionales: number;
  totalMensualidades: number;
  subtotal: number;
  ivaPerc: number;
  iva: number;
  total: number;
  
  // Internal notes
  notaInterna?: string;
  
  // Detalle de trabajos y gastos
  trabajosPorHora?: any[];
  gastos?: any[];
  serviciosProfesionales?: any[];
  solicitudes?: any[];
  
  // Proyectos con modalidad Mensualidad
  proyectos?: ProyectoMensualidad[];
}

// Determinar el tipo de modalidad de pago basado en las solicitudes
function determinarTipoModalidad(solicitudes: any[], tieneGastos: boolean, tieneTrabajos: boolean): TipoModalidad {
  // Primero revisar si hay solicitudes con modalidades específicas
  if (solicitudes && solicitudes.length > 0) {
    const modalidades = solicitudes.map(s => (s.modalidad_pago || '').toLowerCase());
    
    // Prioridad: Mensualidad > Etapa Finalizada > Único Pago > Cobro por hora
    if (modalidades.some(m => m.includes('mensualidad'))) {
      return 'Mensualidad';
    }
    if (modalidades.some(m => m.includes('etapa'))) {
      return 'Etapa Finalizada';
    }
    if (modalidades.some(m => m.includes('único') || m.includes('unico'))) {
      return 'Único Pago';
    }
    if (modalidades.some(m => m.includes('hora'))) {
      return 'Cobro por hora';
    }
  }
  
  // Si no hay solicitudes o las solicitudes no tienen modalidad definida,
  // determinar por la presencia de trabajos y gastos
  if (tieneTrabajos) {
    return 'Cobro por hora';
  }
  
  if (tieneGastos) {
    return 'Solo gastos-servicios';
  }
  
  // Por defecto
  return 'Solo gastos-servicios';
}

// Calcular mes a mostrar basado en fecha de activación
function calcularMesAMostrar(
  fechaActivacion: string | null,
  fechaActual: Date
): { year: number; month: number; mesPago: string } {
  const mesActual = fechaActual.getMonth() + 1; // 1-12
  const yearActual = fechaActual.getFullYear();
  
  if (fechaActivacion) {
    const fechaAct = new Date(fechaActivacion);
    const mesActivacion = fechaAct.getMonth() + 1;
    const yearActivacion = fechaAct.getFullYear();
    
    // Si se activó en el mes actual, mostrar mes anterior
    if (mesActivacion === mesActual && yearActivacion === yearActual) {
      // Retroceder un mes
      let mesAnterior = mesActual - 1;
      let yearAnterior = yearActual;
      if (mesAnterior === 0) {
        mesAnterior = 12;
        yearAnterior = yearActual - 1;
      }
      return {
        year: yearAnterior,
        month: mesAnterior,
        mesPago: `${yearAnterior}-${String(mesAnterior).padStart(2, '0')}`
      };
    }
  }
  
  // Por defecto, mostrar mes anterior
  return getMesAnterior(fechaActual);
}

// Extraer proyectos con modalidad Mensualidad de las solicitudes
function extraerProyectosMensualidad(solicitudes: any[]): ProyectoMensualidad[] {
  if (!solicitudes || solicitudes.length === 0) return [];
  
  return solicitudes
    .filter(s => {
      const modalidad = (s.modalidad_pago || '').toLowerCase();
      return modalidad.includes('mensualidad');
    })
    .map(s => ({
      id: s.id,
      titulo: s.titulo || 'Sin título',
      costoNeto: parseFloat(s.costo_neto) || 0,
      montoIva: parseFloat(s.monto_iva) || 0,
      totalProyecto: parseFloat(s.total_a_pagar) || 0,
      cantidadCuotas: parseInt(s.cantidad_cuotas) || 0,
      montoPorCuota: parseFloat(s.monto_por_cuota) || 0,
      montoPagado: parseFloat(s.monto_pagado) || 0,
      saldoPendiente: parseFloat(s.saldo_pendiente) || 0
    }));
}

// Obtener datos de pago de un cliente
async function getDatosCliente(
  clienteId: string,
  tipo: 'usuario' | 'empresa',
  inicioMes: string,
  finMes: string
): Promise<{
  trabajosPorHora: any[];
  gastos: any[];
  serviciosProfesionales: any[];
  solicitudes: any[];
  tarifaHora: number;
  ivaPerc: number;
  nombre: string;
  cedula: string;
  notaInterna: string | null;
}> {
  let tarifaHora = 90000;
  let ivaPerc = 0.13;
  let nombre = '';
  let cedula = '';
  let notaInterna: string | null = null;
  
  if (tipo === 'empresa') {
    // Query sin nota_interna_pago para compatibilidad (la columna puede no existir aún)
    const { data: empresaData } = await supabase
      .from('empresas')
      .select('nombre, cedula, tarifa_hora, iva_perc')
      .eq('id', clienteId)
      .maybeSingle();
    
    if (empresaData) {
      nombre = (empresaData as any).nombre || '';
      cedula = (empresaData as any).cedula || '';
      tarifaHora = (empresaData as any).tarifa_hora || 90000;
      ivaPerc = (empresaData as any).iva_perc || 0.13;
    }
    
    // Intentar obtener nota_interna_pago por separado (puede fallar si no existe la columna)
    try {
      const { data: notaData } = await supabase
        .from('empresas')
        .select('nota_interna_pago')
        .eq('id', clienteId)
        .maybeSingle();
      if (notaData) {
        notaInterna = (notaData as any).nota_interna_pago || null;
      }
    } catch (e) {
      // Columna no existe aún, ignorar
    }
    
    // Obtener casos de la empresa
    const { data: casos } = await supabase
      .from('casos')
      .select('id')
      .eq('id_cliente', clienteId);
    
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
      .select(`id, producto, fecha, total_cobro, estado_pago, funcionarios:id_responsable (nombre)`)
      .eq('id_cliente', clienteId)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false });
    
    // Obtener servicios profesionales (NO cancelados)
    const { data: serviciosProfesionalesEmpresa } = await supabase
      .from('servicios_profesionales' as any)
      .select('*')
      .eq('id_cliente', clienteId)
      .neq('estado_pago', 'cancelado')
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false });
    
    // Fetch related data separately (no FK constraints exist)
    let serviciosConRelaciones: any[] = serviciosProfesionalesEmpresa || [];
    if (serviciosProfesionalesEmpresa && serviciosProfesionalesEmpresa.length > 0) {
      const serviciosData = serviciosProfesionalesEmpresa as any[];
      const funcionariosIds = [...new Set(serviciosData.map(s => s.id_responsable).filter(Boolean))];
      const serviciosIds = [...new Set(serviciosData.map(s => s.id_servicio).filter(Boolean))];
      
      const [funcionariosRes, serviciosRes] = await Promise.all([
        funcionariosIds.length > 0
          ? supabase.from('funcionarios').select('id, nombre').in('id', funcionariosIds)
          : Promise.resolve({ data: [] }),
        serviciosIds.length > 0
          ? supabase.from('lista_servicios' as any).select('id, titulo').in('id', serviciosIds)
          : Promise.resolve({ data: [] })
      ]);
      
      const funcionariosMap = new Map(((funcionariosRes.data || []) as any[]).map(f => [f.id, f]));
      const serviciosMap = new Map(((serviciosRes.data || []) as any[]).map(s => [s.id, s]));
      
      serviciosConRelaciones = serviciosData.map(servicio => ({
        ...servicio,
        funcionarios: servicio.id_responsable ? funcionariosMap.get(servicio.id_responsable) : null,
        lista_servicios: servicio.id_servicio ? serviciosMap.get(servicio.id_servicio) : null
      }));
    }
    
    // Obtener solicitudes
    const { data: solicitudes } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('id_cliente', clienteId);
    
    return {
      trabajosPorHora: trabajosPorHora || [],
      gastos: gastos || [],
      serviciosProfesionales: serviciosConRelaciones,
      solicitudes: solicitudes || [],
      tarifaHora,
      ivaPerc,
      nombre,
      cedula,
      notaInterna
    };
  } else {
    // Usuario - Query sin nota_interna_pago para compatibilidad
    const { data: usuarioData } = await supabase
      .from('usuarios')
      .select('nombre, cedula, iva_perc')
      .eq('id', clienteId)
      .maybeSingle();
    
    if (usuarioData) {
      nombre = (usuarioData as any).nombre || '';
      cedula = (usuarioData as any).cedula || '';
      ivaPerc = (usuarioData as any).iva_perc || 0.13;
    }
    
    // Intentar obtener nota_interna_pago por separado (puede fallar si no existe la columna)
    try {
      const { data: notaData } = await supabase
        .from('usuarios')
        .select('nota_interna_pago')
        .eq('id', clienteId)
        .maybeSingle();
      if (notaData) {
        notaInterna = (notaData as any).nota_interna_pago || null;
      }
    } catch (e) {
      // Columna no existe aún, ignorar
    }
    
    // Obtener trabajos por hora directamente
    const { data: trabajosPorHora } = await supabase
      .from('trabajos_por_hora')
      .select('*, casos!fk_caso(nombre, expediente)')
      .eq('id_cliente', clienteId)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false });
    
    // Obtener gastos
    const { data: gastos } = await supabase
      .from('gastos' as any)
      .select(`id, producto, fecha, total_cobro, estado_pago, funcionarios:id_responsable (nombre)`)
      .eq('id_cliente', clienteId)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false });
    
    // Obtener servicios profesionales (NO cancelados)
    const { data: serviciosProfesionalesUsuario } = await supabase
      .from('servicios_profesionales' as any)
      .select('*')
      .eq('id_cliente', clienteId)
      .neq('estado_pago', 'cancelado')
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false });
    
    // Fetch related data separately (no FK constraints exist)
    let serviciosConRelaciones: any[] = serviciosProfesionalesUsuario || [];
    if (serviciosProfesionalesUsuario && serviciosProfesionalesUsuario.length > 0) {
      const serviciosData = serviciosProfesionalesUsuario as any[];
      const funcionariosIds = [...new Set(serviciosData.map(s => s.id_responsable).filter(Boolean))];
      const serviciosIds = [...new Set(serviciosData.map(s => s.id_servicio).filter(Boolean))];
      
      const [funcionariosRes, serviciosRes] = await Promise.all([
        funcionariosIds.length > 0
          ? supabase.from('funcionarios').select('id, nombre').in('id', funcionariosIds)
          : Promise.resolve({ data: [] }),
        serviciosIds.length > 0
          ? supabase.from('lista_servicios' as any).select('id, titulo').in('id', serviciosIds)
          : Promise.resolve({ data: [] })
      ]);
      
      const funcionariosMap = new Map(((funcionariosRes.data || []) as any[]).map(f => [f.id, f]));
      const serviciosMap = new Map(((serviciosRes.data || []) as any[]).map(s => [s.id, s]));
      
      serviciosConRelaciones = serviciosData.map(servicio => ({
        ...servicio,
        funcionarios: servicio.id_responsable ? funcionariosMap.get(servicio.id_responsable) : null,
        lista_servicios: servicio.id_servicio ? serviciosMap.get(servicio.id_servicio) : null
      }));
    }
    
    // Obtener solicitudes
    const { data: solicitudes } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('id_cliente', clienteId);
    
    return {
      trabajosPorHora: trabajosPorHora || [],
      gastos: gastos || [],
      serviciosProfesionales: serviciosConRelaciones,
      solicitudes: solicitudes || [],
      tarifaHora,
      ivaPerc,
      nombre,
      cedula,
      notaInterna
    };
  }
}

// Calcular totales de un cliente
function calcularTotales(
  trabajosPorHora: any[],
  gastos: any[],
  serviciosProfesionales: any[],
  solicitudes: any[],
  tarifaHora: number,
  ivaPerc: number
): {
  totalMinutos: number;
  totalHoras: number;
  montoHoras: number;
  totalGastos: number;
  totalServiciosProfesionales: number;
  totalMensualidades: number;
  totalIVAMensualidades: number;
  subtotal: number;
  ivaServicios: number;
  iva: number;
  total: number;
  proyectos: ProyectoMensualidad[];
} {
  // Calcular horas
  let totalMinutos = 0;
  trabajosPorHora.forEach((t: any) => {
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
      totalMinutos += minutos;
    }
  });
  
  const totalHoras = totalMinutos / 60;
  const montoHoras = totalHoras * tarifaHora;
  
  // Calcular gastos (solo NO cancelados)
  const totalGastos = gastos
    .filter((g: any) => g.estado_pago !== 'cancelado')
    .reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);
  
  // Calcular total de servicios profesionales (el campo 'total' ya incluye todo)
  const totalServiciosProfesionales = serviciosProfesionales.reduce(
    (sum: number, s: any) => sum + (s.total || 0), 
    0
  );
  
  // Calcular mensualidades (solo las que son tipo mensualidad)
  let totalMensualidades = 0;
  let totalIVAMensualidades = 0;
  
  const solicitudesMensualidad = solicitudes.filter(s => 
    (s.modalidad_pago || '').toLowerCase().includes('mensualidad')
  );
  
  solicitudesMensualidad.forEach(s => {
    const montoCuota = s.monto_por_cuota || 0;
    if (s.se_cobra_iva) {
      const subtotalCuota = montoCuota / (1 + ivaPerc);
      totalMensualidades += subtotalCuota;
      totalIVAMensualidades += montoCuota - subtotalCuota;
    } else {
      totalMensualidades += montoCuota;
    }
  });
  
  // Calcular totales
  // NOTA: totalServiciosProfesionales ya es monto final (como gastos.total_cobro), no lleva IVA adicional
  const subtotal = montoHoras + totalGastos + totalMensualidades + totalServiciosProfesionales;
  const ivaServicios = montoHoras * ivaPerc;
  const iva = ivaServicios + totalIVAMensualidades;
  const total = subtotal + iva;
  
  // Extraer proyectos con modalidad Mensualidad
  const proyectos = extraerProyectosMensualidad(solicitudes);
  
  return {
    totalMinutos,
    totalHoras,
    montoHoras,
    totalGastos,
    totalServiciosProfesionales,
    totalMensualidades,
    totalIVAMensualidades,
    subtotal,
    ivaServicios,
    iva,
    total,
    proyectos
  };
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const rateLimitResponse = await checkStandardRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    // Obtener fecha simulada si se proporciona
    const { searchParams } = new URL(request.url);
    const simulatedDate = searchParams.get('simulatedDate');
    const now = await getCurrentDateCR(simulatedDate);
    
    // 1. Obtener todos los usuarios y empresas con modoPago activo
    // Nota: Solo incluimos columnas que seguro existen para compatibilidad
    const { data: usuarios, error: errUsuarios } = await supabase
      .from('usuarios')
      .select('id, nombre, cedula, modoPago, iva_perc')
      .eq('modoPago', true);
    
    const { data: empresas, error: errEmpresas } = await supabase
      .from('empresas')
      .select('id, nombre, cedula, modoPago, tarifa_hora, iva_perc')
      .eq('modoPago', true);
    
    if (errUsuarios || errEmpresas) {
      console.error('Error usuarios:', errUsuarios);
      console.error('Error empresas:', errEmpresas);
      throw new Error('Error obteniendo clientes');
    }
    
    // 2. Obtener grupos de empresas
    const { data: grupos } = await supabase
      .from('grupos_empresas' as any)
      .select(`
        id,
        nombre,
        empresa_principal_id,
        miembros:grupos_empresas_miembros(empresa_id)
      `);
    
    // Crear mapa de empresa -> grupo
    const empresaGrupoMap = new Map<string, { grupoId: string; grupoNombre: string; esPrincipal: boolean }>();
    (grupos || []).forEach((g: any) => {
      empresaGrupoMap.set(g.empresa_principal_id, {
        grupoId: g.id,
        grupoNombre: g.nombre,
        esPrincipal: true
      });
      (g.miembros || []).forEach((m: any) => {
        empresaGrupoMap.set(m.empresa_id, {
          grupoId: g.id,
          grupoNombre: g.nombre,
          esPrincipal: false
        });
      });
    });
    
    // 3. Procesar cada cliente
    const clientes: ClienteVistaPago[] = [];
    
    // Procesar usuarios
    for (const usuario of (usuarios || [])) {
      // fecha_activacion_modo_pago puede no existir, usar null como default
      const fechaActivacion = (usuario as any).fecha_activacion_modo_pago || null;
      const { year, month, mesPago } = calcularMesAMostrar(fechaActivacion, now);
      const { inicioMes, finMes } = getRangoMes(year, month);
      
      const datos = await getDatosCliente(
        (usuario as any).id,
        'usuario',
        inicioMes,
        finMes
      );
      
      const totales = calcularTotales(
        datos.trabajosPorHora,
        datos.gastos,
        datos.serviciosProfesionales,
        datos.solicitudes,
        datos.tarifaHora,
        datos.ivaPerc
      );
      
      const tipoModalidad = determinarTipoModalidad(
        datos.solicitudes,
        datos.gastos.length > 0 || datos.serviciosProfesionales.length > 0,
        datos.trabajosPorHora.length > 0
      );
      
      clientes.push({
        id: (usuario as any).id,
        nombre: datos.nombre || (usuario as any).nombre,
        cedula: datos.cedula || (usuario as any).cedula,
        tipo: 'usuario',
        tipoModalidad,
        modoPago: true,
        fechaActivacionModoPago: fechaActivacion,
        mes: mesPago,
        totalHoras: totales.totalHoras,
        montoHoras: totales.montoHoras,
        tarifaHora: datos.tarifaHora,
        totalGastos: totales.totalGastos,
        totalServiciosProfesionales: totales.totalServiciosProfesionales,
        totalMensualidades: totales.totalMensualidades,
        subtotal: totales.subtotal,
        ivaPerc: datos.ivaPerc,
        iva: totales.iva,
        total: totales.total,
        notaInterna: datos.notaInterna || undefined,
        trabajosPorHora: datos.trabajosPorHora,
        gastos: datos.gastos,
        serviciosProfesionales: datos.serviciosProfesionales,
        solicitudes: datos.solicitudes,
        proyectos: totales.proyectos
      });
    }
    
    // Procesar empresas
    for (const empresa of (empresas || [])) {
      // fecha_activacion_modo_pago puede no existir, usar null como default
      const fechaActivacion = (empresa as any).fecha_activacion_modo_pago || null;
      const { year, month, mesPago } = calcularMesAMostrar(fechaActivacion, now);
      const { inicioMes, finMes } = getRangoMes(year, month);
      
      const datos = await getDatosCliente(
        (empresa as any).id,
        'empresa',
        inicioMes,
        finMes
      );
      
      const totales = calcularTotales(
        datos.trabajosPorHora,
        datos.gastos,
        datos.serviciosProfesionales,
        datos.solicitudes,
        datos.tarifaHora,
        datos.ivaPerc
      );
      
      const tipoModalidad = determinarTipoModalidad(
        datos.solicitudes,
        datos.gastos.length > 0 || datos.serviciosProfesionales.length > 0,
        datos.trabajosPorHora.length > 0
      );
      
      const grupoInfo = empresaGrupoMap.get((empresa as any).id);
      
      clientes.push({
        id: (empresa as any).id,
        nombre: datos.nombre || (empresa as any).nombre,
        cedula: datos.cedula || (empresa as any).cedula,
        tipo: 'empresa',
        tipoModalidad,
        modoPago: true,
        fechaActivacionModoPago: fechaActivacion,
        grupoId: grupoInfo?.grupoId,
        grupoNombre: grupoInfo?.grupoNombre,
        esGrupoPrincipal: grupoInfo?.esPrincipal,
        mes: mesPago,
        totalHoras: totales.totalHoras,
        montoHoras: totales.montoHoras,
        tarifaHora: datos.tarifaHora,
        totalGastos: totales.totalGastos,
        totalServiciosProfesionales: totales.totalServiciosProfesionales,
        totalMensualidades: totales.totalMensualidades,
        subtotal: totales.subtotal,
        ivaPerc: datos.ivaPerc,
        iva: totales.iva,
        total: totales.total,
        notaInterna: datos.notaInterna || undefined,
        trabajosPorHora: datos.trabajosPorHora,
        gastos: datos.gastos,
        serviciosProfesionales: datos.serviciosProfesionales,
        solicitudes: datos.solicitudes,
        proyectos: totales.proyectos
      });
    }
    
    // 4. Ordenar clientes: por tipo modalidad, luego por grupo, luego por nombre
    clientes.sort((a, b) => {
      // Primero por tipo de modalidad
      const modalidadOrder: Record<TipoModalidad, number> = {
        'Mensualidad': 1,
        'Etapa Finalizada': 2,
        'Único Pago': 3,
        'Cobro por hora': 4,
        'Solo gastos-servicios': 5
      };
      if (modalidadOrder[a.tipoModalidad] !== modalidadOrder[b.tipoModalidad]) {
        return modalidadOrder[a.tipoModalidad] - modalidadOrder[b.tipoModalidad];
      }
      
      // Luego por tipo (empresas primero)
      if (a.tipo !== b.tipo) {
        return a.tipo === 'empresa' ? -1 : 1;
      }
      
      // Luego por grupo (empresas agrupadas juntas)
      if (a.tipo === 'empresa' && b.tipo === 'empresa') {
        if (a.grupoNombre && !b.grupoNombre) return -1;
        if (!a.grupoNombre && b.grupoNombre) return 1;
        if (a.grupoNombre && b.grupoNombre) {
          if (a.grupoNombre !== b.grupoNombre) {
            return a.grupoNombre.localeCompare(b.grupoNombre);
          }
          // Principal primero dentro del grupo
          if (a.esGrupoPrincipal && !b.esGrupoPrincipal) return -1;
          if (!a.esGrupoPrincipal && b.esGrupoPrincipal) return 1;
        }
      }
      
      // Finalmente por nombre
      return a.nombre.localeCompare(b.nombre);
    });
    
    // 5. Calcular totales generales por tipo de modalidad
    const totalesPorModalidad: Record<TipoModalidad, {
      count: number;
      totalHoras: number;
      montoHoras: number;
      totalGastos: number;
      totalMensualidades: number;
      subtotal: number;
      iva: number;
      total: number;
    }> = {
      'Mensualidad': { count: 0, totalHoras: 0, montoHoras: 0, totalGastos: 0, totalMensualidades: 0, subtotal: 0, iva: 0, total: 0 },
      'Etapa Finalizada': { count: 0, totalHoras: 0, montoHoras: 0, totalGastos: 0, totalMensualidades: 0, subtotal: 0, iva: 0, total: 0 },
      'Único Pago': { count: 0, totalHoras: 0, montoHoras: 0, totalGastos: 0, totalMensualidades: 0, subtotal: 0, iva: 0, total: 0 },
      'Cobro por hora': { count: 0, totalHoras: 0, montoHoras: 0, totalGastos: 0, totalMensualidades: 0, subtotal: 0, iva: 0, total: 0 },
      'Solo gastos-servicios': { count: 0, totalHoras: 0, montoHoras: 0, totalGastos: 0, totalMensualidades: 0, subtotal: 0, iva: 0, total: 0 }
    };
    
    let granTotal = {
      count: 0,
      totalHoras: 0,
      montoHoras: 0,
      totalGastos: 0,
      totalMensualidades: 0,
      subtotal: 0,
      iva: 0,
      total: 0
    };
    
    clientes.forEach(c => {
      const t = totalesPorModalidad[c.tipoModalidad];
      t.count++;
      t.totalHoras += c.totalHoras;
      t.montoHoras += c.montoHoras;
      t.totalGastos += c.totalGastos;
      t.totalMensualidades += c.totalMensualidades;
      t.subtotal += c.subtotal;
      t.iva += c.iva;
      t.total += c.total;
      
      granTotal.count++;
      granTotal.totalHoras += c.totalHoras;
      granTotal.montoHoras += c.montoHoras;
      granTotal.totalGastos += c.totalGastos;
      granTotal.totalMensualidades += c.totalMensualidades;
      granTotal.subtotal += c.subtotal;
      granTotal.iva += c.iva;
      granTotal.total += c.total;
    });
    
    // 6. Calcular totales por grupo
    const totalesPorGrupo: Record<string, {
      grupoNombre: string;
      empresas: string[];
      totalHoras: number;
      montoHoras: number;
      totalGastos: number;
      totalMensualidades: number;
      subtotal: number;
      iva: number;
      total: number;
    }> = {};
    
    clientes.filter(c => c.grupoId).forEach(c => {
      if (!totalesPorGrupo[c.grupoId!]) {
        totalesPorGrupo[c.grupoId!] = {
          grupoNombre: c.grupoNombre!,
          empresas: [],
          totalHoras: 0,
          montoHoras: 0,
          totalGastos: 0,
          totalMensualidades: 0,
          subtotal: 0,
          iva: 0,
          total: 0
        };
      }
      const g = totalesPorGrupo[c.grupoId!];
      g.empresas.push(c.nombre);
      g.totalHoras += c.totalHoras;
      g.montoHoras += c.montoHoras;
      g.totalGastos += c.totalGastos;
      g.totalMensualidades += c.totalMensualidades;
      g.subtotal += c.subtotal;
      g.iva += c.iva;
      g.total += c.total;
    });
    
    return NextResponse.json({
      success: true,
      clientes,
      totalesPorModalidad,
      totalesPorGrupo,
      granTotal,
      fechaConsulta: now.toISOString()
    });
    
  } catch (error: any) {
    console.error('Error en vista-pago:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error desconocido' },
      { status: 500 }
    );
  }
}

// PATCH: Actualizar nota interna de un cliente
export async function PATCH(request: NextRequest) {
  const rateLimitResponse = await checkStandardRateLimit(request);
  if (rateLimitResponse) return rateLimitResponse;

  // Constants for validation
  const MAX_NOTE_LENGTH = 2000;
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  // Sanitize function to remove HTML/script tags and dangerous content
  const sanitizeNote = (input: string): string => {
    if (!input) return '';
    return input
      // Remove HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove script content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Remove event handlers
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
      // Remove javascript: protocol
      .replace(/javascript:/gi, '')
      // Remove data: protocol (potential XSS vector)
      .replace(/data:/gi, '')
      // Normalize whitespace
      .trim();
  };

  try {
    const body = await request.json();
    const { clienteId, tipo, nota } = body;
    
    // Validate required fields
    if (!clienteId || !tipo) {
      return NextResponse.json(
        { success: false, error: 'clienteId y tipo son requeridos' },
        { status: 400 }
      );
    }
    
    // Validate clienteId format (should be UUID or valid ID)
    if (typeof clienteId !== 'string' || clienteId.length > 100) {
      return NextResponse.json(
        { success: false, error: 'clienteId inválido' },
        { status: 400 }
      );
    }
    
    // Validate tipo
    if (tipo !== 'usuario' && tipo !== 'empresa') {
      return NextResponse.json(
        { success: false, error: 'tipo debe ser "usuario" o "empresa"' },
        { status: 400 }
      );
    }
    
    // Validate and sanitize nota
    let sanitizedNota: string | null = null;
    
    if (nota !== null && nota !== undefined && nota !== '') {
      // Check type
      if (typeof nota !== 'string') {
        return NextResponse.json(
          { success: false, error: 'nota debe ser una cadena de texto' },
          { status: 400 }
        );
      }
      
      // Check length before processing
      if (nota.length > MAX_NOTE_LENGTH) {
        return NextResponse.json(
          { success: false, error: `La nota excede el límite de ${MAX_NOTE_LENGTH} caracteres` },
          { status: 400 }
        );
      }
      
      // Sanitize the note content
      sanitizedNota = sanitizeNote(nota);
      
      // Check if sanitized version is still too long (shouldn't happen but safety check)
      if (sanitizedNota.length > MAX_NOTE_LENGTH) {
        sanitizedNota = sanitizedNota.substring(0, MAX_NOTE_LENGTH);
      }
      
      // If note becomes empty after sanitization, set to null
      if (sanitizedNota.trim() === '') {
        sanitizedNota = null;
      }
    }
    
    const tabla = tipo === 'usuario' ? 'usuarios' : 'empresas';
    
    // Usar 'as any' para el campo nota_interna_pago que puede no estar en los tipos generados
    const { error } = await supabase
      .from(tabla as any)
      .update({ nota_interna_pago: sanitizedNota } as any)
      .eq('id', clienteId);
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      message: 'Nota actualizada correctamente'
    });
    
  } catch (error: any) {
    console.error('Error actualizando nota:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error actualizando nota' },
      { status: 500 }
    );
  }
}
