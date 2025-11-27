-- Modificar función para usar CURRENT_DATE (fecha del servidor)
CREATE OR REPLACE FUNCTION activar_modo_pago()
RETURNS TRIGGER AS $$
DECLARE
  inicio_mes date;
  inicio_mes_text text;
BEGIN
  -- Calcular el primer día del mes actual del servidor
  inicio_mes := date_trunc('month', CURRENT_DATE)::date;
  inicio_mes_text := to_char(inicio_mes, 'YYYY-MM-DD');
  
  -- PRIMERO: Desactivar modoPago para TODOS
  UPDATE usuarios SET "modoPago" = false WHERE true;
  UPDATE empresas SET "modoPago" = false WHERE true;
  
  -- LUEGO: Activar SOLO para usuarios con trabajos por hora desde inicio del mes
  -- Usando JOIN con casos para obtener el id_cliente
  UPDATE usuarios 
  SET "modoPago" = true 
  WHERE id IN (
    SELECT DISTINCT c.id_cliente
    FROM trabajos_por_hora tph
    INNER JOIN casos c ON tph.caso_asignado = c.id
    WHERE tph.fecha >= inicio_mes
      AND tph.fecha IS NOT NULL
      AND c.id_cliente IS NOT NULL
  );
  
  -- También activar para usuarios que tienen trabajos directos (si tienen id_cliente)
  UPDATE usuarios 
  SET "modoPago" = true 
  WHERE id IN (
    SELECT DISTINCT tph.id_cliente
    FROM trabajos_por_hora tph
    WHERE tph.fecha >= inicio_mes
      AND tph.fecha IS NOT NULL
      AND tph.id_cliente IS NOT NULL
  );
  
  -- Activar SOLO para usuarios con solicitudes mensuales activas
  UPDATE usuarios 
  SET "modoPago" = true 
  WHERE id IN (
    SELECT DISTINCT s.id_cliente
    FROM solicitudes s
    WHERE LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
      AND s.id_cliente IS NOT NULL
      AND (
        s.estado_pago IS NULL 
        OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado')
      )
  );
  
  -- Activar SOLO para empresas con casos que tienen trabajos por hora desde inicio del mes
  UPDATE empresas 
  SET "modoPago" = true 
  WHERE id IN (
    SELECT DISTINCT c.id_cliente
    FROM casos c
    WHERE EXISTS (
      SELECT 1 
      FROM trabajos_por_hora tph
      WHERE tph.caso_asignado = c.id
        AND tph.fecha >= inicio_mes
        AND tph.fecha IS NOT NULL
    )
    AND c.id_cliente IS NOT NULL
  );
  
  -- Activar SOLO para empresas con solicitudes mensuales activas
  UPDATE empresas 
  SET "modoPago" = true 
  WHERE id IN (
    SELECT DISTINCT s.id_cliente
    FROM solicitudes s
    WHERE LOWER(TRIM(s.modalidad_pago)) = 'mensualidad'
      AND s.id_cliente IS NOT NULL
      AND (
        s.estado_pago IS NULL 
        OR LOWER(TRIM(s.estado_pago)) NOT IN ('finalizado', 'pagado', 'cancelado')
      )
  );
  
  -- Activar para usuarios con gastos del mes actual (via id_cliente)
  UPDATE usuarios 
  SET "modoPago" = true 
  WHERE id IN (
    SELECT DISTINCT g.id_cliente
    FROM gastos g
    WHERE g.fecha >= inicio_mes
      AND g.fecha IS NOT NULL
      AND g.id_cliente IS NOT NULL
  );
  
  -- Activar para empresas con gastos del mes actual (via id_cliente)
  UPDATE empresas 
  SET "modoPago" = true 
  WHERE id IN (
    SELECT DISTINCT g.id_cliente
    FROM gastos g
    WHERE g.fecha >= inicio_mes
      AND g.fecha IS NOT NULL
      AND g.id_cliente IS NOT NULL
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- El trigger ya existe, solo actualizamos la función
COMMENT ON FUNCTION activar_modo_pago() IS 'Revertido: Usa CURRENT_DATE (fecha del servidor) para activar modoPago';
