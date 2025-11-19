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
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Cliente",        // Columna A
        supabaseColumn: "id",
        required: true,
        transform: (value) => String(value || '').trim() // Mantener como texto alfanumérico
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
        sheetsColumn: "IVA_Perc",          // Columna I
        supabaseColumn: "iva_perc",
        transform: (value) => {
          // Si está vacío, null o undefined, retornar 0.13 por defecto
          if (!value || value === '' || value === null || value === undefined) {
            return 0.13;
          }
          // Si viene como "13%" o "13"
          const str = String(value).replace(/%/g, '').trim();
          const num = parseFloat(str);
          if (isNaN(num)) return 0.13; // Valor por defecto si no se puede parsear
          // Si es mayor o igual a 1, asumir que es porcentaje (ej: 13) y convertir a decimal
          return num >= 1 ? num / 100 : num;
        }
      }
      // Nota: estaRegistrado ya no se sincroniza con Google Sheets
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
        sheetsColumn: "TarifaxHora",       // Columna I
        supabaseColumn: "tarifa_hora",
        transform: (value) => {
          if (!value || value === '') return null;
          // Remover símbolos de moneda (₡, $) y comas
          const numStr = String(value).replace(/[₡$,]/g, '').trim();
          const num = parseFloat(numStr);
          return isNaN(num) ? null : num;
        }
      }
      // Nota: estaRegistrado ya no se sincroniza con Google Sheets
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
    sheetsName: "Materias",
    supabaseTable: "materias",
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Materia",        // Columna A
        supabaseColumn: "id",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "Materia",           // Columna B
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
        sheetsColumn: "Materia",          // Columna G
        supabaseColumn: "materia",
        transform: (value) => {
          const materia = String(value || '').trim();
          return materia === '' ? null : materia;
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
  },
  {
    sheetsName: "Solicitudes",
    supabaseTable: "solicitudes",
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Solicitud",     // Columna A
        supabaseColumn: "id",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "ID_Cliente",       // Columna D
        supabaseColumn: "id_cliente",
        transform: (value) => {
          const id = String(value || '').trim();
          return id === '' ? null : id;
        }
      },
      {
        sheetsColumn: "Titulo",           // Columna F
        supabaseColumn: "titulo",
        transform: (value) => {
          const titulo = String(value || '').trim();
          return titulo === '' ? null : titulo;
        }
      },
      {
        sheetsColumn: "Descripcion",      // Columna G
        supabaseColumn: "descripcion",
        transform: (value) => {
          const desc = String(value || '').trim();
          return desc === '' ? null : desc;
        }
      },
      {
        sheetsColumn: "Materia",          // Columna H
        supabaseColumn: "materia",
        transform: (value) => {
          const materia = String(value || '').trim();
          return materia === '' ? null : materia;
        }
      },
      {
        sheetsColumn: "Etapa_Actual",     // Columna I
        supabaseColumn: "etapa_actual",
        transform: (value) => {
          const etapa = String(value || '').trim();
          return etapa === '' ? null : etapa;
        }
      },
      {
        sheetsColumn: "Modalidad_Pago",   // Columna J
        supabaseColumn: "modalidad_pago",
        transform: (value) => {
          const modalidad = String(value || '').trim();
          return modalidad === '' ? null : modalidad;
        }
      },
      {
        sheetsColumn: "Costo_Neto",       // Columna K
        supabaseColumn: "costo_neto",
        transform: (value) => {
          if (!value || value === '') return null;
          // Remover símbolos de moneda (₡, $) y comas
          const numStr = String(value).replace(/[₡$,]/g, '').trim();
          const num = parseFloat(numStr);
          return isNaN(num) ? null : num;
        }
      },
      {
        sheetsColumn: "SeCobra_IVA",      // Columna L
        supabaseColumn: "se_cobra_iva",
        transform: (value) => {
          if (typeof value === 'boolean') return value;
          const str = String(value || '').toLowerCase().trim();
          return str === 'true' || str === 'yes' || str === 'sí' || str === 'si' || str === '1';
        }
      },
      {
        sheetsColumn: "Monto_IVA",        // Columna M
        supabaseColumn: "monto_iva",
        transform: (value) => {
          if (!value || value === '' || value === 'NULL' || value === 'null') return null;
          // Remover símbolos de moneda (₡, $) y comas
          const numStr = String(value).replace(/[₡$,]/g, '').trim();
          const num = parseFloat(numStr);
          return isNaN(num) ? null : num;
        }
      },
      {
        sheetsColumn: "Cantidad_Cuotas",  // Columna N
        supabaseColumn: "cantidad_cuotas",
        transform: (value) => {
          if (!value || value === '') return null;
          const num = parseInt(String(value));
          return isNaN(num) ? null : num;
        }
      },
      {
        sheetsColumn: "MontoxCuota",      // Columna O
        supabaseColumn: "monto_por_cuota",
        transform: (value) => {
          if (!value || value === '') return null;
          // Remover símbolos de moneda (₡, $) y comas
          const numStr = String(value).replace(/[₡$,]/g, '').trim();
          const num = parseFloat(numStr);
          return isNaN(num) ? null : num;
        }
      },
      {
        sheetsColumn: "Total_a_Pagar",    // Columna P
        supabaseColumn: "total_a_pagar",
        transform: (value) => {
          if (!value || value === '') return null;
          // Remover símbolos de moneda (₡, $) y comas
          const numStr = String(value).replace(/[₡$,]/g, '').trim();
          const num = parseFloat(numStr);
          return isNaN(num) ? null : num;
        }
      },
      {
        sheetsColumn: "Estado_Pago",      // Columna Q
        supabaseColumn: "estado_pago",
        transform: (value) => {
          const estado = String(value || '').trim();
          return estado === '' ? null : estado;
        }
      },
      {
        sheetsColumn: "Monto_Pagado",     // Columna R
        supabaseColumn: "monto_pagado",
        transform: (value) => {
          if (!value || value === '') return null;
          // Remover símbolos de moneda (₡, $) y comas
          const numStr = String(value).replace(/[₡$,]/g, '').trim();
          const num = parseFloat(numStr);
          return isNaN(num) ? null : num;
        }
      },
      {
        sheetsColumn: "Saldo_Pendiente",  // Columna S
        supabaseColumn: "saldo_pendiente",
        transform: (value) => {
          if (!value || value === '') return null;
          // Remover símbolos de moneda (₡, $) y comas
          const numStr = String(value).replace(/[₡$,]/g, '').trim();
          const num = parseFloat(numStr);
          return isNaN(num) ? null : num;
        }
      },
      {
        sheetsColumn: "Expediente",       // Columna T
        supabaseColumn: "expediente",
        transform: (value) => {
          const exp = String(value || '').trim();
          return exp === '' ? null : exp;
        }
      }
    ]
  },
  {
    sheetsName: "Historial de reportes",
    supabaseTable: "historial_reportes",
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Click",       // Columna A
        supabaseColumn: "id",
        transform: (value) => {
          const id = String(value || '').trim();
          return id === '' ? null : id;
        }
      },
      {
        sheetsColumn: "Fecha",          // Columna B
        supabaseColumn: "fecha",
        transform: (value) => {
          if (!value || value === '') return null;
          const dateStr = String(value).trim();
          // Formato esperado: 17/11/2025 (DD/MM/YYYY)
          const parts = dateStr.split('/');
          if (parts.length !== 3) return null;
          const [day, month, year] = parts;
          // Convertir a formato ISO: YYYY-MM-DD
          const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          return isoDate;
        }
      },
      {
        sheetsColumn: "Hora",           // Columna C
        supabaseColumn: "hora",
        transform: (value) => {
          if (!value || value === '') return null;
          let timeStr = String(value).trim();
          // Formato esperado: "4:28:01 p.m." o "4:28:01 a.m."
          // Remover "a.m." o "p.m." y convertir a formato 24h
          const isPM = /p\.?m\.?/i.test(timeStr);
          const isAM = /a\.?m\.?/i.test(timeStr);
          
          // Limpiar el string
          timeStr = timeStr.replace(/[ap]\.?m\.?/gi, '').trim();
          
          const parts = timeStr.split(':');
          if (parts.length < 2) return null;
          
          let hours = parseInt(parts[0]);
          const minutes = parts[1];
          const seconds = parts[2] || '00';
          
          // Convertir a formato 24h
          if (isPM && hours !== 12) {
            hours += 12;
          } else if (isAM && hours === 12) {
            hours = 0;
          }
          
          return `${String(hours).padStart(2, '0')}:${minutes}:${seconds}`;
        }
      }
    ]
  },
  {
    sheetsName: "Actualizaciones",
    supabaseTable: "actualizaciones",
    idColumn: "id",
    columns: [
      {
        sheetsColumn: "ID_Actualizacion",  // Columna A
        supabaseColumn: "id",
        required: true,
        transform: (value) => String(value || '').trim()
      },
      {
        sheetsColumn: "Tipo_Cliente",      // Columna B
        supabaseColumn: "tipo_cliente",
        transform: (value) => {
          const tipo = String(value || '').trim();
          return tipo === '' ? null : tipo;
        }
      },
      {
        sheetsColumn: "ID_Cliente",        // Columna C
        supabaseColumn: "id_cliente",
        transform: (value) => {
          const id = String(value || '').trim();
          return id === '' ? null : id;
        }
      },
      {
        sheetsColumn: "ID_Solicitud",      // Columna E
        supabaseColumn: "id_solicitud",
        transform: (value) => {
          const id = String(value || '').trim();
          return id === '' ? null : id;
        }
      },
      {
        sheetsColumn: "Comentario",        // Columna F
        supabaseColumn: "comentario",
        transform: (value) => {
          const comentario = String(value || '').trim();
          return comentario === '' ? null : comentario;
        }
      },
      {
        sheetsColumn: "Tiempo",            // Columna G
        supabaseColumn: "tiempo",
        transform: (value) => {
          if (!value || value === '') return null;
          try {
            const dateStr = String(value);
            // Si ya viene en formato ISO, retornar directo
            if (dateStr.includes('T') || dateStr.includes('-')) return dateStr;
            
            // Intentar parsear otros formatos
            const date = new Date(dateStr);
            return isNaN(date.getTime()) ? null : date.toISOString();
          } catch (error) {
            console.warn('Error transformando tiempo:', value, error);
            return null;
          }
        }
      },
      {
        sheetsColumn: "Etapa_Actual",      // Columna H
        supabaseColumn: "etapa_actual",
        transform: (value) => {
          const etapa = String(value || '').trim();
          return etapa === '' ? null : etapa;
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