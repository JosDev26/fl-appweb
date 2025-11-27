-- Script de diagnóstico para identificar por qué clientes tienen modoPago activado
-- Ejecutar en Supabase SQL Editor

-- Definir el mes a verificar (cambiar según necesites)
DO $$
DECLARE
  inicio_mes date := '2025-11-01'::date;
  fin_mes date := '2025-11-30'::date;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '🔍 DIAGNÓSTICO modoPago';
  RAISE NOTICE '📅 Mes: % hasta %', inicio_mes, fin_mes;
  RAISE NOTICE '========================================';
END $$;

-- 1. USUARIOS CON modoPago = true
SELECT 
  'USUARIO' as tipo,
  u.id,
  u.nombre,
  u.cedula,
  u."modoPago",
  -- Verificar si tiene horas en noviembre
  (SELECT COUNT(*) 
   FROM trabajos_por_hora tph 
   INNER JOIN casos c ON tph.caso_asignado = c.id 
   WHERE c.id_cliente = u.id 
     AND tph.fecha >= '2025-11-01'::date 
     AND tph.fecha <= '2025-11-30'::date
  ) as horas_noviembre_via_casos,
  (SELECT COUNT(*) 
   FROM trabajos_por_hora tph 
   WHERE tph.id_cliente = u.id 
     AND tph.fecha >= '2025-11-01'::date 
     AND tph.fecha <= '2025-11-30'::date
  ) as horas_noviembre_directas,
  -- Verificar mensualidades
  (SELECT COUNT(*) 
   FROM solicitudes s 
   WHERE s.id_cliente = u.id 
     AND LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
     AND (s.estado_pago IS NULL OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado'))
  ) as mensualidades_activas,
  -- Verificar gastos en noviembre
  (SELECT COUNT(*) 
   FROM gastos g 
   WHERE g.id_cliente = u.id 
     AND g.fecha >= '2025-11-01'::date 
     AND g.fecha <= '2025-11-30'::date
  ) as gastos_noviembre
FROM usuarios u
WHERE u."modoPago" = true
ORDER BY u.nombre;

-- 2. EMPRESAS CON modoPago = true
SELECT 
  'EMPRESA' as tipo,
  e.id,
  e.nombre,
  e.cedula,
  e."modoPago",
  -- Verificar si tiene horas en noviembre
  (SELECT COUNT(*) 
   FROM casos c
   WHERE c.id_cliente = e.id
     AND EXISTS (
       SELECT 1 FROM trabajos_por_hora tph 
       WHERE tph.caso_asignado = c.id 
         AND tph.fecha >= '2025-11-01'::date 
         AND tph.fecha <= '2025-11-30'::date
     )
  ) as casos_con_horas_noviembre,
  -- Verificar mensualidades
  (SELECT COUNT(*) 
   FROM solicitudes s 
   WHERE s.id_cliente = e.id 
     AND LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
     AND (s.estado_pago IS NULL OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado'))
  ) as mensualidades_activas,
  -- Verificar gastos en noviembre
  (SELECT COUNT(*) 
   FROM gastos g 
   WHERE g.id_cliente = e.id 
     AND g.fecha >= '2025-11-01'::date 
     AND g.fecha <= '2025-11-30'::date
  ) as gastos_noviembre
FROM empresas e
WHERE e."modoPago" = true
ORDER BY e.nombre;

-- 3. DETALLE DE MENSUALIDADES (para ver cuáles están activando el modoPago)
SELECT 
  s.id,
  s.titulo,
  s.id_cliente,
  COALESCE(u.nombre, emp.nombre) as cliente_nombre,
  s.modalidad_pago,
  s.estado_pago,
  s.monto_pagado,
  s.total_a_pagar,
  s.costo_neto,
  s.cantidad_cuotas,
  s.monto_por_cuota,
  CASE 
    WHEN s.monto_pagado IS NULL OR s.total_a_pagar IS NULL OR s.monto_pagado < s.total_a_pagar 
    THEN '✅ ACTIVARÍA modoPago'
    ELSE '❌ NO activaría'
  END as activaria_modo_pago
FROM solicitudes s
LEFT JOIN usuarios u ON s.id_cliente = u.id
LEFT JOIN empresas emp ON s.id_cliente = emp.id
WHERE LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
  AND (s.estado_pago IS NULL OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado'))
ORDER BY s.id_cliente, s.titulo;

-- 4. RESUMEN
SELECT 
  'Total usuarios con modoPago=true' as descripcion,
  COUNT(*) as cantidad
FROM usuarios 
WHERE "modoPago" = true
UNION ALL
SELECT 
  'Total empresas con modoPago=true',
  COUNT(*)
FROM empresas 
WHERE "modoPago" = true;
