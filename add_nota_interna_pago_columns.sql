-- Agregar columnas para notas internas de pago y fecha de activación a usuarios y empresas
-- Estas notas son solo visibles para el administrador en el panel /dev

-- Agregar columna nota_interna_pago a usuarios
ALTER TABLE usuarios 
ADD COLUMN IF NOT EXISTS nota_interna_pago TEXT;

-- Agregar columna nota_interna_pago a empresas
ALTER TABLE empresas 
ADD COLUMN IF NOT EXISTS nota_interna_pago TEXT;

-- Agregar columna fecha_activacion_modo_pago a usuarios (si no existe)
ALTER TABLE usuarios 
ADD COLUMN IF NOT EXISTS fecha_activacion_modo_pago TIMESTAMPTZ;

-- Agregar columna fecha_activacion_modo_pago a empresas (si no existe)
ALTER TABLE empresas 
ADD COLUMN IF NOT EXISTS fecha_activacion_modo_pago TIMESTAMPTZ;

-- Comentarios para documentación
COMMENT ON COLUMN usuarios.nota_interna_pago IS 'Notas internas del administrador sobre el pago del cliente';
COMMENT ON COLUMN empresas.nota_interna_pago IS 'Notas internas del administrador sobre el pago de la empresa';
COMMENT ON COLUMN usuarios.fecha_activacion_modo_pago IS 'Fecha en que se activó el modo pago para este usuario';
COMMENT ON COLUMN empresas.fecha_activacion_modo_pago IS 'Fecha en que se activó el modo pago para esta empresa';
