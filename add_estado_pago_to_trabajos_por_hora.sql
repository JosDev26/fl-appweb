-- Add estado_pago column to trabajos_por_hora table
-- This enables tracking payment status for carry-forward billing
-- New records: default 'pendiente' (will carry forward if unpaid)
-- NOTE: All existing records will be set to 'pendiente' by default.
--   After running this migration, you should manually mark old/paid items:
--   UPDATE trabajos_por_hora SET estado_pago = 'pagado' WHERE fecha < '2025-01-01';
--   (adjust the date based on your last fully-paid billing cycle)

ALTER TABLE trabajos_por_hora 
  ADD COLUMN IF NOT EXISTS estado_pago text DEFAULT 'pendiente';

-- Create an index for the carry-forward query performance
CREATE INDEX IF NOT EXISTS idx_trabajos_por_hora_estado_pago 
  ON trabajos_por_hora (id_cliente, estado_pago, fecha);

CREATE INDEX IF NOT EXISTS idx_trabajos_por_hora_caso_estado 
  ON trabajos_por_hora (caso_asignado, estado_pago, fecha);
