-- ============================================================================
-- SCRIPT: Crear tabla ingresos para sincronización con Google Sheets
-- ============================================================================
-- PROPÓSITO:
--   Almacenar los registros de ingresos por comprobantes de pago aprobados
--
-- COLUMNAS DE SHEETS (Hoja: Ingresos):
--   A: ID_Ingreso (PK)
--   B: Fecha_Pago (Fecha en que se sube el comprobante)
--   C: Fecha_Aprobacion (Fecha en que se aprueba el comprobante)
--   D: Cliente (FK a usuarios)
--   E: Modalidad_Pago (cobro por hora, mensualidad, etapa finalizada)
--   F: Moneda (colones o dolares)
--   G: Honorarios (Total de cobro sin gastos ni servicios)
--   H: Servicios (Total de servicios)
--   I: Reembolso_Gastos (Total de gastos del comprobante)
--   J: Total_Ingreso (Suma de honorarios + servicios + gastos)
-- ============================================================================

-- 1. Crear la tabla ingresos
CREATE TABLE IF NOT EXISTS public.ingresos (
  id TEXT PRIMARY KEY,                          -- ID_Ingreso (columna A)
  fecha_pago DATE,                              -- Fecha_Pago (columna B)
  fecha_aprobacion DATE,                        -- Fecha_Aprobacion (columna C)
  id_cliente TEXT,                              -- Cliente (columna D) - FK a usuarios
  tipo_cliente TEXT,                            -- 'empresa' o 'cliente'
  modalidad_pago TEXT,                          -- Modalidad_Pago (columna E)
  moneda TEXT,                                  -- Moneda (columna F) - 'colones' o 'dolares'
  honorarios DECIMAL(12, 2) DEFAULT 0,          -- Honorarios (columna G)
  servicios DECIMAL(12, 2) DEFAULT 0,           -- Servicios (columna H)
  reembolso_gastos DECIMAL(12, 2) DEFAULT 0,    -- Reembolso_Gastos (columna I)
  total_ingreso DECIMAL(12, 2) DEFAULT 0,       -- Total_Ingreso (columna J)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_ingresos_fecha_pago ON public.ingresos(fecha_pago DESC);
CREATE INDEX IF NOT EXISTS idx_ingresos_fecha_aprobacion ON public.ingresos(fecha_aprobacion DESC);
CREATE INDEX IF NOT EXISTS idx_ingresos_id_cliente ON public.ingresos(id_cliente);
CREATE INDEX IF NOT EXISTS idx_ingresos_modalidad ON public.ingresos(modalidad_pago);
CREATE INDEX IF NOT EXISTS idx_ingresos_moneda ON public.ingresos(moneda);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.ingresos ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS permisivas (la seguridad se maneja en el backend)
CREATE POLICY "Allow all operations on ingresos"
ON public.ingresos
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 5. Comentarios explicativos
COMMENT ON TABLE public.ingresos IS 'Tabla de ingresos por comprobantes de pago aprobados';
COMMENT ON COLUMN public.ingresos.id IS 'ID único del ingreso (ID_Ingreso de Sheets)';
COMMENT ON COLUMN public.ingresos.fecha_pago IS 'Fecha en que se subió el comprobante';
COMMENT ON COLUMN public.ingresos.fecha_aprobacion IS 'Fecha en que se aprobó el comprobante';
COMMENT ON COLUMN public.ingresos.id_cliente IS 'ID del cliente o empresa';
COMMENT ON COLUMN public.ingresos.tipo_cliente IS 'Indica si es empresa o cliente';
COMMENT ON COLUMN public.ingresos.modalidad_pago IS 'Tipo: cobro por hora, mensualidad, etapa finalizada';
COMMENT ON COLUMN public.ingresos.moneda IS 'Moneda del pago: colones o dolares';
COMMENT ON COLUMN public.ingresos.honorarios IS 'Total de honorarios sin gastos ni servicios';
COMMENT ON COLUMN public.ingresos.servicios IS 'Total de servicios adicionales';
COMMENT ON COLUMN public.ingresos.reembolso_gastos IS 'Total de gastos reembolsados';
COMMENT ON COLUMN public.ingresos.total_ingreso IS 'Suma total: honorarios + servicios + gastos';

-- 6. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_ingresos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ingresos_updated_at ON public.ingresos;
CREATE TRIGGER trigger_ingresos_updated_at
  BEFORE UPDATE ON public.ingresos
  FOR EACH ROW
  EXECUTE FUNCTION update_ingresos_updated_at();

-- 7. Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Tabla ingresos creada correctamente';
  RAISE NOTICE '📋 Columnas: id, fecha_pago, fecha_aprobacion, id_cliente, tipo_cliente,';
  RAISE NOTICE '   modalidad_pago, moneda, honorarios, servicios, reembolso_gastos, total_ingreso';
  RAISE NOTICE '========================================';
END $$;
