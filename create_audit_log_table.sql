-- ============================================
-- AUDIT LOG TABLE
-- For tracking business-critical actions
-- ============================================

-- Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('cliente', 'empresa', 'admin', 'system')),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  changes JSONB,
  metadata JSONB,
  ip_address TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_lookup 
ON audit_log(actor_id, action, created_at DESC);

-- Enable RLS
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (from API)
CREATE POLICY "Service role can insert audit logs"
ON audit_log FOR INSERT
TO service_role
WITH CHECK (true);

-- Service role can read all
CREATE POLICY "Service role can read audit logs"
ON audit_log FOR SELECT
TO service_role
USING (true);

-- Users can read their own audit logs
CREATE POLICY "Users can read own audit logs"
ON audit_log FOR SELECT
TO authenticated
USING (actor_id = auth.uid()::text);

-- Function to clean old audit entries (keep 1 year)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM audit_log
  WHERE created_at < NOW() - INTERVAL '365 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment for documentation
COMMENT ON TABLE audit_log IS 'Audit trail for business-critical actions. Kept for 1 year.';
