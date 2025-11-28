-- ============================================================================
-- SCRIPT: Crear tabla clicks_etapa para sincronización con Google Sheets
-- ============================================================================
-- PROPÓSITO:
--   Almacenar los cambios de etapa de solicitudes registrados desde AppSheet
--
-- COLUMNAS DE SHEETS:
--   A: ID_Click (PK)
--   B: Fecha
--   C: Hora
--   E: ID_Empresa (puede ser NULL)
--   F: ID_Cliente (puede ser NULL)
--   G: ID_Solicitud (FK a solicitudes)
--   H: Etapa_Nueva
--
-- LÓGICA: Solo E o F tienen valor, nunca ambos. Se unifica en id_cliente
-- ============================================================================

-- 1. Crear la tabla clicks_etapa
CREATE TABLE IF NOT EXISTS public.clicks_etapa (
  id TEXT PRIMARY KEY,                          -- ID_Click (columna A)
  fecha DATE,                                   -- Fecha (columna B)
  hora TIME,                                    -- Hora (columna C)
  id_cliente TEXT,                              -- Unificado de ID_Empresa (E) o ID_Cliente (F)
  tipo_cliente TEXT,                            -- 'empresa' o 'cliente' según de dónde vino
  id_solicitud TEXT,                            -- ID_Solicitud (columna G)
  etapa_nueva TEXT,                             -- Etapa_Nueva (columna H)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Foreign key a solicitudes
  CONSTRAINT fk_solicitud FOREIGN KEY (id_solicitud) 
    REFERENCES solicitudes(id) ON DELETE SET NULL
);

-- 2. Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_clicks_etapa_fecha ON public.clicks_etapa(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_clicks_etapa_id_cliente ON public.clicks_etapa(id_cliente);
CREATE INDEX IF NOT EXISTS idx_clicks_etapa_id_solicitud ON public.clicks_etapa(id_solicitud);
CREATE INDEX IF NOT EXISTS idx_clicks_etapa_tipo_cliente ON public.clicks_etapa(tipo_cliente);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.clicks_etapa ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS permisivas (la seguridad se maneja en el backend)
CREATE POLICY "Allow all operations on clicks_etapa"
ON public.clicks_etapa
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 5. Comentarios explicativos
COMMENT ON TABLE public.clicks_etapa IS 'Tabla de cambios de etapa sincronizada con Google Sheets';
COMMENT ON COLUMN public.clicks_etapa.id IS 'ID único del click (ID_Click de Sheets, columna A)';
COMMENT ON COLUMN public.clicks_etapa.fecha IS 'Fecha del cambio (columna B)';
COMMENT ON COLUMN public.clicks_etapa.hora IS 'Hora del cambio (columna C)';
COMMENT ON COLUMN public.clicks_etapa.id_cliente IS 'ID del cliente o empresa (unificado de columnas E y F)';
COMMENT ON COLUMN public.clicks_etapa.tipo_cliente IS 'Indica si es empresa o cliente';
COMMENT ON COLUMN public.clicks_etapa.id_solicitud IS 'ID de la solicitud asociada (columna G)';
COMMENT ON COLUMN public.clicks_etapa.etapa_nueva IS 'Nueva etapa de la solicitud (columna H)';

-- 6. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_clicks_etapa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clicks_etapa_updated_at ON public.clicks_etapa;
CREATE TRIGGER trigger_clicks_etapa_updated_at
  BEFORE UPDATE ON public.clicks_etapa
  FOR EACH ROW
  EXECUTE FUNCTION update_clicks_etapa_updated_at();

-- 7. Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Tabla clicks_etapa creada correctamente';
  RAISE NOTICE '📋 Columnas: id, fecha, hora, id_cliente, tipo_cliente, id_solicitud, etapa_nueva';
  RAISE NOTICE '🔗 Foreign key a solicitudes configurada';
  RAISE NOTICE '========================================';
END $$;
