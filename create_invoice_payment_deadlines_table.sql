-- Crear tabla para gestionar facturas electrónicas
CREATE TABLE IF NOT EXISTS public.invoice_payment_deadlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Información de la factura
    mes_factura TEXT NOT NULL, -- Formato: YYYY-MM (mes al que corresponde la factura)
    client_id TEXT NOT NULL,
    client_type TEXT NOT NULL CHECK (client_type IN ('cliente', 'empresa')),
    file_path TEXT NOT NULL, -- Path de la factura en storage
    
    -- Fechas importantes
    fecha_emision DATE NOT NULL, -- Fecha en que se subió la factura
    
    -- Estado del pago
    estado_pago TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente', 'pagado')),
    fecha_pago TIMESTAMP WITH TIME ZONE, -- Fecha en que se aprobó el comprobante de pago
    
    -- Notas
    nota TEXT, -- Notas adicionales
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint único: una factura por mes por cliente
    UNIQUE(mes_factura, client_id, client_type)
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_invoice_deadlines_client ON public.invoice_payment_deadlines(client_id, client_type);
CREATE INDEX IF NOT EXISTS idx_invoice_deadlines_mes ON public.invoice_payment_deadlines(mes_factura);
CREATE INDEX IF NOT EXISTS idx_invoice_deadlines_estado ON public.invoice_payment_deadlines(estado_pago);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_invoice_deadline_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_deadline_timestamp
    BEFORE UPDATE ON public.invoice_payment_deadlines
    FOR EACH ROW
    EXECUTE FUNCTION update_invoice_deadline_timestamp();

-- Comentarios para documentación
COMMENT ON TABLE public.invoice_payment_deadlines IS 'Gestión de facturas electrónicas mensuales';
COMMENT ON COLUMN public.invoice_payment_deadlines.mes_factura IS 'Mes al que corresponde la factura (YYYY-MM)';
COMMENT ON COLUMN public.invoice_payment_deadlines.fecha_emision IS 'Fecha en que se subió la factura';
COMMENT ON COLUMN public.invoice_payment_deadlines.estado_pago IS 'pendiente: esperando pago, pagado: comprobante aprobado';

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.invoice_payment_deadlines ENABLE ROW LEVEL SECURITY;

-- Política: Admin puede ver y modificar todo
CREATE POLICY "Admin full access on invoice_payment_deadlines"
    ON public.invoice_payment_deadlines
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Política: Clientes solo pueden ver sus propios plazos
CREATE POLICY "Clients can view their own invoice deadlines"
    ON public.invoice_payment_deadlines
    FOR SELECT
    USING (
        client_id = current_setting('request.jwt.claims', true)::json->>'sub'
    );
