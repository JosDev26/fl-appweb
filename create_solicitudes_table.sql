-- Crear tabla de solicitudes
CREATE TABLE IF NOT EXISTS solicitudes (
  id text PRIMARY KEY,
  id_cliente text,
  titulo text,
  descripcion text,
  materia text,
  etapa_actual text,
  modalidad_pago text,
  costo_neto numeric(15,2),
  se_cobra_iva boolean DEFAULT false,
  monto_iva numeric(15,2),
  cantidad_cuotas integer,
  monto_por_cuota numeric(15,2),
  total_a_pagar numeric(15,2),
  estado_pago text,
  monto_pagado numeric(15,2) DEFAULT 0,
  saldo_pendiente numeric(15,2),
  expediente text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT fk_cliente FOREIGN KEY (id_cliente) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_solicitudes_id_cliente ON solicitudes(id_cliente);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado_pago ON solicitudes(estado_pago);
CREATE INDEX IF NOT EXISTS idx_solicitudes_etapa_actual ON solicitudes(etapa_actual);
CREATE INDEX IF NOT EXISTS idx_solicitudes_expediente ON solicitudes(expediente);
CREATE INDEX IF NOT EXISTS idx_solicitudes_se_cobra_iva ON solicitudes(se_cobra_iva);
CREATE INDEX IF NOT EXISTS idx_solicitudes_monto_iva ON solicitudes(monto_iva);

-- Comentarios para documentación
COMMENT ON TABLE solicitudes IS 'Tabla de solicitudes sincronizada con Google Sheets';
COMMENT ON COLUMN solicitudes.id IS 'ID de la solicitud desde Google Sheets (ID_Solicitud) - Columna A';
COMMENT ON COLUMN solicitudes.id_cliente IS 'ID del cliente asociado - Columna D';
COMMENT ON COLUMN solicitudes.titulo IS 'Título de la solicitud - Columna F';
COMMENT ON COLUMN solicitudes.descripcion IS 'Descripción detallada de la solicitud - Columna G';
COMMENT ON COLUMN solicitudes.materia IS 'Materia del caso - Columna H';
COMMENT ON COLUMN solicitudes.etapa_actual IS 'Etapa actual del proceso (ej: Preparatoria) - Columna I';
COMMENT ON COLUMN solicitudes.modalidad_pago IS 'Modalidad de pago (ej: Mensualidad) - Columna I';
COMMENT ON COLUMN solicitudes.costo_neto IS 'Costo neto en formato numérico - Columna J';
COMMENT ON COLUMN solicitudes.se_cobra_iva IS 'Indica si se cobra IVA en esta solicitud - Columna K (SeCobra_IVA)';
COMMENT ON COLUMN solicitudes.monto_iva IS 'Monto del IVA a cobrar en formato numérico - Columna L (Monto_IVA)';
COMMENT ON COLUMN solicitudes.cantidad_cuotas IS 'Cantidad de cuotas - Columna M';
COMMENT ON COLUMN solicitudes.monto_por_cuota IS 'Monto por cuota en formato numérico - Columna N';
COMMENT ON COLUMN solicitudes.total_a_pagar IS 'Total a pagar en formato numérico - Columna O';
COMMENT ON COLUMN solicitudes.estado_pago IS 'Estado del pago: En Proceso / Pagado / Otro - Columna P';
COMMENT ON COLUMN solicitudes.monto_pagado IS 'Monto pagado en formato numérico - Columna Q';
COMMENT ON COLUMN solicitudes.saldo_pendiente IS 'Saldo pendiente en formato numérico - Columna R';
COMMENT ON COLUMN solicitudes.expediente IS 'Número de expediente - Columna S';
