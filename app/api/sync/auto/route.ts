import { NextRequest, NextResponse } from 'next/server';
import { SyncService } from '../../../../lib/syncService';

// Esta ruta puede ser llamada por un cron job externo (ej. Vercel Cron, GitHub Actions)
export async function POST(request: NextRequest) {
  try {
    // Verificar que la request viene de una fuente autorizada
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.CRON_SECRET_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🕐 Ejecutando sincronización automática programada');
    
    // Ejecutar sincronización bidireccional
    const result = await SyncService.syncBidirectional();
    
    // Log del resultado
    console.log(`📊 Resultado sincronización automática: ${result.message}`);
    
    return NextResponse.json({
      success: result.success,
      message: result.message,
      timestamp: new Date().toISOString(),
      type: 'scheduled-sync'
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