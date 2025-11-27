-- ============================================================================
-- SCRIPT: Desactivar manualmente modoPago de clientes sin datos de noviembre
-- ============================================================================
-- PROPÓSITO:
--   Desactivar modoPago de usuarios/empresas que NO tienen horas, gastos
--   ni mensualidades activas para el mes de noviembre 2025
--
-- CUÁNDO USAR:
--   Cuando el trigger se ejecutó antes de actualizar la función, dejando
--   clientes activados incorrectamente
-- ============================================================================

-- PASO 1: Desactivar USUARIOS sin datos de noviembre
UPDATE usuarios
SET "modoPago" = false
WHERE "modoPago" = true
  AND id NOT IN (
    -- Usuarios con horas en noviembre (casos)
    SELECT DISTINCT c.id_cliente
    FROM trabajos_por_hora tph
    INNER JOIN casos c ON tph.caso_asignado = c.id
    WHERE tph.fecha >= '2025-11-01'::date
      AND tph.fecha <= '2025-11-30'::date
      AND c.id_cliente IS NOT NULL
    
    UNION
    
    -- Usuarios con horas en noviembre (directas)
    SELECT DISTINCT tph.id_cliente
    FROM trabajos_por_hora tph
    WHERE tph.fecha >= '2025-11-01'::date
      AND tph.fecha <= '2025-11-30'::date
      AND tph.id_cliente IS NOT NULL
    
    UNION
    
    -- Usuarios con mensualidades activas
    SELECT DISTINCT s.id_cliente
    FROM solicitudes s
    WHERE LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
      AND s.id_cliente IS NOT NULL
      AND (
        s.estado_pago IS NULL 
        OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado')
      )
      AND (
        s.monto_pagado IS NULL 
        OR s.total_a_pagar IS NULL 
        OR s.monto_pagado < s.total_a_pagar
      )
    
    UNION
    
    -- Usuarios con gastos en noviembre
    SELECT DISTINCT g.id_cliente
    FROM gastos g
    WHERE g.fecha >= '2025-11-01'::date
      AND g.fecha <= '2025-11-30'::date
      AND g.id_cliente IS NOT NULL
      AND g.total_cobro > 0
  );

-- PASO 2: Desactivar EMPRESAS sin datos de noviembre
UPDATE empresas
SET "modoPago" = false
WHERE "modoPago" = true
  AND id NOT IN (
    -- Empresas con horas en noviembre
    SELECT DISTINCT c.id_cliente
    FROM casos c
    WHERE EXISTS (
      SELECT 1
      FROM trabajos_por_hora tph
      WHERE tph.caso_asignado = c.id
        AND tph.fecha >= '2025-11-01'::date
        AND tph.fecha <= '2025-11-30'::date
    )
    AND c.id_cliente IS NOT NULL
    
    UNION
    
    -- Empresas con mensualidades activas
    SELECT DISTINCT s.id_cliente
    FROM solicitudes s
    WHERE LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
      AND s.id_cliente IS NOT NULL
      AND (
        s.estado_pago IS NULL 
        OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado')
      )
      AND (
        s.monto_pagado IS NULL 
        OR s.total_a_pagar IS NULL 
        OR s.monto_pagado < s.total_a_pagar
      )
    
    UNION
    
    -- Empresas con gastos en noviembre
    SELECT DISTINCT g.id_cliente
    FROM gastos g
    WHERE g.fecha >= '2025-11-01'::date
      AND g.fecha <= '2025-11-30'::date
      AND g.id_cliente IS NOT NULL
      AND g.total_cobro > 0
  );

-- Mensaje de confirmación
DO $$
DECLARE
  usuarios_desactivados int;
  empresas_desactivadas int;
BEGIN
  SELECT COUNT(*) INTO usuarios_desactivados
  FROM usuarios
  WHERE "modoPago" = false;
  
  SELECT COUNT(*) INTO empresas_desactivadas
  FROM empresas
  WHERE "modoPago" = false;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Limpieza completada';
  RAISE NOTICE '📊 Usuarios con modoPago = false: %', usuarios_desactivados;
  RAISE NOTICE '📊 Empresas con modoPago = false: %', empresas_desactivadas;
  RAISE NOTICE '========================================';
  RAISE NOTICE '💡 Ahora ejecuta los scripts de diagnóstico actualizados';
  RAISE NOTICE '   para verificar que solo están activos los correctos';
END $$;
