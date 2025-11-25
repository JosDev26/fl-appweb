-- Tabla para almacenar códigos de invitación únicos
CREATE TABLE IF NOT EXISTS invitation_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code VARCHAR(64) UNIQUE NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('cliente', 'empresa')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE,
  used_by VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  max_uses INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  created_by VARCHAR(255),
  notes TEXT
);

-- Índices para optimizar búsquedas
CREATE INDEX IF NOT EXISTS idx_invitation_codes_code ON invitation_codes(code);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_type ON invitation_codes(type);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_active ON invitation_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_invitation_codes_expires ON invitation_codes(expires_at);

-- Políticas RLS (Row Level Security)
ALTER TABLE invitation_codes ENABLE ROW LEVEL SECURITY;

-- Política para permitir lectura pública de códigos activos y no expirados
CREATE POLICY "Permitir lectura de códigos activos"
  ON invitation_codes FOR SELECT
  USING (
    is_active = TRUE 
    AND expires_at > NOW()
    AND current_uses < max_uses
  );

-- Política para permitir actualización cuando se usa un código
CREATE POLICY "Permitir actualización al usar código"
  ON invitation_codes FOR UPDATE
  USING (
    is_active = TRUE 
    AND expires_at > NOW()
    AND current_uses < max_uses
  );

-- Comentarios para documentación
COMMENT ON TABLE invitation_codes IS 'Almacena códigos de invitación únicos para registro de usuarios y empresas';
COMMENT ON COLUMN invitation_codes.code IS 'Código único generado criptográficamente (256 bits en hexadecimal)';
COMMENT ON COLUMN invitation_codes.type IS 'Tipo de usuario permitido: cliente o empresa';
COMMENT ON COLUMN invitation_codes.max_uses IS 'Número máximo de veces que puede usarse el código';
COMMENT ON COLUMN invitation_codes.current_uses IS 'Número de veces que se ha usado el código';
