-- Agregar columna 'editada' a payment_receipts
-- Indica si el comprobante fue editado/reemplazado por un admin
ALTER TABLE public.payment_receipts 
    ADD COLUMN IF NOT EXISTS editada BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.payment_receipts.editada IS 'true si el comprobante fue editado o reemplazado por admin. Se puede resetear.';
