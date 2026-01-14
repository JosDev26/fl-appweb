-- ============================================================================
-- SCRIPT: Recalcular totales de servicios profesionales con decimales correctos
-- ============================================================================
-- PROPÓSITO:
--   Recalcular el campo `total` sumando costo + gastos + iva para preservar
--   los decimales que pueden haberse perdido en la sincronización.
-- ============================================================================

-- 1. Ver registros donde el total no coincide con la suma de componentes
SELECT 
  id,
  id_cliente,
  fecha,
  costo,
  gastos,
  iva,
  total as total_actual,
  COALESCE(costo, 0) + COALESCE(gastos, 0) + COALESCE(iva, 0) as total_calculado,
  total - (COALESCE(costo, 0) + COALESCE(gastos, 0) + COALESCE(iva, 0)) as diferencia
FROM servicios_profesionales
WHERE ABS(total - (COALESCE(costo, 0) + COALESCE(gastos, 0) + COALESCE(iva, 0))) > 0.001
ORDER BY fecha DESC;

-- 2. Actualizar todos los totales para que coincidan con la suma de componentes
UPDATE servicios_profesionales
SET total = COALESCE(costo, 0) + COALESCE(gastos, 0) + COALESCE(iva, 0)
WHERE ABS(total - (COALESCE(costo, 0) + COALESCE(gastos, 0) + COALESCE(iva, 0))) > 0.001;

-- 3. Verificar el resultado
SELECT 
  id,
  id_cliente,
  fecha,
  costo,
  gastos,
  iva,
  total,
  COALESCE(costo, 0) + COALESCE(gastos, 0) + COALESCE(iva, 0) as verificacion
FROM servicios_profesionales
WHERE fecha >= '2025-12-01'
ORDER BY fecha DESC
LIMIT 20;

-- ============================================================================
-- NOTA: Este script recalcula el total como suma de (costo + gastos + iva)
-- Solo actualiza registros donde hay diferencia > 0.001
-- ============================================================================
