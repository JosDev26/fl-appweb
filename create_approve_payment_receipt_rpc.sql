-- =============================================
-- RPC: approve_payment_receipt
-- Descripción: Aprueba un comprobante de pago y desactiva modoPago 
--              de forma condicional y atómica.
--
-- FIX: Ya no desactiva modoPago incondicionalmente.
--      Antes de desactivar, verifica si el cliente tiene datos 
--      pendientes en el mes actualmente cobrado.
--      Esto evita que aprobar un pago de un mes anterior (ej: diciembre)
--      desactive modoPago cuando hay un mes nuevo pendiente (ej: enero).
--
-- REQUIERE: función cliente_tiene_datos_pendientes() 
--           (ver create_cliente_tiene_datos_pendientes.sql)
-- =============================================

-- Primero eliminar la versión anterior (tiene firma diferente)
DROP FUNCTION IF EXISTS approve_payment_receipt(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION approve_payment_receipt(
  p_receipt_id UUID,
  p_user_id TEXT,
  p_tipo_cliente TEXT,
  p_mes_pago TEXT DEFAULT NULL,
  p_nota TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSON;
  v_fecha_aprobacion TIMESTAMPTZ := NOW();
  v_tabla TEXT;
  v_receipt_exists BOOLEAN;
  v_ultima_fecha_reporte DATE;
  v_mes_activo_inicio DATE;
  v_mes_activo_fin DATE;
  v_datos_pendientes JSON;
  v_tiene_datos BOOLEAN := false;
  v_modo_pago_desactivado BOOLEAN := false;
BEGIN
  -- Verificar que el comprobante existe
  SELECT EXISTS(
    SELECT 1 FROM payment_receipts WHERE id = p_receipt_id
  ) INTO v_receipt_exists;
  
  IF NOT v_receipt_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'receipt_not_found',
      'message', 'Comprobante no encontrado'
    );
  END IF;

  -- Determinar tabla según tipo de cliente
  IF p_tipo_cliente = 'empresa' THEN
    v_tabla := 'empresas';
  ELSE
    v_tabla := 'usuarios';
  END IF;

  -- Iniciar transacción implícita (plpgsql ya está en una transacción)
  
  -- 1. Actualizar el comprobante
  UPDATE payment_receipts
  SET 
    estado = 'aprobado',
    reviewed_at = v_fecha_aprobacion,
    nota_revision = p_nota
  WHERE id = p_receipt_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'receipt_update_failed',
      'message', 'Error al actualizar comprobante'
    );
  END IF;

  -- 2. Verificar si se debe desactivar modoPago (FIX: verificación condicional)
  -- Obtener la fecha del último historial_reportes para calcular el mes activo
  SELECT fecha INTO v_ultima_fecha_reporte
  FROM historial_reportes
  ORDER BY fecha DESC
  LIMIT 1;

  IF v_ultima_fecha_reporte IS NOT NULL THEN
    -- Calcular el mes activo (mes anterior a la fecha del reporte)
    -- Misma lógica que el trigger activar_modo_pago()
    v_mes_activo_inicio := (date_trunc('month', v_ultima_fecha_reporte) - interval '1 month')::date;
    v_mes_activo_fin := (date_trunc('month', v_mes_activo_inicio) + interval '1 month - 1 day')::date;
    
    RAISE NOTICE '📋 Aprobando comprobante: mes_pago=%, mes_activo=% a %', 
      p_mes_pago, v_mes_activo_inicio, v_mes_activo_fin;

    -- Verificar si el cliente tiene datos pendientes en el mes activo
    v_datos_pendientes := cliente_tiene_datos_pendientes(
      p_user_id, p_tipo_cliente, v_mes_activo_inicio, v_mes_activo_fin
    );
    
    v_tiene_datos := (v_datos_pendientes->>'tieneDatos')::boolean;
    
    RAISE NOTICE '📊 Datos pendientes: %', v_datos_pendientes;

    IF v_tiene_datos THEN
      -- El cliente tiene datos pendientes → NO desactivar modoPago
      RAISE NOTICE '⚠️ Cliente % tiene datos pendientes, modoPago permanece activo', p_user_id;
      v_modo_pago_desactivado := false;
    ELSE
      -- No tiene datos pendientes → desactivar modoPago
      IF v_tabla = 'empresas' THEN
        UPDATE empresas
        SET "modoPago" = false
        WHERE id = p_user_id;
      ELSE
        UPDATE usuarios
        SET "modoPago" = false
        WHERE id = p_user_id;
      END IF;
      
      IF NOT FOUND THEN
        RAISE EXCEPTION 'client_not_found: Cliente no encontrado';
      END IF;
      
      RAISE NOTICE '✅ modoPago desactivado para cliente %', p_user_id;
      v_modo_pago_desactivado := true;
    END IF;
  ELSE
    -- No hay historial_reportes → conservar modoPago actual (no desactivar)
    RAISE NOTICE '⚠️ No hay historial_reportes, modoPago permanece sin cambios';
    v_modo_pago_desactivado := false;
  END IF;

  -- Retornar éxito con detalles
  RETURN json_build_object(
    'success', true,
    'fecha_aprobacion', v_fecha_aprobacion,
    'message', 'Comprobante aprobado exitosamente',
    'modo_pago_desactivado', v_modo_pago_desactivado,
    'datos_pendientes', v_datos_pendientes
  );

EXCEPTION
  WHEN OTHERS THEN
    -- En caso de cualquier error, la transacción se revierte automáticamente
    RETURN json_build_object(
      'success', false,
      'error', SQLSTATE,
      'message', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION approve_payment_receipt TO authenticated;
GRANT EXECUTE ON FUNCTION approve_payment_receipt TO service_role;

-- Comment
COMMENT ON FUNCTION approve_payment_receipt IS 
'Atomic function to approve a payment receipt. Conditionally deactivates modoPago 
only if the client has no pending data in the currently active billing month.
This prevents the bug where approving an older month payment would deactivate 
modoPago for the current month. Requires cliente_tiene_datos_pendientes() function.';
