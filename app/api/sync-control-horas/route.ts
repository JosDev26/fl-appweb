import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { GoogleSheetsService } from '@/lib/googleSheets'
import { getTableMapping } from '@/lib/sync-config'

export async function POST(request: NextRequest) {
  try {
    console.log('⏰ Iniciando sincronización de Control de Horas...')
    
    // Importar googleapis
    const { google } = await import('googleapis');
    
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    // Leer toda la hoja Control_Horas
    const sheetResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Control_Horas!A:K',
    });

    const rows = sheetResponse.data.values || [];
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No hay datos para sincronizar',
        stats: { inserted: 0, updated: 0, deleted: 0, errors: 0 }
      });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);
    
    console.log('📋 Headers encontrados:', headers);
    
    // Encontrar índices de columnas
    const idTareaIdx = headers.indexOf('ID_Tarea');
    const idCasoIdx = headers.indexOf('ID_Caso');
    const idClienteIdx = headers.indexOf('ID_Cliente');
    const idEmpresaIdx = headers.indexOf('ID_Empresa');
    const idResponsableIdx = headers.indexOf('ID_Responsable');
    const idSolicitanteIdx = headers.indexOf('ID_Solicitante'); // Sin "s" al final
    const tituloTareaIdx = headers.indexOf('Título_Tarea'); // Con tilde en Í
    const descripcionIdx = headers.indexOf('Descripcion');
    const fechaIdx = headers.indexOf('Fecha');
    const duracionIdx = headers.indexOf('Duracion');
    
    console.log('📊 Índices de columnas:', {
      idTareaIdx,
      idCasoIdx,
      idClienteIdx,
      idEmpresaIdx,
      idResponsableIdx,
      idSolicitanteIdx,
      tituloTareaIdx,
      descripcionIdx,
      fechaIdx,
      duracionIdx
    });
    
    // Procesar datos
    const transformedData = dataRows.map((row, index) => {
      // Determinar id_cliente: preferir ID_Empresa si existe, sino usar ID_Cliente
      let id_cliente = null;
      if (idEmpresaIdx !== -1 && row[idEmpresaIdx]) {
        id_cliente = String(row[idEmpresaIdx]).trim();
      } else if (idClienteIdx !== -1 && row[idClienteIdx]) {
        id_cliente = String(row[idClienteIdx]).trim();
      }
      
      // Transformar fecha de formato DD/MM/YYYY a YYYY-MM-DD
      let fecha = null;
      if (fechaIdx !== -1 && row[fechaIdx]) {
        const fechaStr = String(row[fechaIdx]);
        if (fechaStr.includes('-')) {
          fecha = fechaStr;
        } else if (fechaStr.includes('/')) {
          const parts = fechaStr.split('/');
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            fecha = `${year}-${month}-${day}`;
          }
        }
      }
      
      const item = {
        id: idTareaIdx !== -1 ? String(row[idTareaIdx] || '').trim() : '',
        caso_asignado: idCasoIdx !== -1 && row[idCasoIdx] ? String(row[idCasoIdx]).trim() : null,
        responsable: idResponsableIdx !== -1 && row[idResponsableIdx] ? String(row[idResponsableIdx]).trim() : null,
        solicitante: idSolicitanteIdx !== -1 && row[idSolicitanteIdx] ? String(row[idSolicitanteIdx]).trim() : null,
        id_cliente,
        titulo: tituloTareaIdx !== -1 && row[tituloTareaIdx] ? String(row[tituloTareaIdx]).trim() : null,
        descripcion: descripcionIdx !== -1 && row[descripcionIdx] ? String(row[descripcionIdx]).trim() : null,
        fecha,
        duracion: duracionIdx !== -1 && row[duracionIdx] ? String(row[duracionIdx]).trim() : null
      };
      
      return item;
    }).filter(item => item.id !== '');

    console.log(`� Datos procesados:`, transformedData.length, 'registros');
    if (transformedData.length > 0) {
      console.log(`📋 Primer registro:`, transformedData[0]);
    }

    // Obtener trabajos existentes
    const { data: existingTrabajos, error: fetchError } = await supabase
      .from('trabajos_por_hora')
      .select('*')

    if (fetchError) throw fetchError

    // Crear mapas para comparación
    const existingMap = new Map((existingTrabajos || []).map((trab: any) => [trab.id, trab]))
    const newIdSet = new Set(transformedData.map((trab: any) => trab.id))
    
    let inserted = 0, updated = 0, deleted = 0, errors = 0
    const errorDetails: any[] = []

    // Eliminar registros que ya no están en Sheets
    for (const existing of existingTrabajos || []) {
      if (existing.id && !newIdSet.has(existing.id)) {
        const { error } = await supabase
          .from('trabajos_por_hora')
          .delete()
          .eq('id', existing.id)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'delete', id: existing.id, error: error.message })
        } else {
          deleted++
        }
      }
    }

    // Insertar o actualizar registros
    for (const trabajo of transformedData) {
      const existing = existingMap.get(trabajo.id)
      
      if (existing) {
        // Actualizar si existe
        const { error } = await supabase
          .from('trabajos_por_hora')
          .update({
            caso_asignado: trabajo.caso_asignado,
            responsable: trabajo.responsable,
            solicitante: trabajo.solicitante,
            id_cliente: trabajo.id_cliente,
            titulo: trabajo.titulo,
            descripcion: trabajo.descripcion,
            fecha: trabajo.fecha,
            duracion: trabajo.duracion,
            updated_at: new Date().toISOString()
          })
          .eq('id', trabajo.id)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'update', id: trabajo.id, error: error.message })
        } else {
          updated++
        }
      } else {
        // Insertar si no existe
        const { error } = await supabase
          .from('trabajos_por_hora')
          .insert(trabajo)
        
        if (error) {
          errors++
          errorDetails.push({ action: 'insert', id: trabajo.id, error: error.message })
        } else {
          inserted++
        }
      }
    }

    console.log(`✅ Sincronización completada: ${inserted} insertados, ${updated} actualizados, ${deleted} eliminados, ${errors} errores`)
    
    return NextResponse.json({
      success: true,
      message: 'Sincronización de Control de Horas exitosa',
      stats: { inserted, updated, deleted, errors },
      details: errorDetails.length > 0 ? errorDetails : undefined
    })
  } catch (error) {
    console.error('❌ Error al sincronizar Control de Horas:', error)
    return NextResponse.json(
      { 
        error: 'Error al sincronizar Control de Horas',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/sync-control-horas',
    method: 'POST',
    description: 'Sincroniza la hoja "Control_Horas" de Google Sheets con la tabla trabajos_por_hora en Supabase',
    usage: 'POST /api/sync-control-horas'
  })
}
