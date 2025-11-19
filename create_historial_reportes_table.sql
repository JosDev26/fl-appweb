-- Crear tabla de historial de reportes
CREATE TABLE IF NOT EXISTS historial_reportes (
  id text PRIMARY KEY,
  fecha date,
  hora time,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_historial_reportes_fecha ON historial_reportes(fecha);

-- Crear función para activar modoPago cuando se inserta un registro
CREATE OR REPLACE FUNCTION activar_modo_pago()
RETURNS TRIGGER AS $$
DECLARE
  inicio_mes date;
  inicio_mes_text text;
BEGIN
  -- Calcular el primer día del mes actual
  inicio_mes := date_trunc('month', CURRENT_DATE)::date;
  inicio_mes_text := to_char(inicio_mes, 'YYYY-MM-DD');
  
  -- PRIMERO: Desactivar modoPago para TODOS
  UPDATE usuarios SET "modoPago" = false;
  UPDATE empresas SET "modoPago" = false;
  
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

-- Crear trigger que ejecuta la función después de cada INSERT
DROP TRIGGER IF EXISTS trigger_activar_modo_pago ON historial_reportes;
CREATE TRIGGER trigger_activar_modo_pago
  AFTER INSERT ON historial_reportes
  FOR EACH ROW
  EXECUTE FUNCTION activar_modo_pago();

-- Comentarios para documentación
COMMENT ON TABLE historial_reportes IS 'Tabla de historial de reportes sincronizada con Google Sheets';
COMMENT ON COLUMN historial_reportes.id IS 'ID del click desde Google Sheets (ID_Click) - Columna A';
COMMENT ON COLUMN historial_reportes.fecha IS 'Fecha del reporte - Columna B';
COMMENT ON COLUMN historial_reportes.hora IS 'Hora del reporte - Columna C';
