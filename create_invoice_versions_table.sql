-- Crear tabla para historial de versiones de facturas editadas
CREATE TABLE IF NOT EXISTS public.invoice_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Referencia a la factura original
    invoice_deadline_id UUID NOT NULL REFERENCES public.invoice_payment_deadlines(id) ON DELETE CASCADE,
    
    -- Snapshot de datos anteriores
    file_path TEXT, -- Path del archivo anterior (NULL si no cambió archivo)
    mes_factura TEXT NOT NULL, -- Mes que tenía antes
    estado_pago TEXT NOT NULL, -- Estado que tenía antes
    nota TEXT, -- Nota que tenía antes
    fecha_emision DATE, -- Fecha emisión anterior
    
    -- Información del cambio
    reason TEXT, -- Motivo del cambio (obligatorio si se reemplaza archivo)
    replaced_by TEXT NOT NULL, -- dev-admin-id que hizo el cambio
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para consultas por factura
CREATE INDEX IF NOT EXISTS idx_invoice_versions_deadline 
    ON public.invoice_versions(invoice_deadline_id);

-- Índice para consultas por admin
CREATE INDEX IF NOT EXISTS idx_invoice_versions_replaced_by 
    ON public.invoice_versions(replaced_by);

-- Comentarios
COMMENT ON TABLE public.invoice_versions IS 'Historial de versiones de facturas editadas/reemplazadas';
COMMENT ON COLUMN public.invoice_versions.file_path IS 'Path del archivo anterior en storage (NULL si solo se editaron metadatos)';
COMMENT ON COLUMN public.invoice_versions.reason IS 'Motivo del cambio - obligatorio al reemplazar archivo';
COMMENT ON COLUMN public.invoice_versions.replaced_by IS 'ID del admin que realizó la edición';

-- Habilitar RLS
ALTER TABLE public.invoice_versions ENABLE ROW LEVEL SECURITY;

-- Política: Solo service_role tiene acceso completo (historial solo visible en DB por ahora)
CREATE POLICY "Service role full access on invoice_versions"
    ON public.invoice_versions
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
