-- =============================================
-- Migración: agregar columna solicitud_id a payment_receipts
-- 
-- Permite vincular un comprobante de pago a una solicitud específica
-- (tipo etapa finalizada o pago único). Para mensualidades el campo
-- permanece NULL y el comportamiento actual no cambia.
-- =============================================

ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS solicitud_id TEXT REFERENCES public.solicitudes(id) ON DELETE SET NULL;

-- Índice para búsquedas por solicitud
CREATE INDEX IF NOT EXISTS idx_payment_receipts_solicitud
  ON public.payment_receipts (solicitud_id)
  WHERE solicitud_id IS NOT NULL;

-- Comentario descriptivo
COMMENT ON COLUMN public.payment_receipts.solicitud_id IS
  'ID de la solicitud específica que se está pagando (etapa finalizada / pago único). NULL para pagos mensuales consolidados.';
