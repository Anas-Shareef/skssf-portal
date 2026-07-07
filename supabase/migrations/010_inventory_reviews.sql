-- Create inventory_reviews table
CREATE TABLE IF NOT EXISTS inventory_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  member_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, member_id)
);

-- Enable RLS
ALTER TABLE inventory_reviews ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to select reviews
CREATE POLICY "inventory_reviews_select" ON inventory_reviews
  FOR SELECT TO authenticated USING (TRUE);

-- Allow authenticated users to insert/update their own reviews
CREATE POLICY "inventory_reviews_insert" ON inventory_reviews
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "inventory_reviews_update" ON inventory_reviews
  FOR UPDATE TO authenticated
  USING (auth.uid() = member_id);
