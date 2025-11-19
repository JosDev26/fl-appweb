-- Agregar columna id_cliente a la tabla gastos
-- Esta columna almacenará el ID del cliente (usuario o empresa) asociado al gasto
-- Viene de la columna F (ID_Cliente) o H (ID_Empresa) de Google Sheets

ALTER TABLE gastos 
ADD COLUMN IF NOT EXISTS id_cliente text;

-- Crear índice para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_gastos_id_cliente ON gastos(id_cliente);

-- Comentario explicativo
COMMENT ON COLUMN gastos.id_cliente IS 'ID del cliente (usuario o empresa) asociado al gasto. Viene de columna F (ID_Cliente) o H (ID_Empresa) de Sheets, la que tenga valor';
