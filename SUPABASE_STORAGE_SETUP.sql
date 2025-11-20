-- ============================================
-- CONFIGURACIÓN DE SUPABASE STORAGE PARA COMPROBANTES DE PAGO
-- ============================================

-- 1. Crear bucket para comprobantes de pago (ejecutar desde Supabase Dashboard o SQL Editor)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-receipts',
  'payment-receipts',
  false, -- privado, requiere autenticación
  5242880, -- 5MB límite
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
);

-- 2. Políticas RLS para el bucket
-- IMPORTANTE: Como usamos supabase client sin auth.uid(), necesitamos políticas más permisivas
-- O usar service_role key en el backend

-- Permitir subir archivos (sin restricción de auth por ahora)
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'payment-receipts');

-- Permitir ver archivos
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'payment-receipts');

-- Permitir eliminar archivos
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'payment-receipts');

-- 3. Tabla para trackear comprobantes subidos
CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  tipo_cliente TEXT NOT NULL CHECK (tipo_cliente IN ('cliente', 'empresa')),
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  mes_pago TEXT NOT NULL, -- Ej: "2024-11" para nov 2024
  monto_declarado DECIMAL(10,2),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  nota_revision TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar performance
CREATE INDEX idx_payment_receipts_user ON payment_receipts(user_id);
CREATE INDEX idx_payment_receipts_estado ON payment_receipts(estado);
CREATE INDEX idx_payment_receipts_mes ON payment_receipts(mes_pago);
CREATE INDEX idx_payment_receipts_uploaded ON payment_receipts(uploaded_at);

-- RLS para la tabla payment_receipts
ALTER TABLE payment_receipts ENABLE ROW LEVEL SECURITY;

-- Permitir que cualquier usuario autenticado vea registros (la seguridad se maneja en el backend)
CREATE POLICY "Allow public reads on payment receipts"
ON payment_receipts FOR SELECT
TO public
USING (true);

-- Permitir que cualquier usuario autenticado inserte registros
CREATE POLICY "Allow public inserts on payment receipts"
ON payment_receipts FOR INSERT
TO public
WITH CHECK (true);

-- 4. Función para auto-eliminar comprobantes viejos (después de 90 días aprobados o 30 días rechazados)
CREATE OR REPLACE FUNCTION delete_old_payment_receipts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_receipt RECORD;
BEGIN
  -- Eliminar comprobantes aprobados con más de 90 días
  FOR old_receipt IN
    SELECT file_path, id
    FROM payment_receipts
    WHERE estado = 'aprobado' 
    AND reviewed_at < NOW() - INTERVAL '90 days'
  LOOP
    -- Eliminar del storage
    PERFORM storage.delete_object('payment-receipts', old_receipt.file_path);
    
    -- Eliminar registro
    DELETE FROM payment_receipts WHERE id = old_receipt.id;
  END LOOP;
  
  -- Eliminar comprobantes rechazados con más de 30 días
  FOR old_receipt IN
    SELECT file_path, id
    FROM payment_receipts
    WHERE estado = 'rechazado' 
    AND reviewed_at < NOW() - INTERVAL '30 days'
  LOOP
    PERFORM storage.delete_object('payment-receipts', old_receipt.file_path);
    DELETE FROM payment_receipts WHERE id = old_receipt.id;
  END LOOP;
END;
$$;

-- 5. Programar limpieza automática con pg_cron (solo si está habilitado en tu plan de Supabase)
-- NOTA: pg_cron requiere plan Pro o superior. Si tienes plan Free, comenta estas líneas.
-- Para habilitar pg_cron en plan Pro+: Dashboard → Database → Extensions → Habilitar pg_cron

-- Descomentar estas líneas si tienes pg_cron habilitado:
/*
SELECT cron.schedule(
  'cleanup-old-payment-receipts',
  '0 3 * * *',
  'SELECT delete_old_payment_receipts();'
);
*/

-- ALTERNATIVA para plan Free: Ejecutar manualmente cada mes o crear un endpoint API que llame a la función
-- Ejemplo: Crear un endpoint /api/cleanup-receipts que ejecute: SELECT delete_old_payment_receipts();

-- 6. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_payment_receipts_updated_at
BEFORE UPDATE ON payment_receipts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMANDOS ÚTILES PARA VERIFICAR
-- ============================================

-- Ver todos los buckets
-- SELECT * FROM storage.buckets WHERE id = 'payment-receipts';

-- Ver políticas del bucket
-- SELECT * FROM storage.policies WHERE bucket_id = 'payment-receipts';

-- Ver comprobantes subidos
-- SELECT * FROM payment_receipts ORDER BY uploaded_at DESC;

-- Ver trabajos cron programados
-- SELECT * FROM cron.job WHERE jobname = 'cleanup-old-payment-receipts';
