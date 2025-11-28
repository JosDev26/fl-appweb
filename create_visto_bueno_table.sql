-- ============================================================================
-- SCRIPT: Crear tabla visto_bueno_mensual
-- ============================================================================
-- PROPÓSITO:
--   Registrar cuando un cliente/empresa da su visto bueno a las horas 
--   trabajadas del mes antes de pagar.
-- ============================================================================

-- 1. Crear la tabla
CREATE TABLE IF NOT EXISTS public.visto_bueno_mensual (
  id SERIAL PRIMARY KEY,
  client_id TEXT NOT NULL,                     -- ID del cliente o empresa
  client_type TEXT NOT NULL,                   -- 'usuario' o 'empresa'
  mes TEXT NOT NULL,                           -- Formato 'YYYY-MM' (ej: '2025-11')
  dado BOOLEAN DEFAULT false,                  -- Si dio el visto bueno
  fecha_visto_bueno TIMESTAMPTZ,               -- Cuándo lo dio
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Restricción única: un cliente solo puede dar un visto bueno por mes
  CONSTRAINT unique_visto_bueno UNIQUE (client_id, client_type, mes)
);

-- 2. Habilitar RLS
ALTER TABLE public.visto_bueno_mensual ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS - Permitir acceso público (controlado por backend)
CREATE POLICY "Allow all on visto_bueno_mensual"
ON public.visto_bueno_mensual FOR ALL TO public
USING (true) WITH CHECK (true);

-- 4. Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_visto_bueno_client 
ON public.visto_bueno_mensual(client_id, client_type);

CREATE INDEX IF NOT EXISTS idx_visto_bueno_mes 
ON public.visto_bueno_mensual(mes);

-- 5. Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_visto_bueno_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_visto_bueno_updated_at ON public.visto_bueno_mensual;
CREATE TRIGGER trigger_visto_bueno_updated_at
  BEFORE UPDATE ON public.visto_bueno_mensual
  FOR EACH ROW
  EXECUTE FUNCTION update_visto_bueno_updated_at();

-- 6. Comentarios
COMMENT ON TABLE public.visto_bueno_mensual IS 'Registro de visto bueno mensual de clientes/empresas';
COMMENT ON COLUMN public.visto_bueno_mensual.client_id IS 'ID del usuario o empresa';
COMMENT ON COLUMN public.visto_bueno_mensual.client_type IS 'Tipo: usuario o empresa';
COMMENT ON COLUMN public.visto_bueno_mensual.mes IS 'Mes del visto bueno en formato YYYY-MM';
COMMENT ON COLUMN public.visto_bueno_mensual.dado IS 'Si el visto bueno fue dado';
COMMENT ON COLUMN public.visto_bueno_mensual.fecha_visto_bueno IS 'Fecha/hora cuando se dio el visto bueno';

-- 7. Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE '✅ Tabla visto_bueno_mensual creada correctamente';
END $$;
