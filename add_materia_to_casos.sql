-- Agregar columna materia a la tabla casos
-- Esta columna hará referencia a la tabla materias

-- 1. Agregar la columna materia (puede ser null)
ALTER TABLE casos
ADD COLUMN materia text;

-- 2. Agregar foreign key constraint referenciando la tabla materias
ALTER TABLE casos
ADD CONSTRAINT fk_materia
FOREIGN KEY (materia)
REFERENCES materias(id)
ON DELETE SET NULL;

-- 3. Agregar índice para mejorar el rendimiento de las consultas
CREATE INDEX idx_casos_materia ON casos(materia);

-- 4. Comentario explicativo
COMMENT ON COLUMN casos.materia IS 'ID de la materia asociada al caso (foreign key a materias.id)';
