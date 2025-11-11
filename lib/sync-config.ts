export interface ColumnMapping {
  // Nombre de la columna en Google Sheets
  sheetsColumn: string;
  // Nombre de la columna en Supabase
  supabaseColumn: string;
  // Función de transformación opcional
  transform?: (value: any) => any;
  // Si es requerido
  required?: boolean;
}

export interface TableMapping {
  // Nombre de la hoja en Google Sheets
  sheetsName: string;
  // Nombre de la tabla en Supabase
  supabaseTable: string;
  // Mapeo de columnas
  columns: ColumnMapping[];
  // Columna que actúa como ID único
  idColumn: string;
}

// 🎯 CONFIGURACIÓN ESPECÍFICA PARA USUARIOS ↔ CLIENTES
export const SYNC_CONFIG: TableMapping[] = [
  {
    sheetsName: "Clientes",
    supabaseTable: "usuarios",
    idColumn: "id_sheets", // 👈 Cambio: ahora usa id_sheets como identificador
    columns: [
      {
        sheetsColumn: "ID_Cliente",        // Columna A
        supabaseColumn: "id_sheets",       // 👈 Cambio: mapea a id_sheets en lugar de id
        required: true,
        transform: (value) => String(value || '').trim() // Mantener como texto
      },
      {
        sheetsColumn: "Nombre",            // Columna B
        supabaseColumn: "nombre",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "Correo",            // Columna C
        supabaseColumn: "correo",
        transform: (value) => {
          const email = String(value || '').toLowerCase().trim();
          return email === '' ? null : email;
        }
      },
      {
        sheetsColumn: "Telefono",          // Columna D
        supabaseColumn: "telefono",
        transform: (value) => {
          // Mantener formato original con símbolos como "+506 1111-2222"
          const phone = String(value || '').trim();
          return phone === '' ? null : phone;
        }
      },
      {
        sheetsColumn: "Tipo_Identificación", // Columna E
        supabaseColumn: "tipo_cedula",
        transform: (value) => {
          const tipo = String(value || '').trim();
          return tipo === '' ? null : tipo;
        }
      },
      {
        sheetsColumn: "Identificacion",    // Columna F
        supabaseColumn: "cedula",
        transform: (value) => {
          if (!value || value === '') return null;
          // Extraer solo números para la base de datos
          const cedula = String(value).replace(/[^\d]/g, '');
          return cedula ? parseInt(cedula) : null;
        }
      },
      {
        sheetsColumn: "Moneda",            // Columna H
        supabaseColumn: "esDolar",
        transform: (value) => {
          if (typeof value === 'boolean') return value;
          const str = String(value || '').toLowerCase().trim();
          // Acepta: "dolar", "dolares", "usd", "dollar", etc.
          return str.includes('dolar') || str.includes('usd') || str.includes('dollar');
        }
      },
      {
        sheetsColumn: "Cuenta",            // Columna J
        supabaseColumn: "estaRegistrado",
        transform: (value) => {
          if (typeof value === 'boolean') return value;
          const str = String(value || '').toLowerCase().trim();
          // Acepta: "y", "yes", "sí", "si", "1", "registrado", "activo"
          return str === 'y' || str === 'yes' || str === 'sí' || str === 'si' || 
                 str === '1' || str === 'registrado' || str === 'activo';
        }
      }
    ]
  }
];

// Funciones de utilidad
export function getTableMapping(sheetsName: string): TableMapping | undefined {
  return SYNC_CONFIG.find(config => config.sheetsName === sheetsName);
}

export function getSupabaseTableMapping(tableName: string): TableMapping | undefined {
  return SYNC_CONFIG.find(config => config.supabaseTable === tableName);
}

export function getAllSheetsNames(): string[] {
  return SYNC_CONFIG.map(config => config.sheetsName);
}

export function getAllSupabaseTables(): string[] {
  return SYNC_CONFIG.map(config => config.supabaseTable);
}