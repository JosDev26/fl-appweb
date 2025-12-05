-- Agregar columna correo_reportes a la tabla empresas
-- Esta columna sincroniza con la columna K (Correo_Reportes) de Google Sheets

ALTER TABLE empresas
ADD COLUMN IF NOT EXISTS correo_reportes TEXT;

-- Comentario explicativo
COMMENT ON COLUMN empresas.correo_reportes IS 'Correo para envío de reportes, sincronizado desde Google Sheets columna K';

-- Índice opcional para búsquedas
CREATE INDEX IF NOT EXISTS idx_empresas_correo_reportes ON empresas(correo_reportes);
