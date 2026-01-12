-- =============================================
-- Tabla: lista_servicios
-- Descripción: Catálogo de servicios profesionales disponibles
-- Sincroniza con: Google Sheets - Hoja "Lista_Servicios"
-- =============================================

-- Crear la tabla lista_servicios
CREATE TABLE IF NOT EXISTS lista_servicios (
  -- Columna A: ID_Servicio (Primary Key)
  id TEXT PRIMARY KEY,
  
  -- Columna B: Título del servicio
  titulo TEXT,
  
  -- Columna C: Precio en colones (ej: ₡123,540)
  -- Solo uno de precio_crc o precio_usd debe tener valor
  precio_crc NUMERIC(15, 2),
  
  -- Columna D: Precio en dólares (ej: $12)
  -- Solo uno de precio_crc o precio_usd debe tener valor
  precio_usd NUMERIC(15, 2)
);

-- =============================================
-- Índices para mejorar performance de búsquedas
-- =============================================

-- Índice para búsquedas por título
CREATE INDEX IF NOT EXISTS idx_lista_servicios_titulo 
ON lista_servicios(titulo);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

-- Habilitar RLS
ALTER TABLE lista_servicios ENABLE ROW LEVEL SECURITY;

-- Política permisiva para el backend (service role)
-- La seguridad se maneja en la capa de aplicación
CREATE POLICY "lista_servicios_policy" ON lista_servicios
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================
-- Comentarios de documentación
-- =============================================

COMMENT ON TABLE lista_servicios IS 'Catálogo de servicios profesionales sincronizado desde Google Sheets hoja "Lista_Servicios"';

COMMENT ON COLUMN lista_servicios.id IS 'ID_Servicio - Identificador único del servicio (Columna A)';
COMMENT ON COLUMN lista_servicios.titulo IS 'Título del servicio (Columna B)';
COMMENT ON COLUMN lista_servicios.precio_crc IS 'Precio en colones (Columna C) - Ej: ₡123,540 - Solo uno de precio_crc o precio_usd debe tener valor';
COMMENT ON COLUMN lista_servicios.precio_usd IS 'Precio en dólares (Columna D) - Ej: $12 - Solo uno de precio_crc o precio_usd debe tener valor';

-- =============================================
-- Notas de Foreign Keys (sin constraints formales)
-- =============================================
-- Esta tabla es referenciada por:
-- - servicios_profesionales.id_servicio → lista_servicios.id
--
-- Se usa este enfoque flexible (sin FK constraints) para:
-- 1. Evitar errores de sync si los registros referenciados no existen aún
-- 2. Consistencia con otras tablas del sistema (gastos, casos, etc.)
-- 3. Permitir que servicios_profesionales contenga id_servicio que aún no existan en el catálogo
