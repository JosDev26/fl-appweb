import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth, isCronAuthConfigured } from '@/lib/cron-auth';

// Esta ruta puede ser llamada por un cron job externo (ej. Vercel Cron, GitHub Actions)
export async function POST(request: NextRequest) {
  try {
    // Auth: CRON_SECRET (Vercel Cron) o CRON_SECRET_TOKEN (GitHub Actions).
    // En producción sin token -> 401 (fail-closed).
    const unauthorized = validateCronAuth(request);
    if (unauthorized) return unauthorized;

    console.log('🕐 Ejecutando sincronización automática programada');
    
    // Obtener la URL base desde el request o desde variables de entorno
    const host = request.headers.get('host')
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`
    
    console.log(`📍 Base URL: ${baseUrl}`)
    
    const results: any = {
      timestamp: new Date().toISOString(),
      syncs: []
    }

    // Lista de endpoints a sincronizar en orden (respetando dependencias FK)
    // Orden: tablas sin dependencias primero, luego las que dependen de ellas
    const syncEndpoints = [
      // 1. Tablas base sin dependencias
      { name: 'Usuarios', url: `${baseUrl}/api/sync-usuarios` },
      { name: 'Empresas', url: `${baseUrl}/api/sync-empresas` },
      { name: 'Contactos', url: `${baseUrl}/api/sync-contactos` },
      { name: 'Materias', url: `${baseUrl}/api/sync-materias` },
      { name: 'Funcionarios', url: `${baseUrl}/api/sync-funcionarios` },
      { name: 'Historial_Reportes', url: `${baseUrl}/api/sync-historial-reportes` },
      { name: 'Lista_Servicios', url: `${baseUrl}/api/sync-lista-servicios` }, // Catálogo de servicios
      
      // 2. Tablas que dependen de usuarios/empresas
      { name: 'Casos', url: `${baseUrl}/api/sync-casos` }, // FK: id_cliente, materia
      { name: 'Solicitudes', url: `${baseUrl}/api/sync-solicitudes` }, // FK: id_cliente, materia
      { name: 'Ingresos', url: `${baseUrl}/api/sync-ingresos` }, // FK: id_cliente
      
      // 3. Tablas que dependen de casos/solicitudes
      { name: 'Trabajos_Por_Hora', url: `${baseUrl}/api/sync-control-horas` }, // FK: caso_asignado, responsable, solicitante
      { name: 'Gastos', url: `${baseUrl}/api/sync-gastos` }, // FK: id_cliente, id_responsable, id_caso
      { name: 'Actualizaciones', url: `${baseUrl}/api/sync-actualizaciones` }, // FK: id_solicitud
      { name: 'Clicks_Etapa', url: `${baseUrl}/api/sync-clicks-etapa` }, // FK: id_solicitud
      { name: 'Servicios_Profesionales', url: `${baseUrl}/api/sync-servicios-profesionales` } // FK: id_caso, id_cliente, id_responsable, id_servicio
    ]

    // Ejecutar sincronizaciones secuencialmente
    for (const endpoint of syncEndpoints) {
      try {
        console.log(`📊 Sincronizando ${endpoint.name}...`)
        const response = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        })

        const data = await response.json()
        
        results.syncs.push({
          table: endpoint.name,
          success: response.ok,
          status: response.status,
          stats: data.stats || {},
          message: data.message || ''
        })

        if (response.ok) {
          console.log(`✅ ${endpoint.name} sincronizado exitosamente`)
        } else {
          console.error(`❌ Error sincronizando ${endpoint.name}:`, data)
        }
      } catch (error) {
        console.error(`❌ Error en ${endpoint.name}:`, error)
        results.syncs.push({
          table: endpoint.name,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    const successCount = results.syncs.filter((s: any) => s.success).length
    const totalCount = results.syncs.length
    
    // Log del resultado
    console.log(`📊 Resultado sincronización automática: ${successCount}/${totalCount} exitosas`);
    
    return NextResponse.json({
      success: successCount === totalCount,
      message: `Sincronización completada: ${successCount}/${totalCount} tablas sincronizadas`,
      timestamp: new Date().toISOString(),
      type: 'scheduled-sync',
      results
    });

  } catch (error) {
    console.error('❌ Error en sincronización automática:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        timestamp: new Date().toISOString(),
        type: 'scheduled-sync'
      },
      { status: 500 }
    );
  }
}

// Endpoint GET para verificar el estado del servicio
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Servicio de sincronización automática activo',
    timestamp: new Date().toISOString(),
    cronAuthConfigurado: isCronAuthConfigured(),
    endpoints: {
      manual_sync: '/api/sync',
      auto_sync: '/api/sync/auto',
      stats: '/api/sync (GET)'
    }
  });
}