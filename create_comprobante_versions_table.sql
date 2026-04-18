-- Crear tabla para historial de versiones de comprobantes editados
CREATE TABLE IF NOT EXISTS public.comprobante_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Referencia al comprobante original
    receipt_id UUID NOT NULL REFERENCES public.payment_receipts(id) ON DELETE CASCADE,
    
    -- Snapshot de datos anteriores
    file_path TEXT,
    file_name TEXT,
    monto_declarado DECIMAL(10,2),
    mes_pago TEXT,
    estado TEXT,
    nota_revision TEXT,
    
    -- Información del cambio
    reason TEXT NOT NULL, -- Motivo del cambio (siempre obligatorio)
    replaced_by TEXT NOT NULL, -- dev-admin-id que hizo el cambio
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para consultas por comprobante
CREATE INDEX IF NOT EXISTS idx_comprobante_versions_receipt 
    ON public.comprobante_versions(receipt_id);

-- Índice para consultas por admin
CREATE INDEX IF NOT EXISTS idx_comprobante_versions_replaced_by 
    ON public.comprobante_versions(replaced_by);

-- Comentarios
COMMENT ON TABLE public.comprobante_versions IS 'Historial de versiones de comprobantes editados/reemplazados';
COMMENT ON COLUMN public.comprobante_versions.file_path IS 'Path del archivo anterior en storage (NULL si solo se editaron metadatos)';
COMMENT ON COLUMN public.comprobante_versions.reason IS 'Motivo del cambio - siempre obligatorio';
COMMENT ON COLUMN public.comprobante_versions.replaced_by IS 'ID del admin que realizó la edición';

-- Habilitar RLS
ALTER TABLE public.comprobante_versions ENABLE ROW LEVEL SECURITY;

-- Política: Solo service_role tiene acceso completo
CREATE POLICY "Service role full access on comprobante_versions"
    ON public.comprobante_versions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
