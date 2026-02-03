import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getCurrentDateCR, getMesAnterior, getRangoMes } from "@/lib/dateUtils";
import { cookies } from 'next/headers';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

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
    
    // Obtener gastos del mes actual
    const { data: gastosMesActual, error: errorGastos } = await supabase
      .from('gastos' as any)
      .select(`id, producto, fecha, total_cobro, estado_pago, funcionarios:id_responsable (nombre)`)
      .eq('id_cliente', cliente.id)
      .gte('fecha', inicioMes)
      .lte('fecha', finMes)
      .order('fecha', { ascending: false });
    
    // Obtener gastos pendientes de meses anteriores
    const { data: gastosPendientesAnteriores, error: errorGastosAnt } = await supabase
      .from('gastos' as any)
      .select(`id, producto, fecha, total_cobro, estado_pago, funcionarios:id_responsable (nombre)`)
      .eq('id_cliente', cliente.id)
      .eq('estado_pago', 'pendiente')
      .lt('fecha', inicioMes)
      .gte('fecha', fechaLimite12MesesStr)
      .order('fecha', { ascending: false });
    
    // Calcular totales
    const totalGastosMesActual = (gastosMesActual || [])
      .filter((g: any) => g.estado_pago !== 'cancelado')
      .reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);
    
    const totalGastosPendientesAnteriores = (gastosPendientesAnteriores || [])
      .reduce((sum: number, g: any) => sum + (g.total_cobro || 0), 0);
    
    const ivaPerc = cliente.iva_perc ?? 0.13;
    const subtotalGastos = totalGastosMesActual + totalGastosPendientesAnteriores;
    
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
        tarifaHora: cliente.tarifa_hora || 90000,
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
      resumen: {
        "📋 Gastos Mes Actual": totalGastosMesActual,
        "⚠️ Gastos Meses Anteriores (pendientes)": totalGastosPendientesAnteriores,
        "📊 Subtotal Gastos": subtotalGastos,
        "✅ TOTAL INCLUYE ANTERIORES": totalGastosPendientesAnteriores > 0 ? "SÍ - Los gastos de meses anteriores están incluidos" : "N/A (no hay gastos pendientes anteriores)"
      },
      debug: {
        queryGastosMes: `id_cliente='${cliente.id}' AND fecha >= '${inicioMes}' AND fecha <= '${finMes}'`,
        queryGastosAnteriores: `id_cliente='${cliente.id}' AND estado_pago='pendiente' AND fecha < '${inicioMes}' AND fecha >= '${fechaLimite12MesesStr}'`
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
