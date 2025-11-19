-- Agregar columna etapa_actual a la tabla actualizaciones
ALTER TABLE actualizaciones ADD COLUMN IF NOT EXISTS etapa_actual text;

-- Comentario explicativo
COMMENT ON COLUMN actualizaciones.etapa_actual IS 'Etapa actual del caso (columna H)';
