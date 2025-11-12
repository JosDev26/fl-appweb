-- Agregar columna id_cliente a la tabla casos
ALTER TABLE casos
ADD COLUMN IF NOT EXISTS id_cliente text;

-- Agregar columnas de timestamp si no existen
ALTER TABLE casos
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT now();

ALTER TABLE casos
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Crear índice para mejorar búsquedas
CREATE INDEX IF NOT EXISTS idx_casos_id_cliente ON casos(id_cliente);

-- Comentario explicativo
COMMENT ON COLUMN casos.id_cliente IS 'ID del cliente o empresa asociado al caso. Puede ser de usuarios.id o empresas.id';
