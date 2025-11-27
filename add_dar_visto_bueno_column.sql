-- Agregar columna darVistoBueno a usuarios y empresas
-- Esta columna indica si el cliente/empresa debe dar visto bueno a las horas mensuales
-- NO se sincroniza con AppSheet/Google Sheets

-- Agregar columna a usuarios
ALTER TABLE public.usuarios
ADD COLUMN IF NOT EXISTS "darVistoBueno" BOOLEAN DEFAULT false;

-- Agregar columna a empresas
ALTER TABLE public.empresas
ADD COLUMN IF NOT EXISTS "darVistoBueno" BOOLEAN DEFAULT false;

-- Comentarios para documentación
COMMENT ON COLUMN public.usuarios."darVistoBueno" IS 'Indica si el cliente debe dar visto bueno a las horas trabajadas del mes antes de emitir factura. No se sincroniza con AppSheet.';
COMMENT ON COLUMN public.empresas."darVistoBueno" IS 'Indica si la empresa debe dar visto bueno a las horas trabajadas del mes antes de emitir factura. No se sincroniza con AppSheet.';

-- Crear índices para mejorar rendimiento en consultas que filtren por este campo
CREATE INDEX IF NOT EXISTS idx_usuarios_dar_visto_bueno ON public.usuarios("darVistoBueno") WHERE "darVistoBueno" = true;
CREATE INDEX IF NOT EXISTS idx_empresas_dar_visto_bueno ON public.empresas("darVistoBueno") WHERE "darVistoBueno" = true;
