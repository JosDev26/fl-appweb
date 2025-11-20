-- ============================================
-- FIX: Políticas RLS para payment_receipts
-- ============================================

-- Eliminar políticas existentes que puedan estar bloqueando
DROP POLICY IF EXISTS "Enable read access for all users" ON payment_receipts;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON payment_receipts;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON payment_receipts;

-- Política para SELECT (lectura) - Permitir a todos
CREATE POLICY "Allow public read access"
ON payment_receipts
FOR SELECT
TO public
USING (true);

-- Política para INSERT (crear) - Permitir a todos
CREATE POLICY "Allow public insert"
ON payment_receipts
FOR INSERT
TO public
WITH CHECK (true);

-- Política para UPDATE (actualizar) - Permitir a todos
CREATE POLICY "Allow public update"
ON payment_receipts
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Política para DELETE (eliminar) - Permitir a todos (necesario para la limpieza automática)
CREATE POLICY "Allow public delete"
ON payment_receipts
FOR DELETE
TO public
USING (true);

-- Verificar que las políticas se crearon correctamente
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'payment_receipts';
