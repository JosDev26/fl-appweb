-- =============================================
-- FUNCIÓN: cliente_tiene_datos_pendientes
-- =============================================
-- Verifica si un cliente (usuario o empresa) tiene datos pendientes
-- de cobro en un rango de fechas específico.
--
-- Se usa al aprobar un comprobante de pago para decidir si se debe
-- desactivar modoPago. Si el cliente tiene datos pendientes en el
-- mes actualmente cobrado, modoPago debe permanecer activo.
--
-- PARÁMETROS:
--   p_client_id: ID del cliente (usuario o empresa)
--   p_tipo_cliente: 'empresa' o 'cliente'/'usuario'
--   p_mes_inicio: Primer día del mes a verificar (ej: '2026-01-01')
--                 Si NULL, se calcula automáticamente desde historial_reportes
--   p_mes_fin: Último día del mes a verificar (ej: '2026-01-31')
--              Si NULL, se calcula automáticamente desde historial_reportes
--
-- RETORNA: JSON con detalle de datos pendientes
-- =============================================

CREATE OR REPLACE FUNCTION cliente_tiene_datos_pendientes(
  p_client_id TEXT,
  p_tipo_cliente TEXT,
  p_mes_inicio DATE DEFAULT NULL,
  p_mes_fin DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trabajos_count INT := 0;
  v_gastos_count INT := 0;
  v_servicios_count INT := 0;
  v_mensualidades_count INT := 0;
  v_receipts_count INT := 0;
  v_tiene_datos BOOLEAN := false;
  v_ultima_fecha_reporte DATE;
  v_mes_inicio DATE := p_mes_inicio;
  v_mes_fin DATE := p_mes_fin;
BEGIN
  -- Si no se proporcionan fechas, calcular desde historial_reportes
  IF v_mes_inicio IS NULL OR v_mes_fin IS NULL THEN
    SELECT fecha INTO v_ultima_fecha_reporte
    FROM historial_reportes
    ORDER BY fecha DESC
    LIMIT 1;
    
    IF v_ultima_fecha_reporte IS NULL THEN
      -- No hay historial_reportes, retornar sin datos
      RETURN json_build_object(
        'tieneDatos', false,
        'trabajosPorHora', 0,
        'gastos', 0,
        'serviciosProfesionales', 0,
        'mensualidadesActivas', 0,
        'receiptsPendientes', 0,
        'nota', 'No hay historial_reportes para calcular fechas'
      );
    END IF;
    
    -- Misma lógica que el trigger activar_modo_pago(): mes anterior al reporte
    v_mes_inicio := (date_trunc('month', v_ultima_fecha_reporte) - interval '1 month')::date;
    v_mes_fin := (date_trunc('month', v_mes_inicio) + interval '1 month - 1 day')::date;
  END IF;
  -- 1. Trabajos por hora en el rango
  IF p_tipo_cliente = 'empresa' THEN
    -- Para empresas: buscar via casos.id_cliente
    SELECT COUNT(*) INTO v_trabajos_count
    FROM casos c
    WHERE c.id_cliente = p_client_id
      AND EXISTS (
        SELECT 1 FROM trabajos_por_hora tph
        WHERE tph.caso_asignado = c.id
          AND tph.fecha >= v_mes_inicio
          AND tph.fecha <= v_mes_fin
          AND tph.fecha IS NOT NULL
      );
  ELSE
    -- Para usuarios: buscar via casos.id_cliente Y tph.id_cliente directo
    SELECT COUNT(*) INTO v_trabajos_count
    FROM (
      SELECT DISTINCT c.id_cliente
      FROM trabajos_por_hora tph
      INNER JOIN casos c ON tph.caso_asignado = c.id
      WHERE c.id_cliente = p_client_id
        AND tph.fecha >= v_mes_inicio
        AND tph.fecha <= v_mes_fin
        AND tph.fecha IS NOT NULL
      UNION
      SELECT DISTINCT tph.id_cliente
      FROM trabajos_por_hora tph
      WHERE tph.id_cliente = p_client_id
        AND tph.fecha >= v_mes_inicio
        AND tph.fecha <= v_mes_fin
        AND tph.fecha IS NOT NULL
    ) sub;
  END IF;

  -- 2. Gastos pendientes (no pagados) en el rango
  SELECT COUNT(*) INTO v_gastos_count
  FROM gastos g
  WHERE g.id_cliente = p_client_id
    AND g.fecha >= v_mes_inicio
    AND g.fecha <= v_mes_fin
    AND g.fecha IS NOT NULL
    AND g.total_cobro IS NOT NULL
    AND g.total_cobro > 0
    AND (g.estado_pago IS NULL OR LOWER(TRIM(g.estado_pago)) != 'pagado');

  -- 3. Servicios profesionales pendientes (no pagados) en el rango
  SELECT COUNT(*) INTO v_servicios_count
  FROM servicios_profesionales sp
  WHERE sp.id_cliente = p_client_id
    AND sp.fecha >= v_mes_inicio
    AND sp.fecha <= v_mes_fin
    AND sp.fecha IS NOT NULL
    AND (sp.estado_pago IS NULL OR LOWER(TRIM(sp.estado_pago)) NOT IN ('pagado', 'cancelado'));

  -- 4. Mensualidades activas (solicitudes con saldo pendiente)
  SELECT COUNT(*) INTO v_mensualidades_count
  FROM solicitudes s
  WHERE s.id_cliente = p_client_id
    AND LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
    AND s.id_cliente IS NOT NULL
    AND (
      s.estado_pago IS NULL
      OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado')
    )
    AND (
      s.monto_pagado IS NULL
      OR s.total_a_pagar IS NULL
      OR s.monto_pagado < s.total_a_pagar
    );

  -- 5. Otros comprobantes pendientes del mismo cliente
  SELECT COUNT(*) INTO v_receipts_count
  FROM payment_receipts pr
  WHERE pr.user_id = p_client_id
    AND pr.estado = 'pendiente';

  -- Determinar si tiene datos pendientes
  v_tiene_datos := (v_trabajos_count > 0 OR v_gastos_count > 0 OR v_servicios_count > 0 
                    OR v_mensualidades_count > 0 OR v_receipts_count > 0);

  RETURN json_build_object(
    'tieneDatos', v_tiene_datos,
    'trabajosPorHora', v_trabajos_count,
    'gastos', v_gastos_count,
    'serviciosProfesionales', v_servicios_count,
    'mensualidadesActivas', v_mensualidades_count,
    'receiptsPendientes', v_receipts_count
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION cliente_tiene_datos_pendientes TO authenticated;
GRANT EXECUTE ON FUNCTION cliente_tiene_datos_pendientes TO service_role;

-- Comment
COMMENT ON FUNCTION cliente_tiene_datos_pendientes IS 
'Verifica si un cliente tiene datos pendientes de cobro en un rango de fechas.
Se usa al aprobar comprobantes para decidir si desactivar modoPago.
Revisa: trabajos por hora, gastos, servicios profesionales, mensualidades y receipts pendientes.';
