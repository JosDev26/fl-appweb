-- Actualizar tabla trabajos_por_hora para sincronización con Google Sheets "Control_Horas"
DROP TABLE IF EXISTS trabajos_por_hora CASCADE;

CREATE TABLE trabajos_por_hora (
  id text PRIMARY KEY,
  caso_asignado text,
  responsable text,
  solicitante text,
  id_cliente text,
  titulo text,
  descripcion text,
  fecha date,
  duracion interval,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  -- Foreign keys
  CONSTRAINT fk_caso FOREIGN KEY (caso_asignado) REFERENCES casos(id) ON DELETE SET NULL,
  CONSTRAINT fk_responsable FOREIGN KEY (responsable) REFERENCES funcionarios(id) ON DELETE SET NULL,
  CONSTRAINT fk_solicitante FOREIGN KEY (solicitante) REFERENCES contactos(id) ON DELETE SET NULL
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX idx_trabajos_caso ON trabajos_por_hora(caso_asignado);
CREATE INDEX idx_trabajos_responsable ON trabajos_por_hora(responsable);
CREATE INDEX idx_trabajos_solicitante ON trabajos_por_hora(solicitante);
CREATE INDEX idx_trabajos_cliente ON trabajos_por_hora(id_cliente);
CREATE INDEX idx_trabajos_fecha ON trabajos_por_hora(fecha);

-- Comentarios para documentación
COMMENT ON TABLE trabajos_por_hora IS 'Tabla de control de horas sincronizada con Google Sheets "Control_Horas"';
COMMENT ON COLUMN trabajos_por_hora.id IS 'ID de la tarea desde Google Sheets (ID_Tarea)';
COMMENT ON COLUMN trabajos_por_hora.caso_asignado IS 'ID del caso asociado (referencia a tabla casos)';
COMMENT ON COLUMN trabajos_por_hora.responsable IS 'ID del funcionario responsable (referencia a tabla funcionarios)';
COMMENT ON COLUMN trabajos_por_hora.solicitante IS 'ID del contacto solicitante (referencia a tabla contactos)';
COMMENT ON COLUMN trabajos_por_hora.id_cliente IS 'ID del cliente (puede ser de usuarios.id_sheets o empresas.id, sin FK)';
COMMENT ON COLUMN trabajos_por_hora.titulo IS 'Título de la tarea';
COMMENT ON COLUMN trabajos_por_hora.descripcion IS 'Descripción detallada de la tarea';
COMMENT ON COLUMN trabajos_por_hora.fecha IS 'Fecha de la tarea';
COMMENT ON COLUMN trabajos_por_hora.duracion IS 'Duración en formato interval (horas:minutos:segundos)';
