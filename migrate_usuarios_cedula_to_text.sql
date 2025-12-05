-- ========================================
-- Migración: Cambiar cedula de bigint a text
-- ========================================
-- Este script cambia el tipo de la columna "cedula" en la tabla "usuarios"
-- de bigint a text para soportar DIMEX y otras identificaciones internacionales
-- que pueden contener letras o formatos especiales.
--
-- También se actualiza la tabla "empresas" por consistencia.
-- ========================================

-- 1. Migrar columna cedula en usuarios de bigint a text
ALTER TABLE usuarios ALTER COLUMN cedula TYPE text USING cedula::text;

-- 2. Migrar columna cedula en empresas de bigint a text (por consistencia)
ALTER TABLE empresas ALTER COLUMN cedula TYPE text USING cedula::text;

-- 3. Actualizar comentarios de las columnas
COMMENT ON COLUMN usuarios.cedula IS 'Número de cédula/identificación (texto para soportar DIMEX y otros formatos)';
COMMENT ON COLUMN empresas.cedula IS 'Número de cédula jurídica/identificación (texto para soportar formatos especiales)';

-- ========================================
-- Verificación
-- ========================================
-- Ejecuta esto después de la migración para verificar:

-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'usuarios' AND column_name = 'cedula';

-- SELECT column_name, data_type 
-- FROM information_schema.columns 
-- WHERE table_name = 'empresas' AND column_name = 'cedula';

-- Resultado esperado: data_type = 'text' para ambas tablas
