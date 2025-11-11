-- 🔧 Script SQL para actualizar la tabla usuarios en Supabase
-- Ejecuta este script en: Supabase Dashboard → SQL Editor

-- 1. Agregar nueva columna id_sheets para almacenar el ID original de Google Sheets
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS id_sheets text UNIQUE;

-- 2. Cambiar cedula de smallint/integer a bigint para números grandes como 4049201394
ALTER TABLE usuarios ALTER COLUMN cedula TYPE bigint;

-- 3. Cambiar telefono de integer a text para soportar formato "+506 1111-2222"
ALTER TABLE usuarios ALTER COLUMN telefono TYPE text;

-- 4. Agregar índice a id_sheets para mejorar rendimiento en búsquedas
CREATE INDEX IF NOT EXISTS idx_usuarios_id_sheets ON usuarios(id_sheets);

-- 5. Verificar la estructura actualizada
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'usuarios' 
ORDER BY ordinal_position;

-- 6. Mostrar comentario sobre la estructura final
COMMENT ON COLUMN usuarios.id IS 'ID auto-incremental interno de Supabase';
COMMENT ON COLUMN usuarios.id_sheets IS 'ID original del Google Sheet (alfanumérico como 336a1b2d)';
COMMENT ON COLUMN usuarios.telefono IS 'Teléfono en formato texto (ej: +506 1111-2222)';
COMMENT ON COLUMN usuarios.cedula IS 'Número de cédula/identificación (solo números)';

-- 7. Verificar que no hay datos existentes (debería retornar 0)
SELECT COUNT(*) as registros_existentes FROM usuarios;