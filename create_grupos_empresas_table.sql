-- ============================================================================
-- SCRIPT: Crear tabla para grupos de empresas
-- ============================================================================
-- PROPÓSITO:
--   Permitir que una empresa principal pueda ver y pagar por otras empresas
--   asociadas. Las horas, gastos y solicitudes de todas las empresas del grupo
--   se muestran y suman en el portal de la empresa principal.
-- ============================================================================

-- 1. Crear la tabla de grupos de empresas
CREATE TABLE IF NOT EXISTS public.grupos_empresas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,                        -- Nombre del grupo (ej: "Grupo Corporativo ABC")
  empresa_principal_id TEXT NOT NULL,          -- ID de la empresa que paga por todas
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Restricción: una empresa principal solo puede tener un grupo
  CONSTRAINT unique_empresa_principal UNIQUE (empresa_principal_id)
);

-- 2. Crear tabla de empresas asociadas al grupo
CREATE TABLE IF NOT EXISTS public.grupos_empresas_miembros (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id UUID NOT NULL REFERENCES public.grupos_empresas(id) ON DELETE CASCADE,
  empresa_id TEXT NOT NULL,                    -- ID de la empresa asociada
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Restricción: una empresa solo puede estar en un grupo
  CONSTRAINT unique_empresa_miembro UNIQUE (empresa_id),
  -- Restricción: no repetir empresa en el mismo grupo
  CONSTRAINT unique_empresa_grupo UNIQUE (grupo_id, empresa_id)
);

-- 3. Habilitar RLS
ALTER TABLE public.grupos_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupos_empresas_miembros ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS - Permitir acceso público (controlado por backend)
CREATE POLICY "Allow all on grupos_empresas"
ON public.grupos_empresas FOR ALL TO public
USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on grupos_empresas_miembros"
ON public.grupos_empresas_miembros FOR ALL TO public
USING (true) WITH CHECK (true);

-- 5. Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_grupos_empresa_principal 
ON public.grupos_empresas(empresa_principal_id);

CREATE INDEX IF NOT EXISTS idx_grupos_miembros_grupo 
ON public.grupos_empresas_miembros(grupo_id);

CREATE INDEX IF NOT EXISTS idx_grupos_miembros_empresa 
ON public.grupos_empresas_miembros(empresa_id);

-- 6. Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_grupos_empresas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_grupos_empresas_updated_at ON public.grupos_empresas;
CREATE TRIGGER trigger_grupos_empresas_updated_at
  BEFORE UPDATE ON public.grupos_empresas
  FOR EACH ROW
  EXECUTE FUNCTION update_grupos_empresas_updated_at();

-- 7. Comentarios
COMMENT ON TABLE public.grupos_empresas IS 'Grupos de empresas donde una principal paga por las demás';
COMMENT ON COLUMN public.grupos_empresas.empresa_principal_id IS 'ID de la empresa que ve y paga por todas las del grupo';
COMMENT ON TABLE public.grupos_empresas_miembros IS 'Empresas asociadas a cada grupo';
COMMENT ON COLUMN public.grupos_empresas_miembros.empresa_id IS 'ID de la empresa asociada (no la principal)';

-- 8. Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE '✅ Tablas grupos_empresas y grupos_empresas_miembros creadas correctamente';
END $$;
