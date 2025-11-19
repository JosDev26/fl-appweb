-- Agregar columna correo a usuarios para almacenar el email interno de Supabase Auth
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS correo TEXT;

-- Crear índice para búsquedas rápidas por correo
CREATE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios(correo);

-- Agregar columna correo a empresas para almacenar el email interno de Supabase Auth
ALTER TABLE empresas
ADD COLUMN IF NOT EXISTS correo TEXT;

-- Crear índice para búsquedas rápidas por correo
CREATE INDEX IF NOT EXISTS idx_empresas_correo ON empresas(correo);

-- Comentario explicativo
COMMENT ON COLUMN usuarios.correo IS 'Email interno para Supabase Auth en formato: {cedula}@clientes.interno';
COMMENT ON COLUMN empresas.correo IS 'Email interno para Supabase Auth en formato: {cedula}@clientes.interno';
