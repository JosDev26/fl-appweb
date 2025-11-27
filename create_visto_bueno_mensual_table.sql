-- Crear tabla para gestionar visto bueno mensual de horas trabajadas
CREATE TABLE IF NOT EXISTS public.visto_bueno_mensual (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Información del cliente
    client_id TEXT NOT NULL,
    client_type TEXT NOT NULL CHECK (client_type IN ('cliente', 'empresa')),
    
    -- Mes del visto bueno (formato YYYY-MM)
    mes TEXT NOT NULL,
    
    -- Estado y fecha
    dado BOOLEAN DEFAULT FALSE,
    fecha_visto_bueno TIMESTAMP WITH TIME ZONE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraint único: un visto bueno por cliente por mes
    UNIQUE(client_id, client_type, mes)
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_visto_bueno_client ON public.visto_bueno_mensual(client_id, client_type);
CREATE INDEX IF NOT EXISTS idx_visto_bueno_mes ON public.visto_bueno_mensual(mes);
CREATE INDEX IF NOT EXISTS idx_visto_bueno_dado ON public.visto_bueno_mensual(dado);

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_visto_bueno_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_visto_bueno_timestamp
    BEFORE UPDATE ON public.visto_bueno_mensual
    FOR EACH ROW
    EXECUTE FUNCTION update_visto_bueno_timestamp();

-- Comentarios para documentación
COMMENT ON TABLE public.visto_bueno_mensual IS 'Registra el visto bueno mensual de clientes/empresas a sus horas trabajadas';
COMMENT ON COLUMN public.visto_bueno_mensual.mes IS 'Mes en formato YYYY-MM (ej: 2024-11)';
COMMENT ON COLUMN public.visto_bueno_mensual.dado IS 'TRUE si el cliente ya dio visto bueno';
COMMENT ON COLUMN public.visto_bueno_mensual.fecha_visto_bueno IS 'Fecha y hora en que se dio el visto bueno';

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.visto_bueno_mensual ENABLE ROW LEVEL SECURITY;

-- Política: Admin puede ver y modificar todo
CREATE POLICY "Admin full access on visto_bueno_mensual"
    ON public.visto_bueno_mensual
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Política: Clientes solo pueden ver y actualizar sus propios registros
CREATE POLICY "Clients can manage their own visto bueno"
    ON public.visto_bueno_mensual
    FOR ALL
    USING (
        client_id = current_setting('request.jwt.claims', true)::json->>'sub'
    );
