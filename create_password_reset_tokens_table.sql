-- Tabla para almacenar tokens de recuperación de contraseña
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  cedula BIGINT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('usuario', 'empresa')),
  correo_reportes TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT FALSE
);

-- Índice para búsqueda rápida por token
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

-- Índice para limpiar tokens expirados
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Política RLS (solo acceso desde el servidor con service_role)
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- No permitir acceso público a esta tabla
CREATE POLICY "No public access" ON password_reset_tokens
  FOR ALL
  USING (false);

-- Función para limpiar tokens expirados (opcional, ejecutar periódicamente)
CREATE OR REPLACE FUNCTION cleanup_expired_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM password_reset_tokens 
  WHERE expires_at < NOW() OR used = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON TABLE password_reset_tokens IS 'Tokens temporales para recuperación de contraseña';
COMMENT ON COLUMN password_reset_tokens.token IS 'Token único generado para el link de reset';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Fecha de expiración (1 hora después de creación)';
COMMENT ON COLUMN password_reset_tokens.used IS 'Marca si el token ya fue usado';
