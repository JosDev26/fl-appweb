    -- Ver la estructura del constraint
SELECT
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'gastos' 
    AND tc.constraint_name = 'fk_responsable';

-- Ver los IDs de funcionarios actuales
SELECT id, nombre FROM funcionarios ORDER BY id;

-- Ver IDs de responsable únicos en Google Sheets que pueden estar causando problemas
-- (Este es el problema: los IDs de Sheets que no están en funcionarios aún)
SELECT DISTINCT id_responsable 
FROM gastos 
WHERE id_responsable IS NOT NULL
ORDER BY id_responsable;
