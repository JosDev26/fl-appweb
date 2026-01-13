-- ============================================================================
-- MIGRACIÓN: Extender visto_bueno_mensual para soportar rechazos
-- ============================================================================
-- Este script añade soporte para:
-- 1. Estado del visto bueno (pendiente/aprobado/rechazado)
-- 2. Motivo de rechazo con documentación
-- 3. Archivo adjunto de respaldo
-- 4. Limpieza automática de archivos antiguos (>12 meses)
-- ============================================================================

-- 1. Añadir columna estado (pendiente, aprobado, rechazado)
ALTER TABLE public.visto_bueno_mensual 
ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pendiente' 
CHECK (estado IN ('pendiente', 'aprobado', 'rechazado'));

-- 2. Añadir columnas para rechazo
ALTER TABLE public.visto_bueno_mensual 
ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

ALTER TABLE public.visto_bueno_mensual 
ADD COLUMN IF NOT EXISTS archivo_rechazo_path TEXT;

ALTER TABLE public.visto_bueno_mensual 
ADD COLUMN IF NOT EXISTS fecha_rechazo TIMESTAMPTZ;

-- 3. Migrar datos existentes
-- dado=true → estado='aprobado', dado=false/null → estado='pendiente'
UPDATE public.visto_bueno_mensual 
SET estado = CASE 
    WHEN dado = true THEN 'aprobado' 
    ELSE 'pendiente' 
END
WHERE estado IS NULL OR estado = 'pendiente';

-- 4. Crear índice para búsquedas por estado
CREATE INDEX IF NOT EXISTS idx_visto_bueno_estado 
ON public.visto_bueno_mensual(estado);

-- 5. Crear índice compuesto para consultas admin por mes y estado
CREATE INDEX IF NOT EXISTS idx_visto_bueno_mes_estado 
ON public.visto_bueno_mensual(mes, estado);

-- 6. Añadir constraint de longitud máxima para motivo_rechazo
ALTER TABLE public.visto_bueno_mensual 
ADD CONSTRAINT chk_motivo_rechazo_length 
CHECK (motivo_rechazo IS NULL OR length(motivo_rechazo) <= 500);

-- 7. Comentarios para documentación
COMMENT ON COLUMN public.visto_bueno_mensual.estado IS 'Estado del visto bueno: pendiente, aprobado, rechazado';
COMMENT ON COLUMN public.visto_bueno_mensual.motivo_rechazo IS 'Motivo del rechazo proporcionado por el cliente (máx 500 caracteres)';
COMMENT ON COLUMN public.visto_bueno_mensual.archivo_rechazo_path IS 'Ruta del archivo adjunto en el bucket visto-bueno-rechazos';
COMMENT ON COLUMN public.visto_bueno_mensual.fecha_rechazo IS 'Fecha y hora en que se registró el rechazo';

-- 8. Función para limpiar archivos de rechazos antiguos (>12 meses)
-- Esta función debe ser llamada periódicamente por un cron job
CREATE OR REPLACE FUNCTION cleanup_old_visto_bueno_files()
RETURNS TABLE(deleted_count INTEGER, deleted_paths TEXT[]) AS $$
DECLARE
    old_paths TEXT[];
    count_deleted INTEGER;
BEGIN
    -- Obtener paths de archivos con más de 12 meses
    SELECT ARRAY_AGG(archivo_rechazo_path)
    INTO old_paths
    FROM public.visto_bueno_mensual
    WHERE archivo_rechazo_path IS NOT NULL
    AND fecha_rechazo < NOW() - INTERVAL '12 months';
    
    -- Limpiar motivo y archivo de registros antiguos
    UPDATE public.visto_bueno_mensual
    SET 
        motivo_rechazo = NULL,
        archivo_rechazo_path = NULL
    WHERE archivo_rechazo_path IS NOT NULL
    AND fecha_rechazo < NOW() - INTERVAL '12 months';
    
    GET DIAGNOSTICS count_deleted = ROW_COUNT;
    
    RETURN QUERY SELECT count_deleted, COALESCE(old_paths, ARRAY[]::TEXT[]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Otorgar permisos
GRANT EXECUTE ON FUNCTION cleanup_old_visto_bueno_files() TO service_role;

-- ============================================================================
-- NOTA: Después de ejecutar este script, debes:
-- 1. Crear el bucket 'visto-bueno-rechazos' en Supabase Storage
-- 2. Configurar un cron job mensual para llamar cleanup_old_visto_bueno_files()
--    y eliminar los archivos retornados del storage
-- ============================================================================
