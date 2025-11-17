-- Eliminar la foreign key restrictiva de solicitudes.id_cliente
-- Esto permite que id_cliente pueda ser de usuarios O empresas

-- 1. Eliminar la constraint existente
ALTER TABLE solicitudes
DROP CONSTRAINT IF EXISTS fk_cliente;

-- 2. Comentario explicativo
COMMENT ON COLUMN solicitudes.id_cliente IS 'ID del cliente, puede referenciar usuarios.id o empresas.id (sin foreign key para permitir ambos)';

-- 3. Crear índice para mejorar rendimiento de búsquedas
CREATE INDEX IF NOT EXISTS idx_solicitudes_id_cliente ON solicitudes(id_cliente);

-- 4. Verificar que la constraint fue eliminada
SELECT 
  conname AS constraint_name,
  contype AS constraint_type
FROM pg_constraint
WHERE conrelid = 'solicitudes'::regclass
  AND conname = 'fk_cliente';
