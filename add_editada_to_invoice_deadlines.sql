-- Agregar columna 'editada' a invoice_payment_deadlines
-- Indica si la factura fue editada/reemplazada después de su subida original
ALTER TABLE public.invoice_payment_deadlines 
    ADD COLUMN IF NOT EXISTS editada BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.invoice_payment_deadlines.editada IS 'true si la factura fue editada o reemplazada. El admin puede resetear a false.';
