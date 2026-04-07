import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentDateCR, getMesAnterior, getRangoMes } from "@/lib/dateUtils";
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Only log in development
const isDev = process.env.NODE_ENV === 'development';

// ============================================================================
// FUNCIÓN AUXILIAR: Obtener datos de una empresa específica
// ============================================================================
async function getDatosEmpresa(
  empresaId: string, 
  inicioMes: string, 
  finMes: string,
  fechaLimite12MesesStr: string
): Promise<{
  trabajosPorHora: any[];
  trabajosPendientesAnteriores: any[];
  gastos: any[];
  gastosPendientesAnteriores: any[];
  solicitudes: any[];
  serviciosProfesionales: any[];
  serviciosPendientesAnteriores: any[];
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
  let trabajosPendientesAnteriores: any[] = [];
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

    // Trabajos por hora pendientes de meses anteriores
    const { data: tphAnt } = await supabase
      .from('trabajos_por_hora')
      .select('*, casos!fk_caso(nombre, expediente)')
      .in('caso_asignado', casoIds)
      .eq('estado_pago', 'pendiente')
      .lt('fecha', inicioMes)
      .gte('fecha', fechaLimite12MesesStr)
      .order('fecha', { ascending: false });
    trabajosPendientesAnteriores = tphAnt || [];
  }

  // Obtener gastos
  const { data: gastos } = await supabase
    .from('gastos' as any)
    .select('id, producto, fecha, total_cobro, estado_pago, id_responsable')
    .eq('id_cliente', empresaId)
    .gte('fecha', inicioMes)
    .lte('fecha', finMes)
    .order('fecha', { ascending: false });

  // Obtener gastos pendientes de meses anteriores
  const { data: gastosPendientesAnteriores } = await supabase
    .from('gastos' as any)
    .select('id, producto, fecha, total_cobro, estado_pago, id_responsable')
    .eq('id_cliente', empresaId)
    .eq('estado_pago', 'pendiente')
    .lt('fecha', inicioMes)
    .gte('fecha', fechaLimite12MesesStr)
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
    .select('id, id_caso, id_servicio, id_responsable, fecha, costo, gastos, iva, total, estado_pago')
    .eq('id_cliente', empresaId)
    .neq('estado_pago', 'cancelado')
    .gte('fecha', inicioMes)
    .lte('fecha', finMes)
    .order('fecha', { ascending: false });

  // Obtener servicios profesionales pendientes de meses anteriores
  const { data: serviciosPendientesAnteriores } = await supabase
    .from('servicios_profesionales' as any)
    .select('id, id_caso, id_servicio, id_responsable, fecha, costo, gastos, iva, total, estado_pago')
    .eq('id_cliente', empresaId)
    .eq('estado_pago', 'pendiente')
    .lt('fecha', inicioMes)
    .gte('fecha', fechaLimite12MesesStr)
    .order('fecha', { ascending: false });

  return {
    trabajosPorHora: trabajosPorHora || [],
    trabajosPendientesAnteriores: trabajosPendientesAnteriores || [],
    gastos: gastos || [],
    gastosPendientesAnteriores: gastosPendientesAnteriores || [],
    solicitudes: solicitudes || [],
    serviciosProfesionales: serviciosProfesionales || [],
    serviciosPendientesAnteriores: serviciosPendientesAnteriores || [],
    empresa: empresaData ? {
      nombre: (empresaData as any).nombre,
      tarifa_hora: (empresaData as any).tarifa_hora || 90000,
      iva_perc: (empresaData as any).iva_perc ?? 0.13
    } : null
  };
}

// ============================================================================
// VERIFICACIÓN DE SESIÓN DE ADMIN (dev-auth)
// Solo usuarios con sesión activa en /dev pueden acceder a este endpoint
// ============================================================================
async function verifyDevSession(request: NextRequest): Promise<{ 
  valid: boolean; 
  admin?: { id: string; email: string; name: string }; 
  error?: string 
}> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('dev-auth')?.value;
    const adminId = cookieStore.get('dev-admin-id')?.value;
    
    // Verificación 1: Cookies presentes
    if (!sessionToken || !adminId) {
      return { valid: false, error: 'No hay sesión activa. Inicie sesión en /dev' };
    }
    
    // Verificación 2: Token tiene formato correcto (64 caracteres hex)
    if (!/^[a-f0-9]{64}$/i.test(sessionToken)) {
      return { valid: false, error: 'Token de sesión inválido' };
    }
    
    // Verificación 3: AdminId tiene formato UUID válido
    if (!/^[a-f0-9-]{36}$/i.test(adminId)) {
      return { valid: false, error: 'ID de admin inválido' };
    }
    
    // Verificación 4: Buscar sesión en base de datos
    const { data: session, error: sessionError } = await supabase
      .from('dev_sessions')
      .select('*, dev_admins(*)')
      .eq('session_token', sessionToken)
      .eq('admin_id', adminId)
      .eq('is_active', true)
      .single();
    
    if (sessionError || !session) {
      return { valid: false, error: 'Sesión no encontrada o inactiva' };
    }
    
    // Verificación 5: Sesión no expirada
    const now = new Date();
    const expiresAt = new Date(session.expires_at);
    if (now > expiresAt) {
      // Desactivar sesión expirada
      await supabase
        .from('dev_sessions')
        .update({ is_active: false })
        .eq('id', session.id);
      return { valid: false, error: 'Sesión expirada. Inicie sesión nuevamente.' };
    }
    
    // Verificación 6: Admin sigue activo
    if (!session.dev_admins || !session.dev_admins.is_active) {
      return { valid: false, error: 'Usuario admin desactivado' };
    }
    
    // Verificación 7: IP match (opcional pero recomendado)
    const currentIP = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    // Solo advertir si cambia, no bloquear (puede cambiar legítimamente)
    const ipChanged = session.ip_address !== currentIP && session.ip_address !== 'unknown';
    
    // Verificación 8: Generar hash de verificación adicional
    const verificationHash = crypto
      .createHash('sha256')
      .update(`${sessionToken}:${adminId}:${session.created_at}`)
      .digest('hex')
      .substring(0, 16);
    
    // Log de acceso para auditoría
    console.log(`[DEBUG-API] Acceso autorizado: admin=${session.dev_admins.email}, ip=${currentIP}, ipChanged=${ipChanged}`);
    
    return { 
      valid: true, 
      admin: {
        id: session.dev_admins.id,
        email: session.dev_admins.email,
        name: session.dev_admins.name
      }
    };
    
  } catch (error: any) {
    console.error('[DEBUG-API] Error verificando sesión:', error);
    return { valid: false, error: 'Error interno de autenticación' };
  }
}

// Endpoint para verificar datos de pago de un cliente específico
// Uso: GET /api/debug-vista-pago?nombre=Natalia
//      GET /api/debug-vista-pago?cedula=503180434
//      GET /api/debug-vista-pago?id=5a7b0357
export async function GET(request: NextRequest) {
  // ===== VERIFICACIÓN DE AUTENTICACIÓN OBLIGATORIA =====
  const authResult = await verifyDevSession(request);
  if (!authResult.valid) {
    return NextResponse.json({
      error: 'Acceso denegado',
      message: authResult.error,
      requiresAuth: true,
      loginUrl: '/dev/login'
    }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const nombreBuscar = searchParams.get('nombre') || '';
  const clienteId = searchParams.get('id') || '';
  const cedulaBuscar = searchParams.get('cedula') || '';
  
  if (!nombreBuscar && !clienteId && !cedulaBuscar) {
    return NextResponse.json({
      error: 'Debe proporcionar ?nombre=xxx, ?id=xxx o ?cedula=xxx',
      ejemplo: '/api/debug-vista-pago?nombre=Natalia o /api/debug-vista-pago?cedula=503180434'
    }, { status: 400 });
  }
  
  try {
    let cliente: { id: string; nombre: string; tipo: 'usuario' | 'empresa'; iva_perc?: number; tarifa_hora?: number; modo_pago?: boolean } | null = null;
    
    // Nota: La columna es "modoPago" no "modo_pago" en la BD
    
    // Buscar en usuarios
    const { data: usuarios, error: errUsuarios } = await supabase
      .from('usuarios')
      .select('id, nombre, iva_perc, modoPago, cedula')
      .or([
        clienteId ? `id.ilike.%${clienteId}%` : null,
        cedulaBuscar ? `cedula.ilike.%${cedulaBuscar}%` : null,
        nombreBuscar ? `nombre.ilike.%${nombreBuscar}%` : null
      ].filter(Boolean).join(','))
      .limit(10);
    
    // Buscar en empresas
    const { data: empresas, error: errEmpresas } = await supabase
      .from('empresas')
      .select('id, nombre, iva_perc, tarifa_hora, modoPago, cedula')
      .or([
        clienteId ? `id.ilike.%${clienteId}%` : null,
        cedulaBuscar ? `cedula.ilike.%${cedulaBuscar}%` : null,
        nombreBuscar ? `nombre.ilike.%${nombreBuscar}%` : null
      ].filter(Boolean).join(','))
      .limit(10);
    
    // Tomar el primer resultado
    if (usuarios && usuarios.length > 0) {
      const usr = usuarios[0] as any;
      cliente = {
        id: usr.id,
        nombre: usr.nombre,
        tipo: 'usuario',
        iva_perc: usr.iva_perc,
        modo_pago: usr.modoPago
      };
    } else if (empresas && empresas.length > 0) {
      const emp = empresas[0] as any;
      cliente = {
        id: emp.id,
        nombre: emp.nombre,
        tipo: 'empresa',
        iva_perc: emp.iva_perc,
        tarifa_hora: emp.tarifa_hora,
        modo_pago: emp.modoPago
      };
    }
    
    if (!cliente) {
      return NextResponse.json({
        error: 'Cliente no encontrado',
        busqueda: { nombre: nombreBuscar, cedula: cedulaBuscar, id: clienteId },
        debug: {
          erroresQuery: {
            usuarios: errUsuarios?.message,
            empresas: errEmpresas?.message
          },
          usuariosEncontrados: usuarios || [],
          empresasEncontradas: empresas || [],
          nota: "Intenta buscar de otra forma o verifica que el cliente exista"
        }
      }, { status: 404 });
    }
    
    // ===== CLIENTE ENCONTRADO - OBTENER DATOS DE PAGO =====
    
    const now = await getCurrentDateCR();
    const { year, month } = getMesAnterior(now);
    const { inicioMes, finMes } = getRangoMes(year, month);
    const mesPago = new Date(year, month - 1).toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });
    
    // Fecha límite 12 meses atrás
    const fechaLimite12Meses = new Date(year, month - 12, 1);
    const fechaLimite12MesesStr = fechaLimite12Meses.toISOString().split('T')[0];
    
    const ivaPerc = cliente.iva_perc ?? 0.13;
    const tarifaHora = cliente.tarifa_hora || 90000;

    // ========== VERIFICAR SI ES LÍDER DE UN GRUPO DE EMPRESAS ==========
    let esGrupoPrincipal = false;
    let grupoInfo: { id: string; nombre: string } | null = null;
    let empresasDelGrupo: { id: string; nombre: string; iva_perc: number }[] = [];
    
    if (cliente.tipo === 'empresa') {
      const { data: grupo } = await supabase
        .from('grupos_empresas' as any)
        .select(`
          id,
          nombre,
          miembros:grupos_empresas_miembros(empresa_id)
        `)
        .eq('empresa_principal_id', cliente.id)
        .maybeSingle();

      if (grupo) {
        esGrupoPrincipal = true;
        grupoInfo = { id: (grupo as any).id, nombre: (grupo as any).nombre };
        // Obtener info de las empresas miembros
        const empresaIds = ((grupo as any).miembros || []).map((m: any) => m.empresa_id);
        if (empresaIds.length > 0) {
          const { data: empresasInfo } = await supabase
            .from('empresas')
            .select('id, nombre, iva_perc, tarifa_hora, modoPago')
            .in('id', empresaIds);
          empresasDelGrupo = (empresasInfo || []).map((e: any) => ({
            id: e.id,
            nombre: e.nombre,
            iva_perc: e.iva_perc ?? 0.13,
            tarifa_hora: e.tarifa_hora || 90000,
            modoPago: e.modoPago ?? false
          }));
        }
      }
    }

    // ========== TRABAJOS POR HORA ==========
    let trabajosPorHora: any[] = [];
    let trabajosPendientesAnteriores: any[] = [];
    if (cliente.tipo === 'usuario') {
      const { data } = await supabase
        .from('trabajos_por_hora')
        .select('*, casos!fk_caso(nombre, expediente)')
        .eq('id_cliente', cliente.id)
        .gte('fecha', inicioMes)
        .lte('fecha', finMes)
        .order('fecha', { ascending: false });
      trabajosPorHora = data || [];

      // Trabajos por hora pendientes de meses anteriores
      const { data: tphAnt } = await supabase
        .from('trabajos_por_hora')
        .select('*, casos!fk_caso(nombre, expediente)')
        .eq('id_cliente', cliente.id)
        .eq('estado_pago', 'pendiente')
        .lt('fecha', inicioMes)
        .gte('fecha', fechaLimite12MesesStr)
        .order('fecha', { ascending: false });
      trabajosPendientesAnteriores = tphAnt || [];
    } else {
      // Para empresas, buscar casos de la empresa y luego sus trabajos
      const { data: casos } = await supabase
        .from('casos')
        .select('id')
        .eq('id_cliente', cliente.id);

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

        // Trabajos por hora pendientes de meses anteriores
        const { data: tphAnt } = await supabase
          .from('trabajos_por_hora')
          .select('*, casos!fk_caso(nombre, expediente)')
          .in('caso_asignado', casoIds)
          .eq('estado_pago', 'pendiente')
          .lt('fecha', inicioMes)
          .gte('fecha', fechaLimite12MesesStr)
          .order('fecha', { ascending: false });
        trabajosPendientesAnteriores = tphAnt || [];
      }
    }

    // Calcular total minutos y horas
    let totalMinutos = 0;
    trabajosPorHora.forEach((t: any) => {
      if (t.duracion) {
        if (t.duracion.includes(':')) {
          const [h, m] = t.duracion.split(':').map(Number);
          totalMinutos += (h * 60) + m;
        } else {
          totalMinutos += Math.round(parseFloat(t.duracion) * 60);
        }
      }
    });
    const totalHoras = totalMinutos / 60;
    const costoServicios = totalHoras * tarifaHora;

    // Calcular carry-forward de trabajos por hora
    let totalMinutosTPHAnteriores = 0;
    trabajosPendientesAnteriores.forEach((t: any) => {
      if (t.duracion) {
        if (t.duracion.includes(':')) {
          const [h, m] = t.duracion.split(':').map(Number);
          totalMinutosTPHAnteriores += (h * 60) + m;
        } else {
          totalMinutosTPHAnteriores += Math.round(parseFloat(t.duracion) * 60);
        }
      }
    });
    const totalHorasTPHAnteriores = totalMinutosTPHAnteriores / 60;
    const montoTPHAnteriores = totalHorasTPHAnteriores * tarifaHora;

    // ========== GASTOS ==========
    const { data: gastosMesActual, error: errorGastos } = await supabase
      .from('gastos' as any)
      .select(`id, producto, fecha, total_cobro, estado_pago, funcionarios:id_responsable (nombre)`)
      .eq('id_cliente', cliente.id)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false });
    
    const { data: gastosPendientesAnteriores, error: errorGastosAnt } = await supabase
      .from('gastos' as any)
      .select(`id, producto, fecha, total_cobro, estado_pago, funcionarios:id_responsable (nombre)`)
      .eq('id_cliente', cliente.id)
      .eq('estado_pago', 'pendiente')
      .lt('fecha', inicioMes)
      .gte('fecha', fechaLimite12MesesStr)
      .order('fecha', { ascending: false });
    
    const totalGastosMesActual = (gastosMesActual || [])
      .filter((g: any) => g.estado_pago !== 'cancelado')
      .reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);
    
    const totalGastosPendientesAnteriores = (gastosPendientesAnteriores || [])
      .reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);

    // ========== SERVICIOS PROFESIONALES ==========
    const { data: serviciosProfesionales } = await supabase
      .from('servicios_profesionales' as any)
      .select('id, id_caso, id_servicio, id_responsable, fecha, costo, gastos, iva, total, estado_pago')
      .eq('id_cliente', cliente.id)
      .neq('estado_pago', 'cancelado')
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false });
    
    const totalServiciosProfesionales = (serviciosProfesionales || [])
      .reduce((sum: number, s: any) => sum + (s.total || 0), 0);

    // ========== SERVICIOS PROFESIONALES PENDIENTES DE MESES ANTERIORES ==========
    const { data: serviciosPendientesAnteriores, error: errorServiciosAnt } = await supabase
      .from('servicios_profesionales' as any)
      .select('id, id_caso, id_servicio, id_responsable, fecha, costo, gastos, iva, total, estado_pago')
      .eq('id_cliente', cliente.id)
      .eq('estado_pago', 'pendiente')
      .lt('fecha', inicioMes)
      .gte('fecha', fechaLimite12MesesStr)
      .order('fecha', { ascending: false });
    
    const costoServiciosPendientesAnteriores = (serviciosPendientesAnteriores || [])
      .reduce((sum: number, s: any) => sum + (s.costo || 0), 0);
    const gastosServiciosPendientesAnteriores = (serviciosPendientesAnteriores || [])
      .reduce((sum: number, s: any) => sum + (s.gastos || 0), 0);
    const ivaServiciosPendientesAnterioresStored = (serviciosPendientesAnteriores || [])
      .reduce((sum: number, s: any) => sum + (s.iva || 0), 0);
    const totalServiciosPendientesAnteriores = costoServiciosPendientesAnteriores;

    // ========== SOLICITUDES / MENSUALIDADES ==========
    const { data: solicitudes } = await supabase
      .from('solicitudes')
      .select('*')
      .eq('id_cliente', cliente.id)
      .ilike('modalidad_pago', 'mensualidad');
    
    let totalMensualidades = 0;
    let totalIVAMensualidades = 0;
    (solicitudes || []).forEach((s: any) => {
      const montoCuota = s.monto_por_cuota || 0;
      if (s.se_cobra_iva) {
        const subtotalCuota = montoCuota / (1 + ivaPerc);
        totalMensualidades += subtotalCuota;
        totalIVAMensualidades += montoCuota - subtotalCuota;
      } else {
        totalMensualidades += montoCuota;
      }
    });

    // ========== CALCULAR TOTALES EMPRESA PRINCIPAL ==========
    const subtotalPrincipal = costoServicios + montoTPHAnteriores + totalGastosMesActual + totalGastosPendientesAnteriores + totalMensualidades + totalServiciosProfesionales + totalServiciosPendientesAnteriores + gastosServiciosPendientesAnteriores;
    const ivaServiciosPrincipal = costoServicios * ivaPerc;
    const ivaTPHAnterioresPrincipal = montoTPHAnteriores * ivaPerc;
    const ivaServiciosPendientesPrincipal = ivaServiciosPendientesAnterioresStored;
    const ivaTotalPrincipal = ivaServiciosPrincipal + ivaTPHAnterioresPrincipal + totalIVAMensualidades + ivaServiciosPendientesPrincipal;
    const totalPrincipal = subtotalPrincipal + ivaTotalPrincipal;

    // ========== DATOS DE EMPRESAS ASOCIADAS (GRUPOS) ==========
    interface DatosEmpresaGrupo {
      empresaId: string;
      empresaNombre: string;
      ivaPerc: number;
      tarifaHora: number;
      trabajosPorHora: any[];
      trabajosPendientesAnteriores: any[];
      totalHorasAnteriores: number;
      montoHorasAnteriores: number;
      gastos: any[];
      gastosPendientesAnteriores: any[];
      solicitudes: any[];
      serviciosProfesionales: any[];
      serviciosPendientesAnteriores: any[];
      totalMinutos: number;
      totalHoras: number;
      costoServicios: number;
      totalGastos: number;
      totalGastosPendientesAnteriores: number;
      totalServiciosProfesionales: number;
      totalServiciosPendientesAnteriores: number;
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
      for (const empresaAsociada of empresasDelGrupo) {
        const datosEmp = await getDatosEmpresa(empresaAsociada.id, inicioMes, finMes, fechaLimite12MesesStr);
        
        // Calcular totales para esta empresa
        let empTotalMinutos = 0;
        datosEmp.trabajosPorHora.forEach((t: any) => {
          if (t.duracion) {
            if (t.duracion.includes(':')) {
              const [h, m] = t.duracion.split(':').map(Number);
              empTotalMinutos += (h * 60) + m;
            } else {
              empTotalMinutos += Math.round(parseFloat(t.duracion) * 60);
            }
          }
        });
        
        const empTarifaHora = datosEmp.empresa?.tarifa_hora || 90000;
        const empIvaPerc = empresaAsociada.iva_perc;
        const empTotalHoras = empTotalMinutos / 60;
        const empCostoServicios = empTotalHoras * empTarifaHora;
        const empTotalGastos = datosEmp.gastos.reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);
        const empTotalGastosPendientesAnteriores = datosEmp.gastosPendientesAnteriores.reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);
        const empTotalServiciosProfesionales = datosEmp.serviciosProfesionales.reduce((sum: number, s: any) => sum + (s.total || 0), 0);
        const empCostoServiciosPendientes = datosEmp.serviciosPendientesAnteriores.reduce((sum: number, s: any) => sum + (s.costo || 0), 0);
        const empGastosServiciosPendientes = datosEmp.serviciosPendientesAnteriores.reduce((sum: number, s: any) => sum + (s.gastos || 0), 0);
        const empIvaServiciosPendientesStored = datosEmp.serviciosPendientesAnteriores.reduce((sum: number, s: any) => sum + (s.iva || 0), 0);
        const empTotalServiciosPendientesAnteriores = empCostoServiciosPendientes;
        
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
        
        // Calcular carry-forward de trabajos por hora de empresa asociada
        let empMinutosTPHAnteriores = 0;
        datosEmp.trabajosPendientesAnteriores.forEach((t: any) => {
          if (t.duracion) {
            if (t.duracion.includes(':')) {
              const [h, m] = t.duracion.split(':').map(Number);
              empMinutosTPHAnteriores += (h * 60) + m;
            } else {
              empMinutosTPHAnteriores += Math.round(parseFloat(t.duracion) * 60);
            }
          }
        });
        const empHorasTPHAnteriores = empMinutosTPHAnteriores / 60;
        const empMontoTPHAnteriores = empHorasTPHAnteriores * empTarifaHora;

        const empSubtotal = empCostoServicios + empMontoTPHAnteriores + empTotalGastos + empTotalGastosPendientesAnteriores + empTotalMensualidades + empTotalServiciosProfesionales + empTotalServiciosPendientesAnteriores + empGastosServiciosPendientes;
        const empIvaServicios = empCostoServicios * empIvaPerc;
        const empIvaTPHAnteriores = empMontoTPHAnteriores * empIvaPerc;
        const empIvaServiciosPendientes = empIvaServiciosPendientesStored;
        const empMontoIVA = empIvaServicios + empIvaTPHAnteriores + empTotalIVAMensualidades + empIvaServiciosPendientes;
        const empTotal = empSubtotal + empMontoIVA;
        
        datosEmpresasGrupo.push({
          empresaId: empresaAsociada.id,
          empresaNombre: empresaAsociada.nombre,
          ivaPerc: empIvaPerc,
          tarifaHora: empTarifaHora,
          trabajosPorHora: datosEmp.trabajosPorHora,
          trabajosPendientesAnteriores: datosEmp.trabajosPendientesAnteriores,
          totalHorasAnteriores: empHorasTPHAnteriores,
          montoHorasAnteriores: empMontoTPHAnteriores,
          gastos: datosEmp.gastos,
          gastosPendientesAnteriores: datosEmp.gastosPendientesAnteriores,
          serviciosProfesionales: datosEmp.serviciosProfesionales,
          serviciosPendientesAnteriores: datosEmp.serviciosPendientesAnteriores,
          solicitudes: datosEmp.solicitudes,
          totalMinutos: empTotalMinutos,
          totalHoras: empTotalHoras,
          costoServicios: empCostoServicios,
          totalGastos: empTotalGastos,
          totalGastosPendientesAnteriores: empTotalGastosPendientesAnteriores,
          totalServiciosProfesionales: empTotalServiciosProfesionales,
          totalServiciosPendientesAnteriores: empTotalServiciosPendientesAnteriores,
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
      }
    }

    // ========== GRAN TOTAL (Principal + Asociadas) ==========
    const granTotalSubtotal = subtotalPrincipal + totalGrupoSubtotal;
    const granTotalIVA = ivaTotalPrincipal + totalGrupoIVA;
    const granTotalAPagar = totalPrincipal + totalGrupoAPagar;

    // ========== DESGLOSE POR MES (para verificar feature de comprobantes por mes) ==========
    const mesYYYYMM = `${year}-${String(month).padStart(2, '0')}`
    const allItems: { tipo: string; fecha: string; monto: number }[] = []
    
    // Principal items
    for (const t of trabajosPorHora) {
      if (t.fecha) {
        const dur = t.duracion || '0'
        let mins = 0
        if (dur.includes(':')) { const [h, m] = dur.split(':').map(Number); mins = h * 60 + m; } 
        else { mins = Math.round(parseFloat(dur) * 60); }
        allItems.push({ tipo: 'TPH', fecha: t.fecha, monto: (mins / 60) * tarifaHora })
      }
    }
    for (const t of trabajosPendientesAnteriores) {
      if (t.fecha) {
        const dur = t.duracion || '0'
        let mins = 0
        if (dur.includes(':')) { const [h, m] = dur.split(':').map(Number); mins = h * 60 + m; } 
        else { mins = Math.round(parseFloat(dur) * 60); }
        allItems.push({ tipo: 'TPH-carryforward', fecha: t.fecha, monto: (mins / 60) * tarifaHora })
      }
    }
    for (const g of (gastosMesActual || []) as any[]) {
      if (g.fecha && g.estado_pago !== 'cancelado') allItems.push({ tipo: 'Gasto', fecha: g.fecha, monto: g.total_cobro || 0 })
    }
    for (const g of (gastosPendientesAnteriores || []) as any[]) {
      if (g.fecha) allItems.push({ tipo: 'Gasto-carryforward', fecha: g.fecha, monto: g.total_cobro || 0 })
    }
    for (const s of (serviciosProfesionales || []) as any[]) {
      if (s.fecha) allItems.push({ tipo: 'SP', fecha: s.fecha, monto: s.total || 0 })
    }
    for (const s of (serviciosPendientesAnteriores || []) as any[]) {
      if (s.fecha) allItems.push({ tipo: 'SP-carryforward', fecha: s.fecha, monto: s.total || 0 })
    }
    
    // Group by month
    const mesesMap = new Map<string, { items: typeof allItems; subtotal: number }>()
    for (const item of allItems) {
      const mes = item.fecha.substring(0, 7)
      if (!mesesMap.has(mes)) mesesMap.set(mes, { items: [], subtotal: 0 })
      const entry = mesesMap.get(mes)!
      entry.items.push(item)
      entry.subtotal += item.monto
    }
    
    // Query factura and comprobante status for all months
    const mesesKeys = Array.from(mesesMap.keys()).sort()
    const tipoCliente = cliente.tipo === 'usuario' ? 'usuario' : 'empresa'
    
    const { data: facturasMeses, error: factErr } = await supabase
      .from('invoice_payment_deadlines' as any)
      .select('mes_factura, estado_pago, file_path')
      .eq('client_id', cliente.id)
      .eq('client_type', tipoCliente)
      .in('mes_factura', mesesKeys)
    
    // Debug: also fetch ALL facturas for this client to diagnose mismatches
    const { data: todasFacturas } = await supabase
      .from('invoice_payment_deadlines' as any)
      .select('mes_factura, estado_pago, client_id, client_type')
      .eq('client_id', cliente.id)
    
    const { data: comprobantesMeses } = await supabase
      .from('payment_receipts' as any)
      .select('mes_pago, estado, monto_declarado, file_path, created_at')
      .eq('user_id', cliente.id)
      .eq('tipo_cliente', tipoCliente)
      .in('mes_pago', mesesKeys)
    
    const facturasMap = new Map((facturasMeses || []).map((f: any) => [f.mes_factura, f]))
    const comprobantesMap = new Map((comprobantesMeses || []).map((c: any) => [c.mes_pago, c]))
    
    const desglosePorMes = mesesKeys.map(mes => {
      const entry = mesesMap.get(mes)!
      const factura = facturasMap.get(mes)
      const comprobante = comprobantesMap.get(mes)
      const esMesActual = mes === mesYYYYMM
      return {
        mes,
        esMesActual,
        cantidadItems: entry.items.length,
        subtotal: Math.round(entry.subtotal),
        ivaEstimado: Math.round(entry.subtotal * ivaPerc),
        totalEstimado: Math.round(entry.subtotal * (1 + ivaPerc)),
        tiposItems: entry.items.reduce((acc: Record<string, number>, i) => {
          acc[i.tipo] = (acc[i.tipo] || 0) + 1; return acc
        }, {}),
        factura: factura ? { estado: factura.estado_pago, url: factura.file_path } : null,
        comprobante: comprobante ? { estado: comprobante.estado, monto: comprobante.monto_declarado, url: comprobante.file_path } : null,
        puedeSubirComprobante: !!factura && !comprobante
      }
    })

    return NextResponse.json({
      _auth: {
        accessedBy: authResult.admin?.email,
        accessedAt: new Date().toISOString()
      },
      cliente: {
        id: cliente.id,
        nombre: cliente.nombre,
        tipo: cliente.tipo,
        ivaPerc,
        tarifaHora,
        modoPago: cliente.modo_pago ?? false,
        avisoModoPago: !cliente.modo_pago ? "⚠️ Este cliente NO tiene modoPago activo, no aparecerá en /vista-pago" : "✅ Activo en modo pago"
      },
      periodo: {
        mesPago,
        inicioMes,
        finMes,
        fechaLimite12Meses: fechaLimite12MesesStr,
        fechaActual: now.toISOString().split('T')[0]
      },
      // ========== GRUPO DE EMPRESAS (si aplica) ==========
      grupoEmpresas: esGrupoPrincipal ? {
        esLider: true,
        grupoId: grupoInfo?.id,
        grupoNombre: grupoInfo?.nombre,
        cantidadEmpresasAsociadas: empresasDelGrupo.length,
        empresasAsociadas: empresasDelGrupo.map(e => ({ id: e.id, nombre: e.nombre, iva_perc: e.iva_perc })),
        avisoGrupo: `✅ Este cliente es LÍDER del grupo "${grupoInfo?.nombre}" con ${empresasDelGrupo.length} empresa(s) asociada(s). Los totales incluyen a todas las empresas.`
      } : {
        esLider: false,
        avisoGrupo: "ℹ️ Este cliente NO es líder de ningún grupo de empresas"
      },
      // ========== DATOS DE LA EMPRESA PRINCIPAL ==========
      empresaPrincipal: {
        trabajosPorHora: {
          cantidad: trabajosPorHora.length,
          totalMinutos,
          totalHoras: parseFloat(totalHoras.toFixed(2)),
          costoServicios,
          detalle: trabajosPorHora
        },
        trabajosPendientesAnteriores: {
          cantidad: trabajosPendientesAnteriores.length,
          totalMinutosTPHAnteriores,
          totalHorasTPHAnteriores: parseFloat(totalHorasTPHAnteriores.toFixed(2)),
          montoTPHAnteriores,
          detalle: trabajosPendientesAnteriores
        },
        gastosMesActual: {
          cantidad: (gastosMesActual || []).length,
          cantidadNoCancelados: (gastosMesActual || []).filter((g: any) => g.estado_pago !== 'cancelado').length,
          total: totalGastosMesActual,
          detalle: gastosMesActual || [],
          error: errorGastos?.message
        },
        gastosPendientesAnteriores: {
          cantidad: (gastosPendientesAnteriores || []).length,
          total: totalGastosPendientesAnteriores,
          detalle: gastosPendientesAnteriores || [],
          error: errorGastosAnt?.message
        },
        serviciosProfesionales: {
          cantidad: (serviciosProfesionales || []).length,
          total: totalServiciosProfesionales,
          detalle: serviciosProfesionales || []
        },
        serviciosPendientesAnteriores: {
          cantidad: (serviciosPendientesAnteriores || []).length,
          total: totalServiciosPendientesAnteriores,
          detalle: serviciosPendientesAnteriores || [],
          error: errorServiciosAnt?.message
        },
        solicitudesMensualidades: {
          cantidad: (solicitudes || []).length,
          totalMensualidades,
          totalIVAMensualidades,
          detalle: solicitudes || []
        },
        totalesPrincipal: {
          subtotal: subtotalPrincipal,
          ivaServicios: ivaServiciosPrincipal,
          ivaTotalPrincipal,
          total: totalPrincipal
        }
      },
      // ========== DATOS DE EMPRESAS ASOCIADAS (solo si es líder) ==========
      empresasAsociadasDetalle: esGrupoPrincipal ? datosEmpresasGrupo : null,
      totalesGrupo: esGrupoPrincipal ? {
        "📊 Subtotal Empresas Asociadas": totalGrupoSubtotal,
        "💰 IVA Empresas Asociadas": totalGrupoIVA,
        "💵 Total Empresas Asociadas": totalGrupoAPagar
      } : null,
      // ========== RESUMEN FINAL ==========
      resumenFinal: {
        "📋 Subtotal Empresa Principal": subtotalPrincipal,
        "📋 Subtotal Empresas Asociadas": esGrupoPrincipal ? totalGrupoSubtotal : 0,
        "📊 GRAN SUBTOTAL": granTotalSubtotal,
        "💰 IVA Total": granTotalIVA,
        "💵 GRAN TOTAL A PAGAR": granTotalAPagar,
        "ℹ️ Nota": esGrupoPrincipal 
          ? `Incluye ${empresasDelGrupo.length} empresa(s) asociada(s) al grupo "${grupoInfo?.nombre}"`
          : "Solo incluye datos de este cliente (no es líder de grupo)"
      },
      // ========== DESGLOSE POR MES (verificar feature comprobantes por mes) ==========
      desglosePorMes,
      debug: {
        queryGastosMes: `id_cliente='${cliente.id}' AND fecha >= '${inicioMes}' AND fecha <= '${finMes}'`,
        queryGastosAnteriores: `id_cliente='${cliente.id}' AND estado_pago='pendiente' AND fecha < '${inicioMes}' AND fecha >= '${fechaLimite12MesesStr}'`,
        queryServiciosAnteriores: `id_cliente='${cliente.id}' AND estado_pago='pendiente' AND fecha < '${inicioMes}' AND fecha >= '${fechaLimite12MesesStr}' (servicios_profesionales)`,
        queryTPHAnteriores: `estado_pago='pendiente' AND fecha < '${inicioMes}' AND fecha >= '${fechaLimite12MesesStr}' (trabajos_por_hora)`,
        esGrupoPrincipal,
        empresasEnGrupo: esGrupoPrincipal ? empresasDelGrupo.map(e => e.nombre) : [],
        facturasDebug: {
          clientId: cliente.id,
          tipoClienteQuery: tipoCliente,
          mesesBuscados: mesesKeys,
          facturasEncontradas: facturasMeses?.length || 0,
          facturasMeses: facturasMeses || [],
          todasFacturasCliente: todasFacturas || [],
          facturaError: factErr?.message || null
        }
      }
    });
    
  } catch (error: any) {
    return NextResponse.json({
      error: 'Error interno',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
