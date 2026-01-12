-- =============================================
-- Tabla: servicios_profesionales
-- Descripción: Servicios profesionales (honorarios) facturados
-- Sincroniza con: Google Sheets - Hoja "Servicios"
-- =============================================

-- Crear la tabla servicios_profesionales
CREATE TABLE IF NOT EXISTS servicios_profesionales (
  -- Columna A: ID_Honoriario (Primary Key)
  id TEXT PRIMARY KEY,
  
  -- Columna B: ID_Caso (desde Sheets, puede estar vacío si hay solicitud)
  id_caso_sheets TEXT,
  
  -- Columna C: ID_Solicitud (desde Sheets, puede estar vacío si hay caso)
  id_solicitud_sheets TEXT,
  
  -- Columna derivada: Toma el valor de id_caso_sheets O id_solicitud_sheets
  -- Solo uno de los dos puede tener valor
  id_caso TEXT,
  
  -- Columna D: ID_Cliente físico (desde Sheets)
  id_cliente_sheets TEXT,
  
  -- Columna E: Tipo de cliente (PRESERVAR - solo usado en AppSheet)
  -- Esta columna NO se sobrescribe en sync Supabase → Sheets
  tipo_cliente TEXT,
  
  -- Columna F: ID_Empresa/Cliente jurídico (desde Sheets)
  id_empresa_sheets TEXT,
  
  -- Columna derivada: Toma el valor de id_cliente_sheets O id_empresa_sheets
  -- Solo uno de los dos puede tener valor
  id_cliente TEXT,
  
  -- Columna G: ID_Responsable (FK a funcionarios)
  id_responsable TEXT,
  
  -- Columna H: ID_Servicio (FK a lista_servicios - PENDIENTE DE CREAR)
  -- TODO: Agregar FOREIGN KEY cuando se cree la tabla lista_servicios
  id_servicio TEXT,
  
  -- Columna I: Fecha del servicio (formato en Sheets: DD/MM/YYYY)
  fecha DATE,
  
  -- Columna J: Costo del servicio (ej: ₡123,540)
  costo NUMERIC(15, 2),
  
  -- Columna K: Gastos propios del servicio (no relacionados con tabla gastos)
  gastos NUMERIC(15, 2),
  
  -- Columna L: IVA del servicio
  iva NUMERIC(15, 2),
  
  -- Columna M: Total cobrado al cliente
  total NUMERIC(15, 2)
);

-- =============================================
-- Índices para mejorar performance de búsquedas
-- =============================================

-- Índice para búsquedas por caso/solicitud
CREATE INDEX IF NOT EXISTS idx_servicios_profesionales_id_caso 
ON servicios_profesionales(id_caso);

-- Índice para búsquedas por cliente (físico o jurídico)
CREATE INDEX IF NOT EXISTS idx_servicios_profesionales_id_cliente 
ON servicios_profesionales(id_cliente);

-- Índice para búsquedas por responsable
CREATE INDEX IF NOT EXISTS idx_servicios_profesionales_id_responsable 
ON servicios_profesionales(id_responsable);

-- Índice para búsquedas por servicio
CREATE INDEX IF NOT EXISTS idx_servicios_profesionales_id_servicio 
ON servicios_profesionales(id_servicio);

-- Índice para búsquedas por fecha (ordenado DESC para consultas de recientes)
CREATE INDEX IF NOT EXISTS idx_servicios_profesionales_fecha 
ON servicios_profesionales(fecha DESC);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

-- Habilitar RLS
ALTER TABLE servicios_profesionales ENABLE ROW LEVEL SECURITY;

-- Política permisiva para el backend (service role)
-- La seguridad se maneja en la capa de aplicación
CREATE POLICY "servicios_profesionales_policy" ON servicios_profesionales
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================
-- Comentarios de documentación
-- =============================================

COMMENT ON TABLE servicios_profesionales IS 'Servicios profesionales (honorarios) sincronizados desde Google Sheets hoja "Servicios"';

COMMENT ON COLUMN servicios_profesionales.id IS 'ID_Honoriario - Identificador único del servicio (Columna A)';
COMMENT ON COLUMN servicios_profesionales.id_caso_sheets IS 'ID_Caso desde Sheets (Columna B) - Puede estar vacío si hay solicitud';
COMMENT ON COLUMN servicios_profesionales.id_solicitud_sheets IS 'ID_Solicitud desde Sheets (Columna C) - Puede estar vacío si hay caso';
COMMENT ON COLUMN servicios_profesionales.id_caso IS 'Columna derivada: valor de id_caso_sheets O id_solicitud_sheets';
COMMENT ON COLUMN servicios_profesionales.id_cliente_sheets IS 'ID_Cliente físico desde Sheets (Columna D)';
COMMENT ON COLUMN servicios_profesionales.tipo_cliente IS 'Tipo de cliente (Columna E) - PRESERVAR, solo usado en AppSheet';
COMMENT ON COLUMN servicios_profesionales.id_empresa_sheets IS 'ID_Empresa desde Sheets (Columna F) - Cliente jurídico';
COMMENT ON COLUMN servicios_profesionales.id_cliente IS 'Columna derivada: valor de id_cliente_sheets O id_empresa_sheets';
COMMENT ON COLUMN servicios_profesionales.id_responsable IS 'ID_Responsable (Columna G) - FK no formal a funcionarios(id)';
COMMENT ON COLUMN servicios_profesionales.id_servicio IS 'ID_Servicio (Columna H) - FK pendiente a lista_servicios(id)';
COMMENT ON COLUMN servicios_profesionales.fecha IS 'Fecha del servicio (Columna I) - Formato original: DD/MM/YYYY';
COMMENT ON COLUMN servicios_profesionales.costo IS 'Costo del servicio (Columna J) - Ej: ₡123,540';
COMMENT ON COLUMN servicios_profesionales.gastos IS 'Gastos propios del servicio (Columna K) - No relacionados con tabla gastos';
COMMENT ON COLUMN servicios_profesionales.iva IS 'IVA del servicio (Columna L)';
COMMENT ON COLUMN servicios_profesionales.total IS 'Total cobrado al cliente (Columna M)';

-- =============================================
-- Notas de Foreign Keys (sin constraints formales)
-- =============================================
-- Las siguientes son referencias lógicas, no constraints de BD:
-- - id_caso → casos(id) O solicitudes(id)
-- - id_cliente → usuarios(id) O empresas(id)
-- - id_responsable → funcionarios(id)
-- - id_servicio → lista_servicios(id) [TABLA PENDIENTE DE CREAR]
--
-- Se usa este enfoque flexible (sin FK constraints) para:
-- 1. Permitir referencias a múltiples tablas (casos/solicitudes, usuarios/empresas)
-- 2. Evitar errores de sync si los registros referenciados no existen aún
-- 3. Consistencia con otras tablas del sistema (gastos, casos, etc.)
