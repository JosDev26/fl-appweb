-- ============================================================================
-- Tabla de tracking para notificaciones de expedientes inactivos
--
-- Propósito: registrar cuándo se envió una notificación de inactividad por
-- expediente, para evitar notificaciones duplicadas (spam recurrente).
--
-- Ejecutar manualmente en Supabase SQL Editor (patrón del proyecto).
-- Idempotente: usa IF NOT EXISTS para no destruir datos si se re-ejecuta.
-- ============================================================================

-- 1. Crear la tabla (si no existe)
CREATE TABLE IF NOT EXISTS notificaciones_inactividad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id text NOT NULL,                       -- FK -> solicitudes.id
  tipo text NOT NULL DEFAULT 'inactividad_15d',      -- tipo de notificación
  dias_inactivo_notificado integer NOT NULL,         -- días inactivo al momento del envío
  correo_destino text NOT NULL,                      -- a quién se envió
  enviado_at timestamptz NOT NULL DEFAULT now(),
  resend_id text,                                    -- ID retornado por Resend (auditoría)
  dry_run boolean NOT NULL DEFAULT false,            -- true si fue un envío de prueba (EMAIL_DRY_RUN)
  metadata jsonb,                                    -- info adicional (asunto, errores, etc.)
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Una sola notificación por (expediente, tipo) -> imposible notificar 2 veces
  CONSTRAINT notificaciones_inactividad_expediente_tipo_key UNIQUE (expediente_id, tipo),

  -- FK a solicitudes (ON DELETE CASCADE: si se borra el expediente, se borra el tracking)
  CONSTRAINT fk_notificaciones_inactividad_solicitud
    FOREIGN KEY (expediente_id) REFERENCES solicitudes(id) ON DELETE CASCADE
);

-- 2. Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_notificaciones_inactividad_expediente
  ON notificaciones_inactividad(expediente_id);

CREATE INDEX IF NOT EXISTS idx_notificaciones_inactividad_tipo
  ON notificaciones_inactividad(tipo);

CREATE INDEX IF NOT EXISTS idx_notificaciones_inactividad_enviado_at
  ON notificaciones_inactividad(enviado_at DESC);

-- 3. Comentarios explicativos
COMMENT ON TABLE notificaciones_inactividad IS 'Tracking de notificaciones de inactividad enviadas por expediente. Evita spam recurrente.';
COMMENT ON COLUMN notificaciones_inactividad.expediente_id IS 'ID del expediente (solicitudes.id) notificado';
COMMENT ON COLUMN notificaciones_inactividad.tipo IS 'Tipo de notificación (default: inactividad_15d). Permite futuros umbrales (30d, 60d, etc.)';
COMMENT ON COLUMN notificaciones_inactividad.dias_inactivo_notificado IS 'Días de inactividad calculados al momento del envío';
COMMENT ON COLUMN notificaciones_inactividad.correo_destino IS 'Correo al que se envió la notificación';
COMMENT ON COLUMN notificaciones_inactividad.enviado_at IS 'Timestamp exacto del envío';
COMMENT ON COLUMN notificaciones_inactividad.resend_id IS 'ID retornado por Resend para trazabilidad';
COMMENT ON COLUMN notificaciones_inactividad.dry_run IS 'true si el envío fue en modo EMAIL_DRY_RUN (no se envió realmente)';
COMMENT ON COLUMN notificaciones_inactividad.metadata IS 'JSON con metadata adicional (asunto, errores, etc.)';

-- 4. Habilitar RLS (la ruta usa service-role key, que la omite, pero buena práctica)
ALTER TABLE notificaciones_inactividad ENABLE ROW LEVEL SECURITY;

-- Por defecto, bloquear todo acceso anónimo. Las rutas del backend usan
-- SUPABASE_SERVICE_ROLE_KEY que omite RLS.
CREATE POLICY "notificaciones_inactividad_no_public_access"
  ON notificaciones_inactividad
  FOR ALL
  USING (false)
  WITH CHECK (false);
