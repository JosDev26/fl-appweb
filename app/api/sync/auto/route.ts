import { NextRequest, NextResponse } from 'next/server';

// Esta ruta puede ser llamada por un cron job externo (ej. Vercel Cron, GitHub Actions)
export async function POST(request: NextRequest) {
  try {
    // Verificar que la request viene de una fuente autorizada
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET_TOKEN;
    
    // Si hay token configurado, verificarlo. Si no hay token, permitir acceso (desarrollo)
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🕐 Ejecutando sincronización automática programada');
    
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const results: any = {
      timestamp: new Date().toISOString(),
      syncs: []
    }

    // Lista de endpoints a sincronizar en orden
    const syncEndpoints = [
      { name: 'Clientes', url: `${baseUrl}/api/sync-clientes` },
      { name: 'Empresas', url: `${baseUrl}/api/sync-empresas` },
      { name: 'Contactos', url: `${baseUrl}/api/sync-contactos` },
      { name: 'Materias', url: `${baseUrl}/api/sync-materias` },
      { name: 'Funcionarios', url: `${baseUrl}/api/sync-funcionarios` },
      { name: 'Casos', url: `${baseUrl}/api/sync-casos` },
      { name: 'Control_Horas', url: `${baseUrl}/api/sync-control-horas` }
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
    endpoints: {
      manual_sync: '/api/sync',
      auto_sync: '/api/sync/auto',
      stats: '/api/sync (GET)'
    }
  });
}