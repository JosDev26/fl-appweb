-- ============================================
-- FIX RLS: dev_admins, dev_auth_codes, dev_sessions
-- Cierra §1.2 (forja de sesiones) y §1.3 (divulgación de hashes)
--
-- Antes: USING(true)/WITH CHECK(true) para todo (anon podía leer/escribir).
-- Después: solo service_role (que tiene BYPASSRLS); anon/authenticated bloqueados.
-- Espejo del patrón de password_reset_tokens.
--
-- ORDEN DE DESPLIEGUE:
--   1) Deployar el código que usa supabaseAdmin (lib/supabase-admin.ts) en todas
--      las rutas dev-auth + proxy.ts + verifyDevAdminSession.
--   2) Aplicar este SQL (staging primero, luego prod).
--   Si se aplica antes del código, el login dev se rompe temporalmente.
-- ============================================

-- ============================================
-- dev_admins
-- ============================================
DROP POLICY IF EXISTS "Permitir lectura de admins" ON public.dev_admins;
DROP POLICY IF EXISTS "Permitir actualización de admins" ON public.dev_admins;

CREATE POLICY "dev_admins service_role only"
  ON public.dev_admins
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "dev_admins no public access"
  ON public.dev_admins
  FOR ALL
  USING (false);

-- ============================================
-- dev_auth_codes
-- ============================================
DROP POLICY IF EXISTS "Permitir inserción de códigos" ON public.dev_auth_codes;
DROP POLICY IF EXISTS "Permitir lectura de códigos" ON public.dev_auth_codes;
DROP POLICY IF EXISTS "Permitir actualización de códigos" ON public.dev_auth_codes;

CREATE POLICY "dev_auth_codes service_role only"
  ON public.dev_auth_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "dev_auth_codes no public access"
  ON public.dev_auth_codes
  FOR ALL
  USING (false);

-- ============================================
-- dev_sessions
-- ============================================
DROP POLICY IF EXISTS "Permitir inserción de sesiones" ON public.dev_sessions;
DROP POLICY IF EXISTS "Permitir lectura de sesiones" ON public.dev_sessions;
DROP POLICY IF EXISTS "Permitir actualización de sesiones" ON public.dev_sessions;
DROP POLICY IF EXISTS "Permitir eliminación de sesiones" ON public.dev_sessions;

CREATE POLICY "dev_sessions service_role only"
  ON public.dev_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "dev_sessions no public access"
  ON public.dev_sessions
  FOR ALL
  USING (false);

-- ============================================
-- Verificación
-- ============================================
-- Ejecutar para confirmar que anon ya no puede leer:
--   -- desde el navegador con la anon key pública:
--   supabase.from('dev_admins').select('*')  -- debe devolver vacío/error
--   supabase.from('dev_sessions').select('*') -- debe devolver vacío/error
--
-- Verificar policies aplicadas:
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('dev_admins', 'dev_auth_codes', 'dev_sessions')
ORDER BY tablename, policyname;
