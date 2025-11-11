-- Script SQL para agregar columna password a la tabla usuarios
-- Ejecutar este script en: Supabase Dashboard → SQL Editor

-- 1. Agregar columna password para almacenar contraseñas encriptadas
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password text;

-- 2. Agregar comentario sobre la columna password
COMMENT ON COLUMN usuarios.password IS 'Contraseña encriptada con bcrypt';

-- 3. Verificar la estructura actualizada
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'usuarios' 
ORDER BY ordinal_position;