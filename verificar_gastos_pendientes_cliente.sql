-- ============================================================================
-- SCRIPT: Verificar gastos pendientes de meses anteriores para un cliente
-- ============================================================================
-- PROPÓSITO:
--   Verificar que los gastos con estado_pago='pendiente' de meses anteriores
--   se están calculando correctamente para mostrar en /vista-pago y /pago
-- ============================================================================

-- CAMBIAR ESTOS VALORES SEGÚN EL CLIENTE A VERIFICAR
-- Ejemplo: Natalia Ugalde Morales
-- ============================================================================

-- 1. Buscar el cliente por nombre (para obtener su ID)
SELECT id, nombre, cedula, 'usuario' as tipo
FROM usuarios 
WHERE nombre ILIKE '%Natalia%Ugalde%'
UNION ALL
SELECT id, nombre, cedula, 'empresa' as tipo
FROM empresas 
WHERE nombre ILIKE '%Natalia%Ugalde%';

-- ============================================================================
-- 2. Ver TODOS los gastos del cliente (reemplazar ID según resultado anterior)
-- ============================================================================
-- Para usuarios: usar id_cliente = 'ID_DEL_USUARIO'
-- Para empresas: usar id_cliente = 'ID_DE_EMPRESA'

SELECT 
  g.id,
  g.fecha,
  g.descripcion,
  g.total_cobro,
  g.estado_pago,
  CASE 
    WHEN g.fecha < '2026-01-01' THEN '⚠️ MES ANTERIOR'
    ELSE '✅ MES ACTUAL'
  END as periodo,
  CASE 
    WHEN g.estado_pago = 'pendiente' AND g.fecha < '2026-01-01' THEN '🔴 DEBE ARRASTRARSE'
    WHEN g.estado_pago = 'pendiente' THEN '🟡 PENDIENTE ACTUAL'
    WHEN g.estado_pago = 'pagado' THEN '🟢 PAGADO'
    WHEN g.estado_pago = 'cancelado' THEN '⚫ CANCELADO'
    ELSE g.estado_pago
  END as clasificacion
FROM gastos g
WHERE g.id_cliente IN (
  SELECT id FROM usuarios WHERE nombre ILIKE '%Natalia%Ugalde%'
  UNION ALL
  SELECT id FROM empresas WHERE nombre ILIKE '%Natalia%Ugalde%'
)
ORDER BY g.fecha DESC;

-- ============================================================================
-- 3. GASTOS PENDIENTES DE MESES ANTERIORES (lo que debe mostrar /vista-pago)
-- ============================================================================
-- Estos son los gastos que deben aparecer en "⚠️ Gastos de Meses Anteriores"

SELECT 
  g.id,
  g.fecha,
  g.descripcion,
  g.total_cobro,
  g.estado_pago
FROM gastos g
WHERE g.id_cliente IN (
  SELECT id FROM usuarios WHERE nombre ILIKE '%Natalia%Ugalde%'
  UNION ALL
  SELECT id FROM empresas WHERE nombre ILIKE '%Natalia%Ugalde%'
)
AND g.estado_pago = 'pendiente'
AND g.fecha < '2026-01-01'  -- Antes del mes actual (enero 2026 -> fecha actual es Feb 2026, mes de pago es Enero)
AND g.fecha >= '2025-01-01' -- Máximo 12 meses atrás
ORDER BY g.fecha DESC;

-- ============================================================================
-- 4. TOTALES ESPERADOS para verificar contra /vista-pago
-- ============================================================================

SELECT 
  'Gastos Meses Anteriores (pendientes)' as concepto,
  COALESCE(SUM(g.total_cobro), 0) as total
FROM gastos g
WHERE g.id_cliente IN (
  SELECT id FROM usuarios WHERE nombre ILIKE '%Natalia%Ugalde%'
  UNION ALL
  SELECT id FROM empresas WHERE nombre ILIKE '%Natalia%Ugalde%'
)
AND g.estado_pago = 'pendiente'
AND g.fecha < '2026-01-01'
AND g.fecha >= '2025-01-01'

UNION ALL

SELECT 
  'Gastos Mes Actual (no cancelados)' as concepto,
  COALESCE(SUM(g.total_cobro), 0) as total
FROM gastos g
WHERE g.id_cliente IN (
  SELECT id FROM usuarios WHERE nombre ILIKE '%Natalia%Ugalde%'
  UNION ALL
  SELECT id FROM empresas WHERE nombre ILIKE '%Natalia%Ugalde%'
)
AND g.estado_pago != 'cancelado'
AND g.fecha >= '2026-01-01'
AND g.fecha < '2026-02-01';

-- ============================================================================
-- 5. RESUMEN COMPLETO (simula lo que calcula /api/vista-pago)
-- ============================================================================

WITH cliente AS (
  SELECT id, nombre, 'usuario' as tipo FROM usuarios WHERE nombre ILIKE '%Natalia%Ugalde%'
  UNION ALL
  SELECT id, nombre, 'empresa' as tipo FROM empresas WHERE nombre ILIKE '%Natalia%Ugalde%'
),
gastos_mes_actual AS (
  SELECT COALESCE(SUM(total_cobro), 0) as total
  FROM gastos g, cliente c
  WHERE g.id_cliente = c.id
    AND g.estado_pago != 'cancelado'
    AND g.fecha >= '2026-01-01'
    AND g.fecha < '2026-02-01'
),
gastos_anteriores AS (
  SELECT COALESCE(SUM(total_cobro), 0) as total
  FROM gastos g, cliente c
  WHERE g.id_cliente = c.id
    AND g.estado_pago = 'pendiente'
    AND g.fecha < '2026-01-01'
    AND g.fecha >= '2025-01-01'
)
SELECT 
  c.nombre,
  gma.total as "Gastos Mes Actual",
  ga.total as "⚠️ Gastos Meses Anteriores",
  (gma.total + ga.total) as "Total Gastos (debe incluir ambos)"
FROM cliente c, gastos_mes_actual gma, gastos_anteriores ga;

-- ============================================================================
-- NOTAS:
-- - El mes de pago es ENERO 2026 (mes anterior a la fecha actual Feb 2026)
-- - Los gastos con fecha < 2026-01-01 y estado_pago='pendiente' deben arrastrarse
-- - Los gastos 'cancelado' NUNCA se incluyen
-- - Máximo 12 meses hacia atrás (fecha >= 2025-01-01)
-- ============================================================================
