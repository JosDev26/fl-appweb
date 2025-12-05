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
      
      // Usar rango explícito hasta fila 1000 para evitar que se corte la lectura
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:Z1000`, // Leer hasta fila 1000 explícitamente
      });

      const rows = response.data.values || [];
      console.log(`📊 Total filas RAW leídas de ${sheetName}: ${rows.length} (incluyendo header)`);
      
      if (rows.length === 0) return [];

      const headers = rows[0];
      const dataRows = rows.slice(1);
      
      console.log(`📊 Filas de datos (sin header): ${dataRows.length}`);
      
      // DEBUG: Mostrar las primeras 15 filas raw para ver qué IDs tienen
      console.log(`📋 Primeras 15 filas RAW (columna A - ID):`);
      dataRows.slice(0, 15).forEach((row, i) => {
        console.log(`  Fila ${i + 2}: ID="${row[0]}" | Nombre="${row[1]}"`);
      });

      console.log(`📋 Headers encontrados en ${sheetName}:`, headers);
      
      // Crear mapa de headers normalizados (sin espacios, minúsculas)
      const normalizeHeader = (h: string) => String(h || '').trim().toLowerCase().replace(/\s+/g, '_');
      const headerIndexMap = new Map<string, number>();
      headers.forEach((h: string, idx: number) => {
        headerIndexMap.set(normalizeHeader(h), idx);
      });

      // Transformar datos usando la configuración
      const transformedData = dataRows.map((row, index) => {
        const item: any = {};
        
        config.columns.forEach(colConfig => {
          // Buscar header de forma flexible (normalizado)
          const normalizedConfigHeader = normalizeHeader(colConfig.sheetsColumn);
          let sheetsIndex = headerIndexMap.get(normalizedConfigHeader);
          
          // Si no lo encuentra normalizado, intentar búsqueda exacta
          if (sheetsIndex === undefined) {
            sheetsIndex = headers.indexOf(colConfig.sheetsColumn);
            if (sheetsIndex === -1) sheetsIndex = undefined;
          }
          
          if (sheetsIndex !== undefined) {
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
        // Filtrar filas que no tienen el id (requerido)
        const idValue = item.id;
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

  // 📖 Leer datos de la hoja Materia
  static async readMaterias(): Promise<any[]> {
    return this.readSheet('Materia');
  }

  // 📝 Escribir datos a la hoja Clientes PRESERVANDO columnas G e I
  static async writeClientes(usuarios: any[]): Promise<void> {
    try {
      const config = SYNC_CONFIG.find(c => c.sheetsName === "Clientes");
      if (!config) {
        throw new Error("No configuration found for Clientes sheet");
      }

      console.log(`📝 Escribiendo ${usuarios.length} registros a hoja Clientes...`);

      // 1. Leer datos actuales para preservar columnas G, I y E
      const currentResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Clientes!A:K',
      });

      const currentRows = currentResponse.data.values || [];
      
      // 2. Guardar headers originales
      const originalHeaders = currentRows.length > 0 ? currentRows[0] : [];
      
      // 3. Crear mapa de datos preservados por ID_Cliente
      const preservedDataMap = new Map<string, { 
        columnE: string;  // Tipo_Identificación
        columnG: string;  // AppSheet
        columnI: string;  // IVA_Perc
      }>();
      
      if (currentRows.length > 1) {
        for (let i = 1; i < currentRows.length; i++) {
          const row = currentRows[i];
          const idCliente = row[0]; // Columna A (ID_Cliente)
          if (idCliente) {
            preservedDataMap.set(String(idCliente), {
              columnE: row[4] || '',  // Columna E (índice 4) - Tipo_Identificación
              columnG: row[6] || '',  // Columna G (índice 6) - AppSheet
              columnI: row[8] || ''   // Columna I (índice 8) - IVA_Perc
            });
          }
        }
      }

      console.log(`📋 Preservando columnas E, G e I para ${preservedDataMap.size} registros existentes`);

      // 4. Construir las filas con datos de Supabase + columnas preservadas
      const rows = usuarios.map(usuario => {
        const preserved = preservedDataMap.get(String(usuario.id));
        
        return [
          usuario.id || '',                              // A: ID_Cliente
          usuario.nombre || '',                          // B: Nombre
          usuario.correo || '',                          // C: Correo
          usuario.telefono || '',                        // D: Telefono
          preserved?.columnE || usuario.tipo_cedula || '',  // E: Tipo_Identificación (PRESERVADA)
          usuario.cedula ? String(usuario.cedula) : '',  // F: Identificacion
          preserved?.columnG || '',                      // G: AppSheet (PRESERVADA)
          usuario.esDolar ? 'Dolares' : 'Colones',      // H: Moneda
          preserved?.columnI || (usuario.iva_perc ? String(usuario.iva_perc) : ''), // I: IVA_Perc (PRESERVADA)
          '',                                            // J: (vacía)
          usuario.estaRegistrado ? 'Y' : 'N'            // K: Cuenta
        ];
      });

      // 5. Headers - Usar los originales de Sheets si existen, sino usar valores por defecto
      const headers = originalHeaders.length >= 11 ? originalHeaders : [
        'ID_Cliente',           // A
        'Nombre',               // B
        'Correo',               // C
        'Telefono',             // D
        'Tipo_Identificación',  // E
        'Identificacion',       // F
        'AppSheet',             // G (preservar header original)
        'Moneda',               // H
        'IVA_Perc',             // I (preservar header original)
        'J_Column',             // J (preservar header original)
        'Cuenta'                // K
      ];

      // 6. Limpiar solo las filas de datos (no headers)
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: 'Clientes!A2:K',
      });

      // 7. Escribir headers + datos
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Clientes!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers, ...rows],
        },
      });

      console.log(`✅ Datos escritos exitosamente a hoja Clientes`);
      console.log(`✅ Preservadas: Columna E (Tipo_Identificación), Columna G (AppSheet) y Columna I (IVA_Perc)`);

    } catch (error) {
      console.error('❌ Error escribiendo a hoja Clientes:', error);
      throw error;
    }
  }

  // 🔄 DESHABILITADO: Actualización individual también deshabilitada
  // 🔄 Actualizar fila individual preservando columnas E, G e I
  static async updateClienteRow(usuario: any, rowIndex: number): Promise<void> {
    try {
      console.log(`📝 Actualizando fila ${rowIndex} para usuario ${usuario.id}...`);

      // Leer valores actuales de columnas E, G e I
      const eResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `Clientes!E${rowIndex}`,
      });
      const gResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `Clientes!G${rowIndex}`,
      });
      const iResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `Clientes!I${rowIndex}`,
      });

      const columnE = eResponse.data.values?.[0]?.[0] || usuario.tipo_cedula || '';
      const columnG = gResponse.data.values?.[0]?.[0] || '';
      const columnI = iResponse.data.values?.[0]?.[0] || (usuario.iva_perc ? String(usuario.iva_perc) : '');

      // Actualizar toda la fila preservando E, G e I
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Clientes!A${rowIndex}:K${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            usuario.id || '',                              // A: ID_Cliente
            usuario.nombre || '',                          // B: Nombre
            usuario.correo || '',                          // C: Correo
            usuario.telefono || '',                        // D: Telefono
            columnE,                                       // E: Tipo_Identificación (PRESERVADA)
            usuario.cedula ? String(usuario.cedula) : '',  // F: Identificacion
            columnG,                                       // G: AppSheet (PRESERVADA)
            usuario.esDolar ? 'Dolares' : 'Colones',      // H: Moneda
            columnI,                                       // I: IVA_Perc (PRESERVADA)
            '',                                            // J: (vacía)
            usuario.estaRegistrado ? 'Y' : 'N'            // K: Cuenta
          ]]
        }
      });

      console.log(`✅ Fila ${rowIndex} actualizada preservando columnas E, G e I`);

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

  // ✍️ Método para escribir una fila en una hoja
  static async appendRow(sheetName: string, values: any[]): Promise<boolean> {
    try {
      console.log(`✍️ Escribiendo en hoja ${sheetName}:`, values);
      
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:Z`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [values]
        }
      });
      
      console.log(`✅ Fila agregada correctamente a ${sheetName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error escribiendo en ${sheetName}:`, error);
      throw error;
    }
  }

  // ✍️ Método para escribir múltiples filas
  static async appendRows(sheetName: string, rows: any[][]): Promise<boolean> {
    try {
      console.log(`✍️ Escribiendo ${rows.length} filas en hoja ${sheetName}`);
      
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${sheetName}'!A:Z`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rows
        }
      });
      
      console.log(`✅ ${rows.length} filas agregadas correctamente a ${sheetName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error escribiendo en ${sheetName}:`, error);
      throw error;
    }
  }
}