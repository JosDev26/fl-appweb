-- Agregar columna tarifa_hora a la tabla empresas
-- Esta columna almacenará la tarifa por hora desde Google Sheets columna I "TarifaxHora"

ALTER TABLE empresas 
ADD COLUMN tarifa_hora numeric(15,2);

-- Crear índice para mejorar consultas por tarifa
CREATE INDEX idx_empresas_tarifa_hora ON empresas(tarifa_hora);

-- Comentario explicativo
COMMENT ON COLUMN empresas.tarifa_hora IS 'Tarifa por hora de la empresa (sincronizada desde columna I de Sheets)';
