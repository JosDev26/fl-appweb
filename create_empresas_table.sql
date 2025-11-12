-- Crear tabla de empresas
CREATE TABLE IF NOT EXISTS empresas (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  cedula bigint,
  esDolar boolean DEFAULT false,
  iva_perc numeric(4,2) DEFAULT 0.13,
  estaRegistrado boolean DEFAULT false,
  password text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_empresas_cedula ON empresas(cedula);
CREATE INDEX IF NOT EXISTS idx_empresas_estaRegistrado ON empresas(estaRegistrado);

-- Comentarios para documentación
COMMENT ON TABLE empresas IS 'Tabla de empresas sincronizada con Google Sheets';
COMMENT ON COLUMN empresas.id IS 'ID de la empresa desde Google Sheets (ID_Empresa)';
COMMENT ON COLUMN empresas.nombre IS 'Nombre de la empresa';
COMMENT ON COLUMN empresas.cedula IS 'Cédula jurídica de la empresa';
COMMENT ON COLUMN empresas.esDolar IS 'Indica si la empresa opera en dólares (true) o colones (false)';
COMMENT ON COLUMN empresas.iva_perc IS 'Porcentaje de IVA como decimal (ej: 0.13 para 13%)';
COMMENT ON COLUMN empresas.estaRegistado IS 'Indica si la empresa tiene cuenta activa';
COMMENT ON COLUMN empresas.password IS 'Contraseña encriptada para autenticación';
