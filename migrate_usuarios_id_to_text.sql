-- Migrar columna id de usuarios de integer a text para soportar IDs alfanuméricos de Sheets
-- IMPORTANTE: Ejecutar esto DESPUÉS de hacer backup de la base de datos

-- 1. Crear una nueva columna temporal para el ID texto
ALTER TABLE usuarios ADD COLUMN id_new TEXT;

-- 2. Copiar los IDs existentes a la nueva columna (convertir números a texto)
UPDATE usuarios SET id_new = id::TEXT;

-- 3. Hacer que la nueva columna sea NOT NULL y PRIMARY KEY
ALTER TABLE usuarios ALTER COLUMN id_new SET NOT NULL;

-- 4. Eliminar la restricción de clave primaria antigua
ALTER TABLE usuarios DROP CONSTRAINT usuarios_pkey;

-- 5. Eliminar la columna id antigua
ALTER TABLE usuarios DROP COLUMN id;

-- 6. Renombrar la nueva columna a id
ALTER TABLE usuarios RENAME COLUMN id_new TO id;

-- 7. Agregar la nueva clave primaria
ALTER TABLE usuarios ADD PRIMARY KEY (id);

-- 8. Comentario explicativo
COMMENT ON COLUMN usuarios.id IS 'ID alfanumérico sincronizado desde columna A (ID_Cliente) de Google Sheets';

-- NOTA: Si tienes foreign keys que referencian usuarios.id, deberás actualizarlas también
