import { NextRequest, NextResponse } from 'next/server';
import { SyncService } from '../../../lib/syncService';
import { checkSyncRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  // Rate limiting: 5 requests per minute per IP
  const rateLimitResponse = await checkSyncRateLimit(request)
  if (rateLimitResponse) return rateLimitResponse

  try {
    // Intentar parsear el body, si está vacío usar valores por defecto
    let direction = 'bidirectional';
    
    try {
      const body = await request.json();
      direction = body.direction || 'bidirectional';
    } catch (parseError) {
      // Si no hay body o está vacío, usar bidirectional por defecto
      console.log('No body provided, using bidirectional sync');
    }

    let result;

    switch (direction) {
      case 'usuarios-to-clientes':
        result = await SyncService.syncUsuariosToClientes();
        break;
      
      case 'clientes-to-usuarios':
        result = await SyncService.syncClientesToUsuarios();
        break;
      
      case 'bidirectional':
      default:
        result = await SyncService.syncBidirectional();
        break;
    }

    return NextResponse.json(result, { 
      status: result.success ? 200 : 500 
    });

  } catch (error) {
    console.error('Error in sync API:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}` 
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const stats = await SyncService.getStats();
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error getting sync stats:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: `Error: ${error instanceof Error ? error.message : 'Error desconocido'}` 
      },
      { status: 500 }
    );
  }
}