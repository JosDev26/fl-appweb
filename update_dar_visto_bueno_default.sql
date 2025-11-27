-- ============================================================================
-- SCRIPT: Cambiar darVistoBueno a TRUE por defecto para todos los clientes
-- ============================================================================
-- PROPÓSITO:
--   1. Cambiar el DEFAULT de la columna darVistoBueno a TRUE
--   2. Actualizar todos los registros existentes a TRUE
--
-- NOTA: Esta columna NO se sincroniza con AppSheet/Google Sheets
-- ============================================================================

-- PASO 1: Cambiar el DEFAULT de la columna en usuarios
ALTER TABLE public.usuarios
ALTER COLUMN "darVistoBueno" SET DEFAULT true;

-- PASO 2: Cambiar el DEFAULT de la columna en empresas
ALTER TABLE public.empresas
ALTER COLUMN "darVistoBueno" SET DEFAULT true;

-- PASO 3: Actualizar todos los usuarios existentes a TRUE
UPDATE public.usuarios
SET "darVistoBueno" = true
WHERE "darVistoBueno" = false OR "darVistoBueno" IS NULL;

-- PASO 4: Actualizar todas las empresas existentes a TRUE
UPDATE public.empresas
SET "darVistoBueno" = true
WHERE "darVistoBueno" = false OR "darVistoBueno" IS NULL;

-- PASO 5: Actualizar índices (ahora casi todos tienen darVistoBueno = true)
-- Los índices WHERE darVistoBueno = true ya no son tan útiles
-- Opcionalmente podrías eliminarlos y crear índices para false
DROP INDEX IF EXISTS idx_usuarios_dar_visto_bueno;
DROP INDEX IF EXISTS idx_empresas_dar_visto_bueno;

-- Crear índices para el caso minoritario (darVistoBueno = false)
CREATE INDEX IF NOT EXISTS idx_usuarios_sin_visto_bueno ON public.usuarios("darVistoBueno") WHERE "darVistoBueno" = false;
CREATE INDEX IF NOT EXISTS idx_empresas_sin_visto_bueno ON public.empresas("darVistoBueno") WHERE "darVistoBueno" = false;

-- Mensaje de confirmación
DO $$
DECLARE
  usuarios_actualizados int;
  empresas_actualizadas int;
BEGIN
  SELECT COUNT(*) INTO usuarios_actualizados
  FROM usuarios
  WHERE "darVistoBueno" = true;
  
  SELECT COUNT(*) INTO empresas_actualizadas
  FROM empresas
  WHERE "darVistoBueno" = true;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Actualización completada';
  RAISE NOTICE '📊 Usuarios con darVistoBueno = true: %', usuarios_actualizados;
  RAISE NOTICE '📊 Empresas con darVistoBueno = true: %', empresas_actualizadas;
  RAISE NOTICE '========================================';
  RAISE NOTICE '💡 Ahora todos los clientes nuevos tendrán darVistoBueno = true por defecto';
  RAISE NOTICE '💡 Los clientes existentes fueron actualizados a true';
END $$;
