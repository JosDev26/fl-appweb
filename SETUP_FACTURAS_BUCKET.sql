-- ============================================
-- PASO 1: Crear el bucket manualmente
-- ============================================
-- Ve a: Supabase Dashboard → Storage → Create a new bucket
-- Nombre: electronic-invoices
-- Public: NO (dejarlo privado)
-- 
-- O ejecuta esto desde la consola de JavaScript del navegador en Supabase:
-- const { data, error } = await supabase.storage.createBucket('electronic-invoices', { public: false })

-- ============================================
-- PASO 2: Ejecutar estas políticas RLS
-- ============================================

-- Eliminar políticas existentes si las hay
DROP POLICY IF EXISTS "Permitir lectura de facturas autenticadas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir subida de facturas autenticadas" ON storage.objects;
DROP POLICY IF EXISTS "Permitir eliminación de facturas" ON storage.objects;

-- Política para permitir lectura de facturas
CREATE POLICY "Permitir lectura de facturas autenticadas"
ON storage.objects FOR SELECT
USING (bucket_id = 'electronic-invoices');

-- Política para permitir subida de facturas (solo XML y PDF)
CREATE POLICY "Permitir subida de facturas autenticadas"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'electronic-invoices' 
  AND (
    -- Solo permitir archivos XML y PDF
    (LOWER(RIGHT(name, 4)) = '.xml') OR
    (LOWER(RIGHT(name, 4)) = '.pdf')
  )
  AND (storage.foldername(name))[1] IN ('cliente', 'empresa')
);

-- Política para permitir actualización de facturas
CREATE POLICY "Permitir actualización de facturas"
ON storage.objects FOR UPDATE
USING (bucket_id = 'electronic-invoices')
WITH CHECK (bucket_id = 'electronic-invoices');

-- Política para permitir eliminación de facturas
CREATE POLICY "Permitir eliminación de facturas"
ON storage.objects FOR DELETE
USING (bucket_id = 'electronic-invoices');
