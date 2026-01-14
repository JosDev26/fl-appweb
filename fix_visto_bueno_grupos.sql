-- ============================================================================
-- SCRIPT: Propagar visto bueno de empresas principales a sus grupos
-- ============================================================================
-- PROPÓSITO:
--   Cuando una empresa principal ya dio visto bueno, propagar ese visto bueno
--   a todas las empresas de su grupo que no lo tengan.
-- ============================================================================

-- 1. Ver el estado actual (diagnóstico)
SELECT 
  'DIAGNÓSTICO ACTUAL' as seccion,
  g.nombre as grupo,
  e.id as empresa_id,
  e.nombre as empresa,
  CASE WHEN g.empresa_principal_id = e.id THEN 'PRINCIPAL' ELSE 'MIEMBRO' END as rol,
  vb.mes,
  vb.dado as visto_bueno_dado,
  vb.fecha_visto_bueno
FROM grupos_empresas g
LEFT JOIN empresas e ON e.id = g.empresa_principal_id
LEFT JOIN visto_bueno_mensual vb ON vb.client_id = e.id AND vb.client_type = 'empresa'
WHERE g.nombre ILIKE '%pirro%'

UNION ALL

SELECT 
  'DIAGNÓSTICO ACTUAL' as seccion,
  g.nombre as grupo,
  e.id as empresa_id,
  e.nombre as empresa,
  'MIEMBRO' as rol,
  vb.mes,
  vb.dado as visto_bueno_dado,
  vb.fecha_visto_bueno
FROM grupos_empresas g
JOIN grupos_empresas_miembros m ON m.grupo_id = g.id
JOIN empresas e ON e.id = m.empresa_id
LEFT JOIN visto_bueno_mensual vb ON vb.client_id = e.id AND vb.client_type = 'empresa'
WHERE g.nombre ILIKE '%pirro%'
ORDER BY seccion, grupo, rol DESC, empresa;

-- 2. Propagar visto bueno de empresa principal a miembros del grupo
-- Para cada empresa principal que tiene visto bueno, copiar a las empresas miembro
INSERT INTO visto_bueno_mensual (client_id, client_type, mes, dado, fecha_visto_bueno, estado)
SELECT 
  m.empresa_id as client_id,
  'empresa' as client_type,
  vb.mes,
  vb.dado,
  vb.fecha_visto_bueno,
  COALESCE(vb.estado, 'aprobado') as estado
FROM grupos_empresas g
JOIN grupos_empresas_miembros m ON m.grupo_id = g.id
JOIN visto_bueno_mensual vb ON vb.client_id = g.empresa_principal_id AND vb.client_type = 'empresa'
WHERE vb.dado = true
  -- Solo insertar si no existe ya un registro para esa empresa/mes
  AND NOT EXISTS (
    SELECT 1 FROM visto_bueno_mensual vb2 
    WHERE vb2.client_id = m.empresa_id 
      AND vb2.client_type = 'empresa' 
      AND vb2.mes = vb.mes
  )
ON CONFLICT (client_id, client_type, mes) DO NOTHING;

-- 3. Verificar resultado
SELECT 
  'DESPUÉS DE CORRECCIÓN' as seccion,
  g.nombre as grupo,
  e.id as empresa_id,
  e.nombre as empresa,
  CASE WHEN g.empresa_principal_id = e.id THEN 'PRINCIPAL' ELSE 'MIEMBRO' END as rol,
  vb.mes,
  vb.dado as visto_bueno_dado,
  vb.fecha_visto_bueno
FROM grupos_empresas g
LEFT JOIN empresas e ON e.id = g.empresa_principal_id
LEFT JOIN visto_bueno_mensual vb ON vb.client_id = e.id AND vb.client_type = 'empresa'
WHERE g.nombre ILIKE '%pirro%'

UNION ALL

SELECT 
  'DESPUÉS DE CORRECCIÓN' as seccion,
  g.nombre as grupo,
  e.id as empresa_id,
  e.nombre as empresa,
  'MIEMBRO' as rol,
  vb.mes,
  vb.dado as visto_bueno_dado,
  vb.fecha_visto_bueno
FROM grupos_empresas g
JOIN grupos_empresas_miembros m ON m.grupo_id = g.id
JOIN empresas e ON e.id = m.empresa_id
LEFT JOIN visto_bueno_mensual vb ON vb.client_id = e.id AND vb.client_type = 'empresa'
WHERE g.nombre ILIKE '%pirro%'
ORDER BY seccion, grupo, rol DESC, empresa;

-- ============================================================================
-- NOTA: Este script propaga el visto bueno de TODAS las empresas principales
-- a TODAS las empresas de sus grupos para TODOS los meses donde aplique.
-- Es seguro ejecutarlo múltiples veces (usa ON CONFLICT DO NOTHING).
-- ============================================================================
