-- Verificar si estos IDs existen en funcionarios
SELECT id, nombre FROM funcionarios WHERE id IN ('07b8bc11', '5b2704d5', '9643f3e5');

-- Si no existen, puedes agregarlos manualmente con nombres placeholder:
-- (DESCOMENTA Y EJECUTA SOLO SI NO EXISTEN)

-- INSERT INTO funcionarios (id, nombre) VALUES
-- ('07b8bc11', 'Funcionario 07b8bc11'),
-- ('5b2704d5', 'Funcionario 5b2704d5'),
-- ('9643f3e5', 'Funcionario 9643f3e5')
-- ON CONFLICT (id) DO NOTHING;

-- O mejor aún: sincroniza la hoja de Funcionarios en Google Sheets primero
-- para obtener los nombres reales desde allí
