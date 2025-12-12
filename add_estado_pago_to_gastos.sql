-- Agregar columna estado_pago a la tabla gastos
-- Esta columna indica si un gasto ha sido pagado o está pendiente

-- 1. Agregar la columna
ALTER TABLE gastos 
ADD COLUMN IF NOT EXISTS estado_pago TEXT;

-- 2. Establecer valor por defecto
ALTER TABLE gastos 
ALTER COLUMN estado_pago SET DEFAULT 'pendiente';

-- 3. Agregar constraint para validar valores
ALTER TABLE gastos 
ADD CONSTRAINT check_estado_pago 
CHECK (estado_pago IN ('pendiente', 'pagado', 'pendiente_mes_actual', 'pendiente_anterior'));

-- 4. Actualizar registros existentes (por defecto pendiente)
UPDATE gastos 
SET estado_pago = 'pendiente' 
WHERE estado_pago IS NULL;

-- 5. Hacer la columna NOT NULL después de establecer valores
ALTER TABLE gastos 
ALTER COLUMN estado_pago SET NOT NULL;

-- 6. Crear índice para mejorar consultas
CREATE INDEX IF NOT EXISTS idx_gastos_estado_pago ON gastos(estado_pago);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha_estado ON gastos(fecha, estado_pago);

-- 7. Comentario explicativo
COMMENT ON COLUMN gastos.estado_pago IS 'Estado de pago del gasto: pendiente (no pagado), pagado (comprobante aprobado), pendiente_mes_actual, pendiente_anterior';
