-- Agregar columna iva_perc a la tabla usuarios
-- Esta columna almacena el porcentaje de IVA como decimal (ej: 0.13 para 13%)

-- 1. Agregar la columna iva_perc (puede ser null)
ALTER TABLE usuarios
ADD COLUMN iva_perc numeric(5,4);

-- 2. Agregar índice para mejorar el rendimiento (opcional)
CREATE INDEX idx_usuarios_iva_perc ON usuarios(iva_perc);

-- 3. Comentario explicativo
COMMENT ON COLUMN usuarios.iva_perc IS 'Porcentaje de IVA en formato decimal (ej: 0.13 para 13%, columna I de Sheets)';
