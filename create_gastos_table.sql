-- Crear tabla gastos para sincronización con Google Sheets
-- Esta tabla almacena los gastos asociados a casos/solicitudes
-- IMPORTANTE: Asegúrate de que la tabla 'funcionarios' exista antes de ejecutar este script

-- 1. Eliminar la tabla si existe (opcional, comentado por seguridad)
-- DROP TABLE IF EXISTS gastos CASCADE;

-- 2. Crear la tabla gastos
CREATE TABLE gastos (
  id text PRIMARY KEY,                    -- ID_Gasto (columna A)
  id_asociacion text,                     -- ID_Asociacion (columna B)
  id_caso text,                           -- ID_Caso (columna C o D, la que tenga dato)
  id_responsable text,                    -- ID_Responsable (columna G): foreign key a funcionarios.id
  fecha date,                             -- Fecha (columna I)
  producto text,                          -- Producto (columna K)
  total_cobro numeric(15,2),              -- Total_Cobro (columna P)
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fk_responsable FOREIGN KEY (id_responsable) REFERENCES funcionarios(id) ON DELETE SET NULL
);

-- 3. Crear índices para mejorar el rendimiento
CREATE INDEX idx_gastos_id_asociacion ON gastos(id_asociacion);
CREATE INDEX idx_gastos_id_caso ON gastos(id_caso);
CREATE INDEX idx_gastos_id_responsable ON gastos(id_responsable);
CREATE INDEX idx_gastos_fecha ON gastos(fecha DESC);
CREATE INDEX idx_gastos_total_cobro ON gastos(total_cobro);

-- 4. Comentarios explicativos
COMMENT ON TABLE gastos IS 'Tabla de gastos sincronizada con Google Sheets';
COMMENT ON COLUMN gastos.id IS 'ID único del gasto (ID_Gasto de Sheets, columna A)';
COMMENT ON COLUMN gastos.id_asociacion IS 'ID de asociación (columna B)';
COMMENT ON COLUMN gastos.id_caso IS 'ID del caso o solicitud asociada (columna C o D, la que tenga dato)';
COMMENT ON COLUMN gastos.id_responsable IS 'ID del funcionario responsable (foreign key a funcionarios.id, columna G)';
COMMENT ON COLUMN gastos.fecha IS 'Fecha del gasto (columna I)';
COMMENT ON COLUMN gastos.producto IS 'Descripción del producto/servicio (columna K)';
COMMENT ON COLUMN gastos.total_cobro IS 'Total a cobrar por el gasto (columna P)';
