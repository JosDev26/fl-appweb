-- ============================================
-- VERIFICACIÓN DE CONFIGURACIÓN
-- ============================================

-- 1. Verificar que la tabla payment_receipts existe
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'payment_receipts';

-- 2. Ver estructura de la tabla
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payment_receipts'
ORDER BY ordinal_position;

-- 3. Ver comprobantes subidos (si la tabla existe)
SELECT * FROM payment_receipts ORDER BY uploaded_at DESC LIMIT 10;

-- 4. Ver usuarios con modoPago activo
SELECT id, nombre, cedula, "modoPago" 
FROM usuarios 
WHERE "modoPago" = true;

-- 5. Ver empresas con modoPago activo  
SELECT id, nombre, cedula, "modoPago"
FROM empresas
WHERE "modoPago" = true;

-- 6. Verificar bucket de storage
SELECT * FROM storage.buckets WHERE id = 'payment-receipts';

-- 7. Ver políticas RLS de la tabla
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'payment_receipts';

-- 8. Ver objetos en el bucket (archivos subidos)
SELECT name, id, bucket_id, created_at, updated_at, last_accessed_at
FROM storage.objects
WHERE bucket_id = 'payment-receipts'
ORDER BY created_at DESC
LIMIT 10;
