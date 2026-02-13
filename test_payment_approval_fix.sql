-- =============================================
-- TEST: Verificación del fix de aprobación de pagos
-- =============================================
-- Ejecutar en Supabase SQL Editor para verificar que el fix funciona.
-- Este script NO modifica datos, solo lee.
--
-- ANTES de usar: correr create_cliente_tiene_datos_pendientes.sql
--                y create_approve_payment_receipt_rpc.sql
-- =============================================

-- ===== TEST 1: Verificar que la función existe =====
SELECT 
  'TEST 1: Función cliente_tiene_datos_pendientes existe' AS test,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'cliente_tiene_datos_pendientes'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END AS resultado;

-- ===== TEST 2: Verificar que el RPC existe con nuevo parámetro =====
SELECT 
  'TEST 2: RPC approve_payment_receipt existe' AS test,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'approve_payment_receipt'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END AS resultado;

-- ===== TEST 3: Verificar mes activo actual =====
SELECT 
  'TEST 3: Mes activo calculado' AS test,
  fecha AS ultima_fecha_reporte,
  (date_trunc('month', fecha) - interval '1 month')::date AS mes_activo_inicio,
  (date_trunc('month', (date_trunc('month', fecha) - interval '1 month')::date) + interval '1 month - 1 day')::date AS mes_activo_fin
FROM historial_reportes
ORDER BY fecha DESC
LIMIT 1;

-- ===== TEST 4: SAXE (f4bd9c37) - Verificar datos pendientes =====
-- Este fue el caso que descubrió el bug
SELECT 
  'TEST 4: SAXE datos pendientes (auto-calc fechas)' AS test,
  cliente_tiene_datos_pendientes('f4bd9c37', 'empresa') AS resultado;

-- ===== TEST 5: Empresas con modoPago = true =====
SELECT 
  'TEST 5: Empresas con modoPago activo' AS test,
  id, nombre, "modoPago"
FROM empresas
WHERE "modoPago" = true;

-- ===== TEST 6: Verificar datos pendientes para TODAS las empresas con modoPago =====
SELECT 
  'TEST 6: Datos pendientes por empresa con modoPago' AS test,
  e.id, 
  e.nombre,
  cliente_tiene_datos_pendientes(e.id, 'empresa') AS datos_pendientes
FROM empresas e
WHERE e."modoPago" = true;

-- ===== TEST 7: Usuarios con modoPago = true =====
SELECT 
  'TEST 7: Usuarios con modoPago activo' AS test,
  id, nombre, "modoPago"
FROM usuarios
WHERE "modoPago" = true;

-- ===== TEST 8: Comprobantes pendientes =====
SELECT 
  'TEST 8: Comprobantes pendientes' AS test,
  pr.id, 
  pr.user_id, 
  pr.tipo_cliente, 
  pr.mes_pago, 
  pr.estado,
  pr.uploaded_at
FROM payment_receipts pr
WHERE pr.estado = 'pendiente'
ORDER BY pr.uploaded_at DESC;

-- ===== TEST 9: Simular escenario SAXE (Diciembre vs Enero) =====
-- Verificar que aprobar un pago de diciembre NO desactiva modoPago si hay datos enero
SELECT 
  'TEST 9: Simulación escenario SAXE' AS test,
  -- Enero (mes activo): ¿tiene datos?
  cliente_tiene_datos_pendientes('f4bd9c37', 'empresa', '2026-01-01'::date, '2026-01-31'::date) AS datos_enero,
  -- Diciembre (mes pagado): ¿tiene datos?
  cliente_tiene_datos_pendientes('f4bd9c37', 'empresa', '2025-12-01'::date, '2025-12-31'::date) AS datos_diciembre;

-- ===== TEST 10: Verificar trigger sigue funcionando =====
-- El trigger activar_modo_pago() no fue modificado, solo verificar que existe
SELECT 
  'TEST 10: Trigger activar_modo_pago existe' AS test,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'trigger_activar_modo_pago'
  ) THEN '✅ PASS' ELSE '❌ FAIL' END AS resultado;

-- ===== RESUMEN =====
SELECT '================================' AS "===================";
SELECT 'FIX SUMMARY' AS info;
SELECT '================================' AS "===================";
SELECT 'El fix modifica approve_payment_receipt para verificar datos pendientes' AS detalle
UNION ALL
SELECT 'antes de desactivar modoPago. Esto evita el escenario donde:'
UNION ALL
SELECT '1. Trigger activa modoPago para mes actual (ej: enero)'
UNION ALL
SELECT '2. Admin aprueba pago de mes anterior (ej: diciembre)'
UNION ALL  
SELECT '3. RPC desactivaba modoPago incondicionalmente → BUG'
UNION ALL
SELECT '4. Con el fix: RPC verifica si hay datos pendientes en mes activo'
UNION ALL
SELECT '5. Si hay datos pendientes → modoPago permanece activo ✅';
