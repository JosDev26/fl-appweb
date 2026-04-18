-- =============================================
-- DIAGNÓSTICO: Clientes con modoPago=false pero datos pendientes
-- =============================================
-- Ejecutar DESPUÉS de aplicar fix_cliente_tiene_datos_pendientes_all_months.sql
-- Encuentra clientes que fueron desactivados prematuramente.
-- =============================================

-- 1. Empresas con modoPago=false que tienen datos pendientes (ventana 12 meses)
SELECT 
  e.id,
  e.nombre,
  e."modoPago",
  (cliente_tiene_datos_pendientes(e.id, 'empresa'))::json as datos_pendientes
FROM empresas e
WHERE e."modoPago" = false
  AND ((cliente_tiene_datos_pendientes(e.id, 'empresa'))::json->>'tieneDatos')::boolean = true
ORDER BY e.nombre;

-- 2. Usuarios con modoPago=false que tienen datos pendientes (ventana 12 meses)
SELECT 
  u.id,
  u.nombre,
  u."modoPago",
  (cliente_tiene_datos_pendientes(u.id, 'cliente'))::json as datos_pendientes
FROM usuarios u
WHERE u."modoPago" = false
  AND ((cliente_tiene_datos_pendientes(u.id, 'cliente'))::json->>'tieneDatos')::boolean = true
ORDER BY u.nombre;

-- 3. Para reactivar manualmente los afectados (DESCOMENTAR si necesario):
-- UPDATE empresas SET "modoPago" = true WHERE id IN (
--   SELECT e.id FROM empresas e
--   WHERE e."modoPago" = false
--     AND ((cliente_tiene_datos_pendientes(e.id, 'empresa'))::json->>'tieneDatos')::boolean = true
-- );
-- UPDATE usuarios SET "modoPago" = true WHERE id IN (
--   SELECT u.id FROM usuarios u
--   WHERE u."modoPago" = false
--     AND ((cliente_tiene_datos_pendientes(u.id, 'cliente'))::json->>'tieneDatos')::boolean = true
-- );
