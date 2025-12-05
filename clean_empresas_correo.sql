-- Script para limpiar la columna 'correo' en la tabla empresas
-- Los correos internos (@clientes.interno) solo deben existir en Supabase Auth

-- 1. Verificar cuántas empresas tienen correo interno
SELECT COUNT(*) as empresas_con_correo_interno 
FROM empresas 
WHERE correo LIKE '%@clientes.interno';

-- 2. Ver los correos que se van a limpiar
SELECT id, nombre, cedula, correo 
FROM empresas 
WHERE correo LIKE '%@clientes.interno'
LIMIT 20;

-- 3. Limpiar los correos internos (poner NULL)
UPDATE empresas 
SET correo = NULL 
WHERE correo LIKE '%@clientes.interno';

-- 4. Verificar que se limpiaron
SELECT COUNT(*) as empresas_con_correo_interno_despues 
FROM empresas 
WHERE correo LIKE '%@clientes.interno';

-- Nota: La columna 'correo' en empresas ahora puede usarse para 
-- guardar el correo REAL de contacto de la empresa si lo necesitas
-- Por ahora quedará NULL
