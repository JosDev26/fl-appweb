-- Agregar columna correo a usuarios para almacenar su correo REAL de contacto
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS correo TEXT;

-- Crear índice para búsquedas rápidas por correo
CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios(correo);

-- Agregar columna correo a empresas (para correo de contacto real, NO el interno)
ALTER TABLE empresas
ADD COLUMN IF NOT EXISTS correo TEXT;

-- Crear índice para búsquedas rápidas por correo
CREATE INDEX IF NOT EXISTS idx_empresas_correo ON empresas(correo);

-- Comentario explicativo
-- NOTA: El email interno de Supabase Auth ({cedula}@clientes.interno) NO se guarda en estas tablas
-- Solo existe en Supabase Authentication
COMMENT ON COLUMN usuarios.correo IS 'Correo real de contacto del usuario';
COMMENT ON COLUMN empresas.correo IS 'Correo real de contacto de la empresa (opcional)';
