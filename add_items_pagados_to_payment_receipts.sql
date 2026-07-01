-- =============================================
-- Migración: agregar columna items_pagados a payment_receipts
--
-- Almacena los IDs de los items específicos que se pagan con un comprobante
-- (solo usado en el flujo de "Pagar por cliente" del panel admin /dev).
-- Permite el marcado selectivo de items al aprobar, en lugar de marcar
-- automáticamente todos los items del mes.
--
-- Estructura JSON:
-- {
--   "gastos": ["<id>", ...],
--   "servicios": ["<id>", ...],
--   "tph": ["<id>", ...],
--   "mensualidades": [ { "solicitudId": "<id>", "mes": "YYYY-MM" }, ... ]
-- }
--
-- Si items_pagados es NULL, el flujo de aprobación mantiene el comportamiento
-- anterior (marca todos los items del mes + carry-forward). Así las subidas
-- de clientes desde /pago no se ven afectadas.
-- =============================================

ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS items_pagados JSONB;

COMMENT ON COLUMN public.payment_receipts.items_pagados IS
  'JSON con IDs de items específicos a marcar como pagados (solo admin /dev). NULL = comportamiento anterior (marcar todo el mes).';
