-- ============================================================================
-- DIAGNÓSTICO: Servicios Profesionales en Grupos de Empresas
-- ============================================================================
-- Ejecutar en Supabase SQL Editor para verificar por qué los servicios
-- profesionales de empresas asociadas no aparecen en /pago
-- ============================================================================

-- 1. Ver todos los grupos de empresas y sus miembros
SELECT 
  g.id as grupo_id,
  g.nombre as grupo_nombre,
  g.empresa_principal_id,
  ep.nombre as empresa_principal,
  m.empresa_id as miembro_id,
  em.nombre as empresa_miembro
FROM grupos_empresas g
LEFT JOIN empresas ep ON ep.id = g.empresa_principal_id
LEFT JOIN grupos_empresas_miembros m ON m.grupo_id = g.id
LEFT JOIN empresas em ON em.id = m.empresa_id
ORDER BY g.nombre, em.nombre;

-- 2. Buscar específicamente Matadero del Valle y Tenería Pirro
SELECT 'EMPRESAS' as tabla, id, nombre 
FROM empresas 
WHERE nombre ILIKE '%matadero%' OR nombre ILIKE '%teneria%' OR nombre ILIKE '%pirro%';

-- 3. Ver si hay un grupo donde Matadero del Valle es principal
SELECT 
  g.id,
  g.nombre,
  g.empresa_principal_id,
  ep.nombre as empresa_principal,
  array_agg(em.nombre) as empresas_miembros
FROM grupos_empresas g
JOIN empresas ep ON ep.id = g.empresa_principal_id
LEFT JOIN grupos_empresas_miembros m ON m.grupo_id = g.id
LEFT JOIN empresas em ON em.id = m.empresa_id
WHERE ep.nombre ILIKE '%matadero%'
GROUP BY g.id, g.nombre, g.empresa_principal_id, ep.nombre;

-- 4. Ver servicios profesionales de empresas con nombre que contenga "pirro" o "teneria"
SELECT 
  sp.id,
  sp.id_cliente,
  sp.fecha,
  sp.costo,
  sp.gastos,
  sp.iva,
  sp.total,
  sp.estado_pago,
  ls.titulo as servicio,
  f.nombre as funcionario,
  e.nombre as empresa_cliente
FROM servicios_profesionales sp
LEFT JOIN lista_servicios ls ON ls.id = sp.id_servicio
LEFT JOIN funcionarios f ON f.id = sp.id_responsable
LEFT JOIN empresas e ON e.id = sp.id_cliente
WHERE sp.id_cliente IN (
  SELECT id FROM empresas WHERE nombre ILIKE '%pirro%' OR nombre ILIKE '%teneria%'
)
AND sp.estado_pago != 'cancelado'
ORDER BY sp.fecha DESC
LIMIT 20;

-- 5. Verificar que Tenería Pirro esté en grupos_empresas_miembros
SELECT 
  'MIEMBROS' as verificacion,
  m.empresa_id,
  e.nombre as empresa_nombre,
  g.nombre as grupo_nombre,
  g.empresa_principal_id,
  ep.nombre as empresa_principal
FROM grupos_empresas_miembros m
JOIN empresas e ON e.id = m.empresa_id
JOIN grupos_empresas g ON g.id = m.grupo_id
JOIN empresas ep ON ep.id = g.empresa_principal_id
WHERE e.nombre ILIKE '%pirro%' OR e.nombre ILIKE '%teneria%';

-- 6. Ver servicios profesionales del mes actual/anterior para Tenería Pirro
-- (ajustar fechas según necesidad)
SELECT 
  sp.*,
  e.nombre as empresa_nombre
FROM servicios_profesionales sp
JOIN empresas e ON e.id = sp.id_cliente
WHERE e.nombre ILIKE '%pirro%' OR e.nombre ILIKE '%teneria%'
AND sp.fecha >= date_trunc('month', current_date - interval '1 month')
AND sp.fecha < date_trunc('month', current_date)
ORDER BY sp.fecha DESC;

-- 7. Resumen: Comparar id de Tenería Pirro en empresas vs id_cliente en servicios_profesionales
SELECT 
  e.id as empresa_id,
  e.nombre as empresa_nombre,
  count(sp.id) as total_servicios,
  sum(sp.total) as monto_total
FROM empresas e
LEFT JOIN servicios_profesionales sp ON sp.id_cliente = e.id AND sp.estado_pago != 'cancelado'
WHERE e.nombre ILIKE '%pirro%' OR e.nombre ILIKE '%teneria%'
GROUP BY e.id, e.nombre;
