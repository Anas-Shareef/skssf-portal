-- 1. Create welfare_missions table
CREATE TABLE IF NOT EXISTS welfare_missions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL UNIQUE,
  emoji        TEXT DEFAULT '🤝',
  description  TEXT NULL,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ NULL
);

-- 2. Add mission_id foreign key column to inventory_checkouts
ALTER TABLE inventory_checkouts
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES welfare_missions(id) ON DELETE SET NULL;

-- 3. Enable RLS on welfare_missions
ALTER TABLE welfare_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "welfare_missions_select" ON welfare_missions
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "welfare_missions_all_admin" ON welfare_missions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

-- 4. Seed default welfare missions
INSERT INTO welfare_missions (name, emoji, description, status)
VALUES
  ('Ramadan Welfare 2025', '🌙', 'Welfare food packs and prayer mats distributed for the holy month.', 'active'),
  ('Student Support Drive 2025', '📚', 'Stationery kits and study sets allocated for Poyanad Branch students.', 'active'),
  ('Medical Relief Camp', '🚑', 'First Aid boxes and healthcare supplies allocated to medical teams.', 'active'),
  ('General Distribution', '🤝', 'Standard item distributions for local families and members.', 'active')
ON CONFLICT (name) DO NOTHING;
