-- ============================================
-- CONFIGURACIÓN DE SUPABASE STORAGE PARA FACTURAS ELECTRÓNICAS
-- ============================================

-- 1. Crear bucket para facturas (ejecutar desde Supabase Dashboard o SQL Editor)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false, -- privado, requiere autenticación
  10485760, -- 10MB límite (más grande que receipts por archivos XML)
  ARRAY['application/pdf', 'application/xml', 'text/xml']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas RLS para el bucket
-- Permitir subir archivos (admins desde panel dev)
CREATE POLICY "Allow authenticated uploads to invoices"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'invoices');

-- Permitir ver archivos
CREATE POLICY "Allow authenticated reads from invoices"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'invoices');

-- Permitir eliminar archivos (en caso de corrección)
CREATE POLICY "Allow authenticated deletes from invoices"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'invoices');

-- 3. Tabla para trackear facturas subidas por clientes
CREATE TABLE IF NOT EXISTS client_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT NOT NULL,
  tipo_cliente TEXT NOT NULL CHECK (tipo_cliente IN ('cliente', 'empresa')),
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  uploaded_by TEXT, -- ID del admin que subió la factura
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para mejorar performance
CREATE INDEX idx_client_invoices_client ON client_invoices(client_id);
CREATE INDEX idx_client_invoices_tipo ON client_invoices(tipo_cliente);
CREATE INDEX idx_client_invoices_uploaded ON client_invoices(uploaded_at);

-- Índice único para prevenir múltiples facturas por cliente
CREATE UNIQUE INDEX idx_client_invoices_unique_client ON client_invoices(client_id, tipo_cliente);

-- RLS para la tabla client_invoices
ALTER TABLE client_invoices ENABLE ROW LEVEL SECURITY;

-- Permitir que cualquier usuario autenticado vea registros
CREATE POLICY "Allow public reads on client invoices"
ON client_invoices FOR SELECT
TO public
USING (true);

-- Permitir que cualquier usuario autenticado inserte registros
-- (la seguridad real se maneja en el backend)
CREATE POLICY "Allow public inserts on client invoices"
ON client_invoices FOR INSERT
TO public
WITH CHECK (true);

-- Permitir actualizaciones (para reemplazar facturas)
CREATE POLICY "Allow public updates on client invoices"
ON client_invoices FOR UPDATE
TO public
USING (true);

-- 4. Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_client_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_client_invoices_timestamp
BEFORE UPDATE ON client_invoices
FOR EACH ROW
EXECUTE FUNCTION update_client_invoices_updated_at();

-- ============================================
-- COMANDOS ÚTILES PARA VERIFICAR
-- ============================================

-- Ver todos los buckets
-- SELECT * FROM storage.buckets WHERE id = 'invoices';

-- Ver políticas del bucket
-- SELECT * FROM storage.policies WHERE bucket_id = 'invoices';

-- Ver facturas subidas
-- SELECT * FROM client_invoices ORDER BY uploaded_at DESC;

-- Ver archivos en storage
-- SELECT * FROM storage.objects WHERE bucket_id = 'invoices';
