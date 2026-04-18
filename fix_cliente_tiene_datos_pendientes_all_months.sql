-- =============================================
-- FIX: cliente_tiene_datos_pendientes — Ventana de 12 meses
-- =============================================
-- PROBLEMA: La función solo verificaba datos pendientes en UN mes (el activo).
--   Cuando un cliente pagaba un mes viejo o el mes actual, el check no encontraba
--   datos en el otro mes y desactivaba modoPago prematuramente.
--   Ejemplo: Cliente tiene Feb+Mar pendientes, paga Feb, check ve que Mar (activo)
--   ya está pagado → desactiva modoPago → cliente no puede pagar Mar.
--
-- FIX: Expandir los checks 1-3 (trabajos, gastos, servicios) para revisar una
--   ventana de 12 meses hacia atrás desde el mes activo, en vez de solo el mes activo.
--   Checks 4-5 (mensualidades, receipts) ya son globales — sin cambio.
--
-- COMPATIBILIDAD: La firma de la función no cambia. Todos los callers existentes
--   (RPC approve_payment_receipt, JS post-check, grupo check) se benefician
--   automáticamente sin modificaciones.
-- =============================================

DROP FUNCTION IF EXISTS cliente_tiene_datos_pendientes(TEXT, TEXT, DATE, DATE);

CREATE OR REPLACE FUNCTION cliente_tiene_datos_pendientes(
  p_client_id    TEXT,
  p_tipo_cliente TEXT,
  p_mes_inicio   DATE DEFAULT NULL,
  p_mes_fin      DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
AS $$
WITH
  rango AS (
    SELECT
      COALESCE(
        p_mes_inicio,
        (date_trunc('month', (SELECT fecha FROM historial_reportes ORDER BY fecha DESC LIMIT 1)) - interval '1 month')::date
      ) AS mes_inicio,
      COALESCE(
        p_mes_fin,
        (date_trunc('month',
          COALESCE(
            p_mes_inicio,
            (date_trunc('month', (SELECT fecha FROM historial_reportes ORDER BY fecha DESC LIMIT 1)) - interval '1 month')::date
          )
        ) + interval '1 month - 1 day')::date
      ) AS mes_fin
  ),
  ventana AS (
    SELECT
      (date_trunc('month', mes_inicio) - interval '11 months')::date AS inicio,
      GREATEST(mes_fin, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date) AS fin
    FROM rango
  ),
  cnt_trabajos AS (
    SELECT COUNT(*) AS n
    FROM trabajos_por_hora tph
    CROSS JOIN ventana
    WHERE tph.fecha >= ventana.inicio
      AND tph.fecha <= ventana.fin
      AND tph.fecha IS NOT NULL
      AND (tph.estado_pago IS NULL OR LOWER(TRIM(tph.estado_pago)) != 'pagado')
      AND (
        tph.caso_asignado IN (SELECT id FROM casos WHERE id_cliente = p_client_id)
        OR (p_tipo_cliente != 'empresa' AND tph.id_cliente = p_client_id)
      )
  ),
  cnt_gastos AS (
    SELECT COUNT(*) AS n
    FROM gastos
    CROSS JOIN ventana
    WHERE id_cliente = p_client_id
      AND fecha >= ventana.inicio
      AND fecha <= ventana.fin
      AND fecha IS NOT NULL
      AND total_cobro IS NOT NULL
      AND total_cobro > 0
      AND (estado_pago IS NULL OR LOWER(TRIM(estado_pago)) != 'pagado')
  ),
  cnt_servicios AS (
    SELECT COUNT(*) AS n
    FROM servicios_profesionales
    CROSS JOIN ventana
    WHERE id_cliente = p_client_id
      AND fecha >= ventana.inicio
      AND fecha <= ventana.fin
      AND fecha IS NOT NULL
      AND (estado_pago IS NULL OR LOWER(TRIM(estado_pago)) NOT IN ('pagado', 'cancelado'))
  ),
  cnt_mensualidades AS (
    SELECT COUNT(*) AS n
    FROM solicitudes
    WHERE id_cliente = p_client_id
      AND LOWER(TRIM(modalidad_pago)) = 'mensualidad'
      AND (estado_pago IS NULL OR LOWER(TRIM(estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado'))
      AND (monto_pagado IS NULL OR total_a_pagar IS NULL OR monto_pagado < total_a_pagar)
  ),
  cnt_receipts AS (
    SELECT COUNT(*) AS n
    FROM payment_receipts
    WHERE user_id = p_client_id
      AND estado = 'pendiente'
  )
SELECT json_build_object(
  'tieneDatos',
    cnt_trabajos.n > 0 OR cnt_gastos.n > 0 OR cnt_servicios.n > 0
    OR cnt_mensualidades.n > 0 OR cnt_receipts.n > 0,
  'trabajosPorHora',        cnt_trabajos.n,
  'gastos',                 cnt_gastos.n,
  'serviciosProfesionales', cnt_servicios.n,
  'mensualidadesActivas',   cnt_mensualidades.n,
  'receiptsPendientes',     cnt_receipts.n,
  'ventanaInicio',          ventana.inicio,
  'ventanaFin',             ventana.fin
)
FROM cnt_trabajos, cnt_gastos, cnt_servicios, cnt_mensualidades, cnt_receipts, ventana
$$;

GRANT EXECUTE ON FUNCTION cliente_tiene_datos_pendientes TO authenticated;
GRANT EXECUTE ON FUNCTION cliente_tiene_datos_pendientes TO service_role;

COMMENT ON FUNCTION cliente_tiene_datos_pendientes IS 
'Verifica si un cliente tiene datos pendientes de cobro en una ventana de 12 meses.
Se usa al aprobar comprobantes para decidir si desactivar modoPago.
FIX: Ahora revisa 12 meses hacia atrás (no solo el mes activo) para evitar
desactivación prematura cuando hay meses pendientes fuera del mes actual.
Revisa: trabajos por hora, gastos, servicios profesionales, mensualidades y receipts pendientes.';
