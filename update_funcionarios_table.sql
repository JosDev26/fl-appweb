-- Actualizar tabla de funcionarios para sincronización con Google Sheets
DROP TABLE IF EXISTS funcionarios CASCADE;

CREATE TABLE funcionarios (
  id text PRIMARY KEY,
  nombre text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Crear índice para mejorar el rendimiento
CREATE INDEX idx_funcionarios_nombre ON funcionarios(nombre);

-- Comentarios para documentación
COMMENT ON TABLE funcionarios IS 'Tabla de funcionarios sincronizada con Google Sheets';
COMMENT ON COLUMN funcionarios.id IS 'ID del funcionario desde Google Sheets (ID_Funcionario)';
COMMENT ON COLUMN funcionarios.nombre IS 'Nombre completo del funcionario';
