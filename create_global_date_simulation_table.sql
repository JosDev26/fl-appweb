-- ============================================================================
-- SCRIPT: Crear tabla para fecha simulada global (solo testing)
-- ============================================================================
-- PROPÓSITO:
--   Almacenar una fecha simulada que afecte a TODOS los usuarios de la app
--   para testing. Solo debe existir UN registro activo a la vez.
--
-- ⚠️ IMPORTANTE: Esta tabla debe estar VACÍA en producción
-- ============================================================================

-- 1. Crear la tabla de configuración global
CREATE TABLE IF NOT EXISTS public.system_config (
  key TEXT PRIMARY KEY,                        -- Identificador único de la config
  value TEXT NOT NULL,                         -- Valor de la configuración
  description TEXT,                            -- Descripción de qué hace
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

-- 3. Política RLS - Solo lectura pública, escritura controlada por backend
CREATE POLICY "Allow public read on system_config"
ON public.system_config
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow all operations on system_config"
ON public.system_config
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 4. Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_system_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_system_config_updated_at ON public.system_config;
CREATE TRIGGER trigger_system_config_updated_at
  BEFORE UPDATE ON public.system_config
  FOR EACH ROW
  EXECUTE FUNCTION update_system_config_updated_at();

-- 5. Comentarios
COMMENT ON TABLE public.system_config IS 'Configuraciones globales del sistema (incluyendo fecha simulada para testing)';
COMMENT ON COLUMN public.system_config.key IS 'Clave única de la configuración (ej: simulated_date)';
COMMENT ON COLUMN public.system_config.value IS 'Valor de la configuración';
COMMENT ON COLUMN public.system_config.description IS 'Descripción de la configuración';

-- ============================================================================
-- CÓMO USAR:
-- 
-- Para ACTIVAR fecha simulada (todos verán 15 de diciembre 2024):
--   INSERT INTO system_config (key, value, description)
--   VALUES ('simulated_date', '2024-12-15', 'Fecha simulada para testing')
--   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
--
-- Para DESACTIVAR (volver a fecha real):
--   DELETE FROM system_config WHERE key = 'simulated_date';
--
-- Para VER configuración actual:
--   SELECT * FROM system_config WHERE key = 'simulated_date';
-- ============================================================================

-- 6. Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Tabla system_config creada correctamente';
  RAISE NOTICE '📋 Usar key="simulated_date" para fecha simulada global';
  RAISE NOTICE '⚠️ IMPORTANTE: Eliminar registro antes de producción';
  RAISE NOTICE '========================================';
END $$;
