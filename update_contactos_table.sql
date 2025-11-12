-- Actualizar tabla de contactos para sincronización con Google Sheets
DROP TABLE IF EXISTS contactos CASCADE;

CREATE TABLE contactos (
  id text PRIMARY KEY,
  nombre text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Crear índice para mejorar el rendimiento
CREATE INDEX idx_contactos_nombre ON contactos(nombre);

-- Comentarios para documentación
COMMENT ON TABLE contactos IS 'Tabla de contactos sincronizada con Google Sheets';
COMMENT ON COLUMN contactos.id IS 'ID del contacto desde Google Sheets (ID_Contacto)';
COMMENT ON COLUMN contactos.nombre IS 'Nombre completo del contacto';
