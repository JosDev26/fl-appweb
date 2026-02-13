-- =============================================
-- DIAGNÓSTICO POST-FIX: ¿Quién necesita corrección retroactiva?
-- =============================================
-- Ejecutar en Supabase SQL Editor
-- Este script identifica clientes en estado incorrecto después del fix.
-- NO MODIFICA datos, solo lee.
-- =============================================

-- ===== 1. Mes activo actual =====
SELECT 
  '1. MES ACTIVO ACTUAL' AS seccion,
  fecha AS ultima_fecha_reporte,
  (date_trunc('month', fecha) - interval '1 month')::date AS mes_activo_inicio,
  (date_trunc('month', (date_trunc('month', fecha) - interval '1 month')::date) + interval '1 month - 1 day')::date AS mes_activo_fin
FROM historial_reportes ORDER BY fecha DESC LIMIT 1;

-- ===== 2. Comprobantes de ENERO aprobados =====
-- Estos clientes ya pagaron enero y les desactivaron modoPago
SELECT 
  '2. RECEIPTS ENERO APROBADOS' AS seccion,
  pr.user_id,
  pr.tipo_cliente,
  pr.mes_pago,
  pr.estado,
  pr.reviewed_at AS fecha_aprobacion,
  CASE 
    WHEN pr.tipo_cliente = 'empresa' THEN (SELECT nombre FROM empresas WHERE id = pr.user_id)
    ELSE (SELECT nombre FROM usuarios WHERE id = pr.user_id)
  END AS nombre_cliente,
  CASE 
    WHEN pr.tipo_cliente = 'empresa' THEN (SELECT "modoPago" FROM empresas WHERE id = pr.user_id)
    ELSE (SELECT "modoPago" FROM usuarios WHERE id = pr.user_id)
  END AS modo_pago_actual
FROM payment_receipts pr
WHERE pr.estado = 'aprobado'
  AND pr.mes_pago = '2026-01'
ORDER BY pr.reviewed_at DESC;

-- ===== 3. CASO CRÍTICO: Clientes con modoPago=false que DEBERÍAN tener true =====
-- Estos son clientes que tienen datos en el mes activo pero modoPago=false
-- (pueden ser víctimas del bug)

-- 3a. Empresas con datos pendientes pero modoPago=false
SELECT 
  '3a. EMPRESAS: modoPago=false PERO con datos pendientes' AS seccion,
  e.id,
  e.nombre,
  e."modoPago",
  cliente_tiene_datos_pendientes(e.id, 'empresa') AS datos_pendientes
FROM empresas e
WHERE e."modoPago" = false
  AND (cliente_tiene_datos_pendientes(e.id, 'empresa')->>'tieneDatos')::boolean = true;

-- 3b. Usuarios con datos pendientes pero modoPago=false
SELECT 
  '3b. USUARIOS: modoPago=false PERO con datos pendientes' AS seccion,
  u.id,
  u.nombre,
  u."modoPago",
  cliente_tiene_datos_pendientes(u.id, 'cliente') AS datos_pendientes
FROM usuarios u
WHERE u."modoPago" = false
  AND (cliente_tiene_datos_pendientes(u.id, 'cliente')->>'tieneDatos')::boolean = true;

-- ===== 4. Clientes con modoPago=true (estado correcto, esperando pago) =====
SELECT 
  '4. CLIENTES CON modoPago=true (esperando pago)' AS seccion,
  'empresa' AS tipo,
  e.id,
  e.nombre
FROM empresas e WHERE e."modoPago" = true
UNION ALL
SELECT 
  '4. CLIENTES CON modoPago=true (esperando pago)' AS seccion,
  'usuario' AS tipo,
  u.id,
  u.nombre
FROM usuarios u WHERE u."modoPago" = true;

-- ===== 5. Comprobantes aprobados de meses ANTERIORES a enero =====
-- Estos son los que pudieron causar el bug (aprobaron dic/nov/etc y desactivaron modoPago)
SELECT 
  '5. RECEIPTS DE MESES ANTERIORES APROBADOS' AS seccion,
  pr.user_id,
  pr.tipo_cliente,
  pr.mes_pago,
  pr.estado,
  pr.reviewed_at AS fecha_aprobacion,
  CASE 
    WHEN pr.tipo_cliente = 'empresa' THEN (SELECT nombre FROM empresas WHERE id = pr.user_id)
    ELSE (SELECT nombre FROM usuarios WHERE id = pr.user_id)
  END AS nombre_cliente,
  CASE 
    WHEN pr.tipo_cliente = 'empresa' THEN (SELECT "modoPago" FROM empresas WHERE id = pr.user_id)
    ELSE (SELECT "modoPago" FROM usuarios WHERE id = pr.user_id)
  END AS modo_pago_actual
FROM payment_receipts pr
WHERE pr.estado = 'aprobado'
  AND pr.mes_pago < '2026-01'
  AND pr.reviewed_at >= '2026-02-01'  -- Aprobados en febrero (después del trigger de enero)
ORDER BY pr.reviewed_at DESC;

-- ===== 6. Resumen de acción requerida =====
-- Empresas que necesitan reactivación manual
SELECT 
  '6. ⚠️ EMPRESAS QUE NECESITAN REACTIVACIÓN MANUAL' AS seccion,
  e.id,
  e.nombre,
  '→ Ejecutar: UPDATE empresas SET "modoPago" = true WHERE id = ''' || e.id || ''';' AS sql_fix
FROM empresas e
WHERE e."modoPago" = false
  AND (cliente_tiene_datos_pendientes(e.id, 'empresa')->>'tieneDatos')::boolean = true;

-- Usuarios que necesitan reactivación manual
SELECT 
  '6. ⚠️ USUARIOS QUE NECESITAN REACTIVACIÓN MANUAL' AS seccion,
  u.id,
  u.nombre,
  '→ Ejecutar: UPDATE usuarios SET "modoPago" = true WHERE id = ''' || u.id || ''';' AS sql_fix
FROM usuarios u
WHERE u."modoPago" = false
  AND (cliente_tiene_datos_pendientes(u.id, 'cliente')->>'tieneDatos')::boolean = true;
