import { google } from 'googleapis';
import { SYNC_CONFIG, TableMapping, ColumnMapping } from './sync-config';

// Configuración de autenticación con Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

export interface SheetRow {
  [key: string]: string | number | boolean | null;
}

export class GoogleSheetsService {
  
  // 📖 Método genérico para leer un rango específico de una hoja
  static async getSheetData(sheetName: string, range: string): Promise<any[][]> {
    try {
      console.log(`📖 Leyendo rango ${range} de la hoja ${sheetName}...`);
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!${range}`,
      });

      return response.data.values || [];
    } catch (error) {
      console.error(`❌ Error leyendo rango ${range} de ${sheetName}:`, error);
      throw error;
    }
  }
  
  // 📖 Método genérico para leer cualquier hoja configurada
  static async readSheet(sheetName: string): Promise<any[]> {
    try {
      const config = SYNC_CONFIG.find(c => c.sheetsName === sheetName);
      if (!config) {
        throw new Error(`No configuration found for sheet: ${sheetName}`);
      }

      console.log(`📖 Leyendo datos de la hoja ${sheetName}...`);
      
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A:Z`, // Leer todas las columnas
      });

      const rows = response.data.values || [];
      if (rows.length === 0) return [];

      const headers = rows[0];
      const dataRows = rows.slice(1);

      console.log(`📋 Headers encontrados en ${sheetName}:`, headers);

      // Transformar datos usando la configuración
      const transformedData = dataRows.map((row, index) => {
        const item: any = {};
        
        config.columns.forEach(colConfig => {
          const sheetsIndex = headers.indexOf(colConfig.sheetsColumn);
          if (sheetsIndex !== -1) {
            let value = row[sheetsIndex];
            
            // Aplicar transformación si existe
            if (colConfig.transform) {
              try {
                value = colConfig.transform(value);
              } catch (transformError) {
                console.warn(`⚠️ Error transformando ${colConfig.sheetsColumn} en fila ${index + 2}:`, transformError);
                value = null;
              }
            }
            
            item[colConfig.supabaseColumn] = value;
          } else {
            if (colConfig.required) {
              console.warn(`⚠️ Columna requerida '${colConfig.sheetsColumn}' no encontrada en hoja ${sheetName}`);
            }
            item[colConfig.supabaseColumn] = null;
          }
        });

        return item;
      }).filter(item => {
        // Filtrar filas que no tienen el id (requerido) - puede ser id o id_sheets
        const idValue = item.id || item.id_sheets;
        const isValid = idValue != null && idValue !== '';
        if (!isValid) {
          console.warn(`⚠️ Fila filtrada por falta de ID:`, item);
        }
        return isValid;
      });

      console.log(`✅ Leídos ${transformedData.length} registros de ${sheetName}`);
      return transformedData;

    } catch (error) {
      console.error(`❌ Error leyendo hoja ${sheetName}:`, error);
      throw error;
    }
  }
  
  // 📖 Leer datos de la hoja Clientes (ignorando columnas G e I que son específicas de AppSheet)
  static async readClientes(): Promise<any[]> {
    return this.readSheet('Clientes');
  }
  
  // 📖 Leer datos de la hoja Empresas
  static async readEmpresas(): Promise<any[]> {
    return this.readSheet('Empresas');
  }

  // 📝 Escribir datos a la hoja Clientes (preservando columnas G e I de AppSheet)
  static async writeClientes(usuarios: any[]): Promise<void> {
    try {
      const config = SYNC_CONFIG.find(c => c.sheetsName === "Clientes");
      if (!config) {
        throw new Error("No configuration found for Clientes sheet");
      }

      console.log(`📝 Escribiendo ${usuarios.length} registros a hoja Clientes (preservando columnas G e I)...`);

      // Primero, leer los datos actuales para preservar las columnas G e I
      const currentResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Clientes!A:J',
      });

      const currentRows = currentResponse.data.values || [];
      const currentHeaders = currentRows.length > 0 ? currentRows[0] : [];
      
      console.log(`📋 Headers actuales en la hoja:`, currentHeaders);
      console.log(`📋 Preservando datos de columnas G e I para AppSheet`);

      // Crear un mapa de datos existentes por ID_Cliente para preservar columnas G e I
      const existingDataMap = new Map();
      if (currentRows.length > 1) {
        const idColumnIndex = currentHeaders.indexOf('ID_Cliente');
        if (idColumnIndex !== -1) {
          for (let i = 1; i < currentRows.length; i++) {
            const row = currentRows[i];
            const id = row[idColumnIndex];
            if (id) {
              existingDataMap.set(id, {
                columnG: row[6] || '', // Columna G (índice 6)
                columnI: row[8] || ''  // Columna I (índice 8)
              });
            }
          }
        }
      }

      // Crear headers en el orden correcto (A, B, C, D, E, F, G, H, I, J)
      const orderedHeaders = [
        'ID_Cliente',           // A
        'Nombre',               // B
        'Correo',               // C
        'Telefono',             // D
        'Tipo_Identificación',  // E
        'Identificacion',       // F
        currentHeaders[6] || 'AppSheet_G', // G (preservada)
        'Moneda',               // H
        currentHeaders[8] || 'AppSheet_I', // I (preservada)
        'Cuenta'                // J
      ];
      
      // Transformar datos de Supabase a formato de Sheets con columnas preservadas
      const rows = usuarios.map(usuario => {
        const preservedData = existingDataMap.get(usuario.id_sheets);
        
        return [
          usuario.id_sheets || '',                                                    // A
          usuario.nombre || '',                                                       // B
          usuario.correo || '',                                                       // C
          usuario.telefono || '',                                                     // D
          usuario.tipo_cedula || '',                                                  // E
          usuario.cedula || '',                                                       // F
          preservedData?.columnG || '',                                               // G (preservada)
          usuario.esDolar ? 'Dolares' : 'Colones',                                  // H
          preservedData?.columnI || '',                                               // I (preservada)
          usuario.estaRegistrado ? 'Y' : 'N'                                         // J
        ];
      });

      // Limpiar la hoja y escribir nuevos datos con estructura completa
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Clientes!A:J',
      });

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Clientes!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [orderedHeaders, ...rows],
        },
      });

      console.log(`✅ Datos escritos exitosamente a hoja Clientes`);
      console.log(`📋 Estructura: A=ID_Cliente, B=Nombre, C=Correo, D=Telefono, E=Tipo_ID, F=Identificacion, G=AppSheet(preservada), H=Moneda, I=AppSheet(preservada), J=Cuenta`);

    } catch (error) {
      console.error('❌ Error escribiendo a hoja Clientes:', error);
      throw error;
    }
  }

  // 🔄 Actualizar filas individuales sin afectar columnas G e I
  static async updateClienteRow(usuario: any, rowIndex: number): Promise<void> {
    try {
      console.log(`📝 Actualizando fila ${rowIndex} para usuario ${usuario.id_sheets} sin afectar columnas G e I...`);

      // Actualizar solo las columnas específicas, excluyendo G (7) e I (9)
      const updates = [
        { range: `Clientes!A${rowIndex}`, values: [[usuario.id_sheets || '']] },
        { range: `Clientes!B${rowIndex}`, values: [[usuario.nombre || '']] },
        { range: `Clientes!C${rowIndex}`, values: [[usuario.correo || '']] },
        { range: `Clientes!D${rowIndex}`, values: [[usuario.telefono || '']] },
        { range: `Clientes!E${rowIndex}`, values: [[usuario.tipo_cedula || '']] },
        { range: `Clientes!F${rowIndex}`, values: [[usuario.cedula || '']] },
        { range: `Clientes!H${rowIndex}`, values: [[usuario.esDolar ? 'Dolares' : 'Colones']] },
        { range: `Clientes!J${rowIndex}`, values: [[usuario.estaRegistrado ? 'Y' : 'N']] }
      ];

      // Ejecutar actualizaciones en lote
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: updates
        }
      });

      console.log(`✅ Fila ${rowIndex} actualizada preservando columnas G e I`);

    } catch (error) {
      console.error(`❌ Error actualizando fila ${rowIndex}:`, error);
      throw error;
    }
  }

  // 📊 Obtener estadísticas de la hoja Clientes
  static async getClientesStats(): Promise<number> {
    try {
      const data = await this.readClientes();
      return data.length;
    } catch (error) {
      console.error('Error obteniendo estadísticas de Clientes:', error);
      return 0;
    }
  }

  // 🔍 Verificar que la hoja Clientes existe y tiene los headers correctos
  static async validateClientesConfiguration(): Promise<{valid: boolean, issues: string[]}> {
    const issues: string[] = [];
    
    try {
      // Obtener información del spreadsheet
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheets = spreadsheet.data.sheets?.map((sheet: any) => sheet.properties.title) || [];

      // Verificar que la hoja Clientes existe
      if (!existingSheets.includes('Clientes')) {
        issues.push('❌ Hoja "Clientes" no encontrada');
        return { valid: false, issues };
      }

      // Verificar headers
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Clientes!1:1',
      });

      const headers = response.data.values?.[0] || [];
      const config = SYNC_CONFIG.find(c => c.sheetsName === "Clientes");
      
      if (config) {
        const expectedHeaders = config.columns.map(c => c.sheetsColumn);
        const missingHeaders = expectedHeaders.filter(h => !headers.includes(h));
        
        if (missingHeaders.length > 0) {
          issues.push(`⚠️ Hoja 'Clientes' no tiene estas columnas: ${missingHeaders.join(', ')}`);
        }

        // Mostrar headers encontrados vs esperados
        console.log('📋 Headers encontrados:', headers);
        console.log('📋 Headers esperados:', expectedHeaders);
      }

    } catch (error) {
      issues.push(`❌ Error accediendo al spreadsheet: ${error}`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  // 🔄 Método helper para obtener headers de la hoja
  static async getClientesHeaders(): Promise<string[]> {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Clientes!1:1',
      });

      return response.data.values?.[0] || [];
    } catch (error) {
      console.error('Error obteniendo headers de Clientes:', error);
      return [];
    }
  }
}