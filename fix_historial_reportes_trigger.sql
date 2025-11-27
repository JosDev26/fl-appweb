-- Arreglar el trigger de activar_modo_pago para incluir WHERE clause
-- Este script corrige el error "UPDATE requires a WHERE clause"

CREATE OR REPLACE FUNCTION activar_modo_pago()
RETURNS TRIGGER AS $$
DECLARE
  inicio_mes date;
  inicio_mes_text text;
BEGIN
  -- Calcular el primer día del mes basado en la fecha del registro insertado
  -- Esto permite sincronizar con la fecha del reporte, no la fecha actual del servidor
  inicio_mes := date_trunc('month', NEW.fecha)::date;
  inicio_mes_text := to_char(inicio_mes, 'YYYY-MM-DD');
  
  -- PRIMERO: Desactivar modoPago para TODOS (con WHERE true para cumplir con restricción)
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

-- Comentario de actualización
COMMENT ON FUNCTION activar_modo_pago() IS 'Función corregida: Actualiza modoPago basado en actividad del mes actual. Versión con WHERE clause obligatorio.';
