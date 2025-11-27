-- Agregar columnas de IVA a la tabla solicitudes
-- IMPORTANTE: NO modifica columnas existentes, solo agrega las nuevas

-- 1. Agregar columna se_cobra_iva (boolean)
ALTER TABLE solicitudes
ADD COLUMN IF NOT EXISTS se_cobra_iva boolean DEFAULT false;

-- 2. Agregar columna monto_iva (numeric para valores monetarios)
ALTER TABLE solicitudes
ADD COLUMN IF NOT EXISTS monto_iva numeric(15,2);

-- 3. Crear índices para mejorar el rendimiento (opcional)
CREATE INDEX IF NOT EXISTS idx_solicitudes_se_cobra_iva ON solicitudes(se_cobra_iva);
CREATE INDEX IF NOT EXISTS idx_solicitudes_monto_iva ON solicitudes(monto_iva);

-- 4. Comentarios explicativos
COMMENT ON COLUMN solicitudes.se_cobra_iva IS 'Indica si se cobra IVA en esta solicitud (columna K de Sheets: SeCobra_IVA)';
COMMENT ON COLUMN solicitudes.monto_iva IS 'Monto del IVA a cobrar (columna L de Sheets: Monto_IVA)';

-- 5. Verificar que las columnas se agregaron correctamente
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'solicitudes'
  AND column_name IN ('se_cobra_iva', 'monto_iva')
ORDER BY ordinal_position;
