-- =============================================
-- Migración: tabla mensualidad_pagos
--
-- Trackea qué meses de mensualidad han sido pagados por cada solicitud.
-- Reemplaza la inferencia heurística anterior (que solo miraba el saldo
-- global de la solicitud) y permite:
--   - Saber cuál fue el último mes pagado por cliente/solicitud.
--   - Listar los meses pendientes hasta el mes seleccionado.
--   - Soportar pagos no secuenciales (ej: pagar mayo sin haber pagado abril).
--
-- Backfill: migra los pagos históricos desde payment_receipts aprobados
-- que NO tienen solicitud_id (es decir, pagos mensuales consolidados).
-- Para cada uno, inserta una fila por solicitud de mensualidad del cliente.
-- =============================================

CREATE TABLE IF NOT EXISTS public.mensualidad_pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id TEXT NOT NULL REFERENCES public.solicitudes(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  tipo_cliente TEXT NOT NULL CHECK (tipo_cliente IN ('cliente', 'empresa')),
  mes_pago TEXT NOT NULL, -- Formato YYYY-MM
  receipt_id UUID REFERENCES public.payment_receipts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Una solicitud de mensualidad no puede tener dos pagos para el mismo mes
CREATE UNIQUE INDEX IF NOT EXISTS idx_mensualidad_pagos_solicitud_mes
  ON public.mensualidad_pagos (solicitud_id, mes_pago);

-- Índices para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_mensualidad_pagos_client
  ON public.mensualidad_pagos (client_id, tipo_cliente);
CREATE INDEX IF NOT EXISTS idx_mensualidad_pagos_mes
  ON public.mensualidad_pagos (mes_pago);
CREATE INDEX IF NOT EXISTS idx_mensualidad_pagos_receipt
  ON public.mensualidad_pagos (receipt_id);

COMMENT ON TABLE public.mensualidad_pagos IS
  'Registro de meses de mensualidad pagados por solicitud. Fuente de verdad para determinar meses pendientes.';
COMMENT ON COLUMN public.mensualidad_pagos.solicitud_id IS 'Solicitud de mensualidad pagada';
COMMENT ON COLUMN public.mensualidad_pagos.client_id IS 'ID del cliente/empresa que pagó';
COMMENT ON COLUMN public.mensualidad_pagos.mes_pago IS 'Mes pagado en formato YYYY-MM';
COMMENT ON COLUMN public.mensualidad_pagos.receipt_id IS 'Comprobante de pago que originó este registro';

-- Habilitar RLS (la seguridad se maneja en el backend, igual que payment_receipts)
ALTER TABLE public.mensualidad_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public reads on mensualidad_pagos"
  ON public.mensualidad_pagos FOR SELECT
  TO public
  USING (true);
CREATE POLICY "Allow public inserts on mensualidad_pagos"
  ON public.mensualidad_pagos FOR INSERT
  TO public
  WITH CHECK (true);
CREATE POLICY "Allow public updates on mensualidad_pagos"
  ON public.mensualidad_pagos FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- =============================================
-- BACKFILL: migrar pagos históricos de mensualidad
-- =============================================
-- Para cada comprobante aprobado sin solicitud_id (pago mensual consolidado),
-- insertar una fila en mensualidad_pagos por cada solicitud de mensualidad
-- del cliente correspondiente, usando el mes_pago del comprobante.
-- ON CONFLICT evita duplicados si se corre múltiples veces.

INSERT INTO public.mensualidad_pagos (solicitud_id, client_id, tipo_cliente, mes_pago, receipt_id, created_at)
SELECT
  s.id AS solicitud_id,
  r.user_id AS client_id,
  r.tipo_cliente AS tipo_cliente,
  r.mes_pago AS mes_pago,
  r.id AS receipt_id,
  COALESCE(r.reviewed_at, r.updated_at, NOW()) AS created_at
FROM public.payment_receipts r
JOIN public.solicitudes s
  ON s.id_cliente = r.user_id
  AND LOWER(s.modalidad_pago) LIKE '%mensualidad%'
WHERE r.estado = 'aprobado'
  AND r.solicitud_id IS NULL
  AND r.mes_pago IS NOT NULL
  AND r.mes_pago ~ '^\d{4}-(0[1-9]|1[0-2])$'
ON CONFLICT (solicitud_id, mes_pago) DO NOTHING;
