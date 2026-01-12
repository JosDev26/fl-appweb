-- =============================================
-- Migración: Agregar estado_pago a servicios_profesionales
-- Descripción: Permite rastrear el estado de pago de cada servicio
-- =============================================

-- Agregar columna estado_pago con valor por defecto 'pendiente'
ALTER TABLE servicios_profesionales 
ADD COLUMN IF NOT EXISTS estado_pago TEXT DEFAULT 'pendiente';

-- Agregar CHECK constraint para validar valores permitidos
-- Nota: PostgreSQL no permite ADD CONSTRAINT IF NOT EXISTS,
-- entonces primero intentamos dropearlo si existe
DO $$ 
BEGIN
    -- Intentar eliminar constraint si existe
    ALTER TABLE servicios_profesionales 
    DROP CONSTRAINT IF EXISTS servicios_profesionales_estado_pago_check;
    
    -- Crear el constraint
    ALTER TABLE servicios_profesionales 
    ADD CONSTRAINT servicios_profesionales_estado_pago_check 
    CHECK (estado_pago IN ('pendiente', 'pagado', 'cancelado'));
EXCEPTION
    WHEN others THEN
        NULL; -- Ignorar errores si el constraint ya existe correctamente
END $$;

-- =============================================
-- Índices para optimizar queries de pagos
-- =============================================

-- Índice compuesto para queries por caso y estado de pago
-- Usado en: páginas de detalle de caso/solicitud
CREATE INDEX IF NOT EXISTS idx_servicios_profesionales_caso_estado 
ON servicios_profesionales(id_caso, estado_pago);

-- Índice compuesto para queries por cliente y fecha
-- Usado en: /api/datos-pago, /api/vista-pago, aprobación de comprobantes
CREATE INDEX IF NOT EXISTS idx_servicios_profesionales_cliente_fecha 
ON servicios_profesionales(id_cliente, fecha);

-- Índice para queries por estado de pago global
-- Usado en: reportes, filtros por estado
CREATE INDEX IF NOT EXISTS idx_servicios_profesionales_estado_pago 
ON servicios_profesionales(estado_pago);

-- =============================================
-- Actualizar registros existentes
-- =============================================

-- Todos los registros existentes empiezan como 'pendiente'
-- (ya cubierto por DEFAULT, pero por si acaso hay NULLs)
UPDATE servicios_profesionales 
SET estado_pago = 'pendiente' 
WHERE estado_pago IS NULL;

-- =============================================
-- Comentario de documentación
-- =============================================

COMMENT ON COLUMN servicios_profesionales.estado_pago IS 
'Estado de pago del servicio: pendiente (por defecto), pagado (al aprobar comprobante), cancelado (excluido de facturación)';
