-- ============================================================================
-- FUNCIÓN: activar_modo_pago
-- ============================================================================
-- PROPÓSITO:
--   Activar el botón "Ir a Pagar" para clientes que tengan horas/gastos del MES ANTERIOR
--
-- LÓGICA:
--   Cuando se inserta un registro en historial_reportes en los primeros 3 días
--   trabajables del mes, los clientes ven las horas/gastos del mes ANTERIOR.
--
-- EJEMPLO:
--   - Se inserta: historial_reportes con fecha = '2025-11-02' (lunes 2 de noviembre)
--   - Se activan: Clientes con horas/gastos de OCTUBRE (2025-10-01 a 2025-10-31)
--   - Resultado: Los clientes pueden pagar sus servicios de octubre
--
-- IMPORTANTE:
--   - Usa NEW.fecha del registro insertado (NO CURRENT_DATE)
--   - Filtra por el mes ANTERIOR a la fecha del reporte
--   - Mensualidades se activan siempre si tienen saldo pendiente
-- ============================================================================

CREATE OR REPLACE FUNCTION activar_modo_pago()
RETURNS TRIGGER AS $$
DECLARE
  mes_a_cobrar date;
  inicio_mes_cobrar date;
  fin_mes_cobrar date;
  mes_cobrar_text text;
  usuarios_horas_count int;
  empresas_horas_count int;
  usuarios_mensualidades_count int;
  empresas_mensualidades_count int;
  usuarios_gastos_count int;
  empresas_gastos_count int;
BEGIN
  -- IMPORTANTE: Los clientes ven las horas/gastos del MES ANTERIOR
  -- Si se inserta un registro del 2 de noviembre, se activan clientes con datos de OCTUBRE
  
  -- Calcular el mes anterior a la fecha del registro
  mes_a_cobrar := (date_trunc('month', NEW.fecha) - interval '1 month')::date;
  inicio_mes_cobrar := mes_a_cobrar;
  fin_mes_cobrar := (date_trunc('month', mes_a_cobrar) + interval '1 month - 1 day')::date;
  mes_cobrar_text := to_char(inicio_mes_cobrar, 'YYYY-MM');
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '🔄 ACTIVANDO modoPago';
  RAISE NOTICE '📅 Fecha del reporte: %', NEW.fecha;
  RAISE NOTICE '💰 Cobrando mes: % (% hasta %)', mes_cobrar_text, inicio_mes_cobrar, fin_mes_cobrar;
  RAISE NOTICE '========================================';
  
  -- PRIMERO: Desactivar modoPago para TODOS
  UPDATE usuarios SET "modoPago" = false WHERE true;
  UPDATE empresas SET "modoPago" = false WHERE true;
  RAISE NOTICE '✅ Desactivado modoPago para todos';
  
  -- USUARIOS CON TRABAJOS POR HORA EN EL MES ANTERIOR
  WITH usuarios_con_horas AS (
    SELECT DISTINCT c.id_cliente
    FROM trabajos_por_hora tph
    INNER JOIN casos c ON tph.caso_asignado = c.id
    WHERE tph.fecha >= inicio_mes_cobrar
      AND tph.fecha <= fin_mes_cobrar
      AND tph.fecha IS NOT NULL
      AND c.id_cliente IS NOT NULL
    UNION
    SELECT DISTINCT tph.id_cliente
    FROM trabajos_por_hora tph
    WHERE tph.fecha >= inicio_mes_cobrar
      AND tph.fecha <= fin_mes_cobrar
      AND tph.fecha IS NOT NULL
      AND tph.id_cliente IS NOT NULL
  )
  UPDATE usuarios 
  SET "modoPago" = true 
  WHERE id IN (SELECT id_cliente FROM usuarios_con_horas);
  
  GET DIAGNOSTICS usuarios_horas_count = ROW_COUNT;
  RAISE NOTICE '📊 Usuarios con horas: %', usuarios_horas_count;
  
  -- USUARIOS CON MENSUALIDADES ACTIVAS
  -- Solo activar si la solicitud existe y tiene saldo pendiente
  WITH usuarios_con_mensualidades AS (
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
  )
  UPDATE usuarios 
  SET "modoPago" = true 
  WHERE id IN (SELECT id_cliente FROM usuarios_con_mensualidades);
  
  GET DIAGNOSTICS usuarios_mensualidades_count = ROW_COUNT;
  RAISE NOTICE '📊 Usuarios con mensualidades: %', usuarios_mensualidades_count;
  
  -- USUARIOS CON GASTOS EN EL MES ANTERIOR
  WITH usuarios_con_gastos AS (
    SELECT DISTINCT g.id_cliente
    FROM gastos g
    WHERE g.fecha >= inicio_mes_cobrar
      AND g.fecha <= fin_mes_cobrar
      AND g.fecha IS NOT NULL
      AND g.id_cliente IS NOT NULL
      AND g.total_cobro IS NOT NULL
      AND g.total_cobro > 0
  )
  UPDATE usuarios 
  SET "modoPago" = true 
  WHERE id IN (SELECT id_cliente FROM usuarios_con_gastos);
  
  GET DIAGNOSTICS usuarios_gastos_count = ROW_COUNT;
  RAISE NOTICE '📊 Usuarios con gastos: %', usuarios_gastos_count;
  
  -- EMPRESAS CON TRABAJOS POR HORA EN EL MES ANTERIOR
  WITH empresas_con_horas AS (
    SELECT DISTINCT c.id_cliente
    FROM casos c
    WHERE EXISTS (
      SELECT 1 
      FROM trabajos_por_hora tph
      WHERE tph.caso_asignado = c.id
        AND tph.fecha >= inicio_mes_cobrar
        AND tph.fecha <= fin_mes_cobrar
        AND tph.fecha IS NOT NULL
    )
    AND c.id_cliente IS NOT NULL
  )
  UPDATE empresas 
  SET "modoPago" = true 
  WHERE id IN (SELECT id_cliente FROM empresas_con_horas);
  
  GET DIAGNOSTICS empresas_horas_count = ROW_COUNT;
  RAISE NOTICE '📊 Empresas con horas: %', empresas_horas_count;
  
  -- EMPRESAS CON MENSUALIDADES ACTIVAS
  WITH empresas_con_mensualidades AS (
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
  )
  UPDATE empresas 
  SET "modoPago" = true 
  WHERE id IN (SELECT id_cliente FROM empresas_con_mensualidades);
  
  GET DIAGNOSTICS empresas_mensualidades_count = ROW_COUNT;
  RAISE NOTICE '📊 Empresas con mensualidades: %', empresas_mensualidades_count;
  
  -- EMPRESAS CON GASTOS EN EL MES ANTERIOR
  WITH empresas_con_gastos AS (
    SELECT DISTINCT g.id_cliente
    FROM gastos g
    WHERE g.fecha >= inicio_mes_cobrar
      AND g.fecha <= fin_mes_cobrar
      AND g.fecha IS NOT NULL
      AND g.id_cliente IS NOT NULL
      AND g.total_cobro IS NOT NULL
      AND g.total_cobro > 0
  )
  UPDATE empresas 
  SET "modoPago" = true 
  WHERE id IN (SELECT id_cliente FROM empresas_con_gastos);
  
  GET DIAGNOSTICS empresas_gastos_count = ROW_COUNT;
  RAISE NOTICE '📊 Empresas con gastos: %', empresas_gastos_count;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Proceso completado';
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE '✅ Función activar_modo_pago actualizada correctamente';
  RAISE NOTICE '📅 Ahora usa NEW.fecha del registro insertado en historial_reportes';
  RAISE NOTICE '💰 Los clientes ven las horas/gastos del MES ANTERIOR a la fecha del reporte';
  RAISE NOTICE '📌 Ejemplo: Registro del 2 nov → activa clientes con datos de octubre';
END $$;
