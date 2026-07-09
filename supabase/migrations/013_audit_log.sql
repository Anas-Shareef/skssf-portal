-- 1. Create inventory_audit_log table
CREATE TABLE IF NOT EXISTS inventory_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  payload     JSONB NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE inventory_audit_log ENABLE ROW LEVEL SECURITY;

-- 3. Only admins and supers can read the audit log
CREATE POLICY "inventory_audit_log_select" ON inventory_audit_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

-- 4. Only admins and supers can insert logs
CREATE POLICY "inventory_audit_log_insert" ON inventory_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

-- Note: No UPDATE or DELETE policies are created, making the log append-only/immutable.
