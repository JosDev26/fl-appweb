-- Migración: Eliminar columnas de vencimiento y recordatorios de invoice_payment_deadlines
-- Ejecutar este script si la tabla ya existe en producción

-- Eliminar índice de vencimiento
DROP INDEX IF EXISTS idx_invoice_deadlines_vencimiento;

-- Eliminar columnas
ALTER TABLE public.invoice_payment_deadlines 
  DROP COLUMN IF EXISTS fecha_vencimiento,
  DROP COLUMN IF EXISTS dias_plazo,
  DROP COLUMN IF EXISTS recordatorio_enviado_7d,
  DROP COLUMN IF EXISTS recordatorio_enviado_3d,
  DROP COLUMN IF EXISTS recordatorio_enviado_vencimiento;

-- Actualizar constraint de estado_pago para quitar 'vencido'
-- Primero eliminar el constraint existente
ALTER TABLE public.invoice_payment_deadlines 
  DROP CONSTRAINT IF EXISTS invoice_payment_deadlines_estado_pago_check;

-- Crear nuevo constraint sin 'vencido'
ALTER TABLE public.invoice_payment_deadlines 
  ADD CONSTRAINT invoice_payment_deadlines_estado_pago_check 
  CHECK (estado_pago IN ('pendiente', 'pagado'));

-- Actualizar registros que tengan estado 'vencido' a 'pendiente'
UPDATE public.invoice_payment_deadlines 
  SET estado_pago = 'pendiente' 
  WHERE estado_pago = 'vencido';

-- Actualizar comentarios
COMMENT ON TABLE public.invoice_payment_deadlines IS 'Gestión de facturas electrónicas mensuales';
COMMENT ON COLUMN public.invoice_payment_deadlines.fecha_emision IS 'Fecha en que se subió la factura';
COMMENT ON COLUMN public.invoice_payment_deadlines.estado_pago IS 'pendiente: esperando pago, pagado: comprobante aprobado';
