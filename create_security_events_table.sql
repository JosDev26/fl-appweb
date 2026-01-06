-- ============================================
-- SECURITY EVENTS TABLE
-- For storing security audit logs
-- ============================================

-- Create security_events table
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  user_id TEXT,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON security_events(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip_address);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_security_events_lookup 
ON security_events(event_type, severity, created_at DESC);

-- Enable RLS
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (from API)
CREATE POLICY "Service role can insert security events"
ON security_events FOR INSERT
TO service_role
WITH CHECK (true);

-- Only service role can read (admin dashboard)
CREATE POLICY "Service role can read security events"
ON security_events FOR SELECT
TO service_role
USING (true);

-- Create view for recent critical events (for alerts)
CREATE OR REPLACE VIEW critical_security_events AS
SELECT *
FROM security_events
WHERE severity IN ('high', 'critical')
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Function to clean old events (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_security_events()
RETURNS void AS $$
BEGIN
  DELETE FROM security_events
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment for documentation
COMMENT ON TABLE security_events IS 'Audit log for security-related events. Automatically cleaned after 90 days.';
