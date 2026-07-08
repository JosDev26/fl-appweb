-- =============================================
-- Migración: reemplazar solicitud_id (FK a solicitudes) por
-- solicitud_caso_id_pagados (JSONB con lista de solicitudes Y casos)
--
-- Problema: solicitud_id era TEXT REFERENCES solicitudes(id) (FK única),
-- por lo que NO podía almacenar ids de casos ni múltiples valores.
-- Además, en la BD estaba vacía (sin valores hasta ahora).
--
-- Nueva columna: solicitud_caso_id_pagados JSONB
--   { "solicitudes": ["<id>", ...], "casos": ["<id>", ...] }
--   - Pago selectivo / por solicitud: se puebla al subir/aprobar con los
--     expedientes pagados (solicitudes y/o casos).
--   - Pago mensual consolidado: NULL hasta que se pueble al aprobar.
--
-- Nota sobre backfill: NO se hace backfill aquí.
--   1) solicitud_id estaba vacía, así que no hay nada que migrar de ahí.
--   2) Conservar NULL como discriminador de "pago consolidado" es necesario
--      para los chequeos de unicidad de upload-comprobante (rama consolidada:
--      WHERE solicitud_caso_id_pagados IS NULL).
--   3) La fuente de verdad histórica de pagos de mensualidad por solicitud
--      sigue siendo la tabla mensualidad_pagos (ya con backfill propio).
--
-- La población de la columna al aprobar comprobantes (selectivo y
-- consolidado) se implementa en app/api/payment-receipts/route.ts.
-- =============================================

-- 1. Nueva columna JSONB
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS solicitud_caso_id_pagados JSONB;

COMMENT ON COLUMN public.payment_receipts.solicitud_caso_id_pagados IS
  'JSONB { "solicitudes": [...], "casos": [...] } con los expedientes cubiertos por este comprobante. NULL = pago mensual consolidado (sin poblar). Reemplaza a la antigua solicitud_id.';

-- 2. Índice GIN para consultas de pertenencia (¿qué receipts cubren un expediente?)
--    Acelera el operador @> (usado por .contains() de supabase-js).
CREATE INDEX IF NOT EXISTS idx_payment_receipts_expedientes_pagados
  ON public.payment_receipts USING GIN (solicitud_caso_id_pagados);

-- 3. Eliminar la columna vieja + su FK + su índice
DROP INDEX IF EXISTS idx_payment_receipts_solicitud;
ALTER TABLE public.payment_receipts
  DROP CONSTRAINT IF EXISTS payment_receipts_solicitud_id_fkey;
ALTER TABLE public.payment_receipts
  DROP COLUMN IF EXISTS solicitud_id;
