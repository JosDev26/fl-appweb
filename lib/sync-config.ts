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

// 🎯 CONFIGURACIÓN ESPECÍFICA PARA USUARIOS ↔ CLIENTES Y EMPRESAS
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
  },
  {
    sheetsName: "Empresas",
    supabaseTable: "empresas",
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Empresa",        // Columna A
        supabaseColumn: "id",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "Nombre",            // Columna B
        supabaseColumn: "nombre",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "Cedula",            // Columna C
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
        sheetsColumn: "IVA_Perc",          // Columna G
        supabaseColumn: "iva_perc",
        transform: (value) => {
          if (!value) return 0.13; // Valor por defecto
          // Si viene como "13%" o "13"
          const str = String(value).replace(/%/g, '').trim();
          const num = parseFloat(str);
          // Si es mayor a 1, asumir que es porcentaje (ej: 13) y convertir a decimal
          return num > 1 ? num / 100 : num;
        }
      },
      {
        sheetsColumn: "Cuenta",            // Columna J
        supabaseColumn: "estaRegistrado",
        transform: (value) => {
          if (typeof value === 'boolean') return value;
          const str = String(value || '').toLowerCase().trim();
          // Acepta: "true", "y", "yes", "sí", "si", "1", "registrado", "activo"
          return str === 'true' || str === 'y' || str === 'yes' || 
                 str === 'sí' || str === 'si' || str === '1' || 
                 str === 'registrado' || str === 'activo';
        }
      }
    ]
  },
  {
    sheetsName: "Contacto",
    supabaseTable: "contactos",
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Contacto",       // Columna A
        supabaseColumn: "id",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "Nombre",            // Columna B
        supabaseColumn: "nombre",
        transform: (value) => {
          const nombre = String(value || '').trim();
          return nombre === '' ? null : nombre;
        }
      }
    ]
  },
  {
    sheetsName: "Caso",
    supabaseTable: "casos",
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Caso",          // Columna A
        supabaseColumn: "id",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "Titulo",           // Columna B
        supabaseColumn: "nombre",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "Estado",           // Columna F
        supabaseColumn: "estado",
        transform: (value) => {
          const estado = String(value || '').trim();
          return estado === '' ? null : estado;
        }
      },
      {
        sheetsColumn: "Expediente",       // Columna H
        supabaseColumn: "expediente",
        transform: (value) => {
          const exp = String(value || '').trim();
          // Si está vacío, es "N/A" o "No aplica", guardar null
          if (exp === '' || exp.toLowerCase() === 'n/a' || exp.toLowerCase() === 'no aplica') {
            return null;
          }
          return exp;
        }
      }
    ]
  },
  {
    sheetsName: "Funcionarios",
    supabaseTable: "funcionarios",
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Funcionario",    // Columna A
        supabaseColumn: "id",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "Nombre",            // Columna B
        supabaseColumn: "nombre",
        transform: (value) => {
          const nombre = String(value || '').trim();
          return nombre === '' ? null : nombre;
        }
      }
    ]
  },
  {
    sheetsName: "Control_Horas",
    supabaseTable: "trabajos_por_hora",
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Tarea",         // Columna A
        supabaseColumn: "id",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "ID_Caso",          // Columna B
        supabaseColumn: "caso_asignado",
        transform: (value) => {
          const id = String(value || '').trim();
          return id === '' ? null : id;
        }
      },
      {
        sheetsColumn: "ID_Responsable",   // Columna F
        supabaseColumn: "responsable",
        transform: (value) => {
          const id = String(value || '').trim();
          return id === '' ? null : id;
        }
      },
      {
        sheetsColumn: "ID_Solicitantes",  // Columna G
        supabaseColumn: "solicitante",
        transform: (value) => {
          const id = String(value || '').trim();
          return id === '' ? null : id;
        }
      },
      {
        sheetsColumn: "Titulo_Tarea",     // Columna H
        supabaseColumn: "titulo",
        transform: (value) => {
          const titulo = String(value || '').trim();
          return titulo === '' ? null : titulo;
        }
      },
      {
        sheetsColumn: "Descripcion",      // Columna I
        supabaseColumn: "descripcion",
        transform: (value) => {
          const desc = String(value || '').trim();
          return desc === '' ? null : desc;
        }
      },
      {
        sheetsColumn: "Fecha",            // Columna J
        supabaseColumn: "fecha",
        transform: (value) => {
          if (!value || value === '') return null;
          // Convertir fecha de formato 3/11/2025 a 2025-11-03
          try {
            const dateStr = String(value);
            // Si ya viene en formato ISO, retornar directo
            if (dateStr.includes('-')) return dateStr;
            
            // Convertir de DD/MM/YYYY o D/M/YYYY
            const parts = dateStr.split('/');
            if (parts.length === 3) {
              const day = parts[0].padStart(2, '0');
              const month = parts[1].padStart(2, '0');
              const year = parts[2];
              return `${year}-${month}-${day}`;
            }
            return null;
          } catch (error) {
            console.warn('Error transformando fecha:', value, error);
            return null;
          }
        }
      },
      {
        sheetsColumn: "Duracion",         // Columna K
        supabaseColumn: "duracion",
        transform: (value) => {
          if (!value || value === '') return null;
          // Convertir duración de formato 1:15:00 a interval de PostgreSQL
          const durStr = String(value).trim();
          return durStr;
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