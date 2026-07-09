-- 1. Alter actual_return_date to TIMESTAMPTZ to preserve precise check-in timestamps
ALTER TABLE inventory_checkouts
  ALTER COLUMN actual_return_date TYPE TIMESTAMPTZ
  USING actual_return_date::TIMESTAMPTZ;

-- 2. Drop the restrictive insert RLS policy and create a version that allows admins/supers to create checkouts for other members
DROP POLICY IF EXISTS "inventory_checkouts_insert" ON inventory_checkouts;

CREATE POLICY "inventory_checkouts_insert" ON inventory_checkouts
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );
