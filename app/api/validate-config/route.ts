import { NextResponse } from 'next/server';
import { SyncService } from '../../../lib/syncService';

export async function GET() {
  try {
    const validation = await SyncService.validateConfiguration();
    return NextResponse.json(validation);
  } catch (error) {
    return NextResponse.json(
      { valid: false, issues: [`Error validating configuration: ${error}`] },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // Método de prueba para leer algunos datos
    const testResult = await SyncService.testRead();
    return NextResponse.json(testResult);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: `Error in test: ${error}` },
      { status: 500 }
    );
  }
}