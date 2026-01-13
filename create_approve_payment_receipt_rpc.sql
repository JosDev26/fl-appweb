-- =============================================
-- RPC: approve_payment_receipt
-- Descripción: Aprueba un comprobante de pago y desactiva modoPago de forma atómica
-- =============================================

CREATE OR REPLACE FUNCTION approve_payment_receipt(
  p_receipt_id UUID,
  p_user_id TEXT,
  p_tipo_cliente TEXT,
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

  -- 2. Desactivar modoPago del cliente
  IF v_tabla = 'empresas' THEN
    UPDATE empresas
    SET "modoPago" = false
    WHERE id = p_user_id;
  ELSE
    UPDATE usuarios
    SET "modoPago" = false
    WHERE id = p_user_id;
  END IF;
  
  -- Si no se encontró el cliente, revertir (error)
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client_not_found: Cliente no encontrado';
  END IF;

  -- Retornar éxito con fecha de aprobación
  RETURN json_build_object(
    'success', true,
    'fecha_aprobacion', v_fecha_aprobacion,
    'message', 'Comprobante aprobado exitosamente'
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
'Atomic function to approve a payment receipt and deactivate modoPago for the client. 
Both operations happen in a single transaction - if either fails, both are rolled back.';
