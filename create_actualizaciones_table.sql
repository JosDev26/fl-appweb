-- Crear tabla actualizaciones para sincronización con Google Sheets
-- Esta tabla almacena las actualizaciones de solicitudes
-- IMPORTANTE: Asegúrate de que la tabla 'solicitudes' exista antes de ejecutar este script

-- 1. Eliminar la tabla si existe (opcional, comentado por seguridad)
DROP TABLE IF EXISTS actualizaciones CASCADE;

-- 2. Crear la tabla actualizaciones
CREATE TABLE actualizaciones (
  id text PRIMARY KEY,                    -- ID_Actualizacion (columna A)
  tipo_cliente text,                      -- Tipo_Cliente (columna B): Físico o Jurídico
  id_cliente text,                        -- ID_Cliente (columna C): referencia a usuarios.id o empresas.id
  id_solicitud text,                      -- ID_Solicitud (columna E): foreign key a solicitudes.id
  comentario text,                        -- Comentario (columna F)
  tiempo timestamp with time zone,        -- Tiempo (columna G)
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fk_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes(id) ON DELETE CASCADE
);

-- 3. Crear índices para mejorar el rendimiento
CREATE INDEX idx_actualizaciones_id_solicitud ON actualizaciones(id_solicitud);
CREATE INDEX idx_actualizaciones_id_cliente ON actualizaciones(id_cliente);
CREATE INDEX idx_actualizaciones_tipo_cliente ON actualizaciones(tipo_cliente);
CREATE INDEX idx_actualizaciones_tiempo ON actualizaciones(tiempo DESC);

-- 4. Comentarios explicativos
COMMENT ON TABLE actualizaciones IS 'Tabla de actualizaciones de solicitudes sincronizada con Google Sheets';
COMMENT ON COLUMN actualizaciones.id IS 'ID único de la actualización (ID_Actualizacion de Sheets, columna A)';
COMMENT ON COLUMN actualizaciones.tipo_cliente IS 'Tipo de cliente: Físico o Jurídico (columna B)';
COMMENT ON COLUMN actualizaciones.id_cliente IS 'ID del cliente de usuarios.id o empresas.id (columna C)';
COMMENT ON COLUMN actualizaciones.id_solicitud IS 'ID de la solicitud asociada (foreign key a solicitudes.id, columna E)';
COMMENT ON COLUMN actualizaciones.comentario IS 'Comentario de la actualización (columna F)';
COMMENT ON COLUMN actualizaciones.tiempo IS 'Fecha y hora de la actualización (columna G)';
