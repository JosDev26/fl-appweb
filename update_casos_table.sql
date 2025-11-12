-- Actualizar tabla de casos para sincronización con Google Sheets
DROP TABLE IF EXISTS casos CASCADE;

CREATE TABLE casos (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  estado text,
  expediente text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX idx_casos_estado ON casos(estado);
CREATE INDEX idx_casos_expediente ON casos(expediente);

-- Comentarios para documentación
COMMENT ON TABLE casos IS 'Tabla de casos sincronizada con Google Sheets';
COMMENT ON COLUMN casos.id IS 'ID del caso desde Google Sheets (ID_Caso)';
COMMENT ON COLUMN casos.nombre IS 'Título del caso';
COMMENT ON COLUMN casos.estado IS 'Estado del caso: En Proceso, Finalizado, Abandonado';
COMMENT ON COLUMN casos.expediente IS 'Número de expediente del caso';
