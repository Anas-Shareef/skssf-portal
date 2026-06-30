-- Drop old tables if they exist
DROP TABLE IF EXISTS inventory_checkout_requests CASCADE;
DROP TABLE IF EXISTS inventory_return_requests CASCADE;
DROP TABLE IF EXISTS inventory_checkout_records CASCADE;
DROP TABLE IF EXISTS inventory_stock_adjustments CASCADE;
DROP TABLE IF EXISTS inventory_checkouts CASCADE;
DROP TABLE IF EXISTS inventory_items CASCADE;
DROP TABLE IF EXISTS inventory_categories CASCADE;

-- 1. Create inventory_categories
CREATE TABLE inventory_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create inventory_items
CREATE TABLE inventory_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  category_id         UUID REFERENCES inventory_categories(id) ON DELETE RESTRICT,
  item_type           TEXT NOT NULL CHECK (item_type IN ('lease', 'permanent')),
  total_stock         INTEGER NOT NULL CHECK (total_stock >= 0),
  available_stock     INTEGER NOT NULL CHECK (available_stock >= 0),
  lease_duration_days INTEGER NULL CHECK (lease_duration_days > 0),
  description         TEXT NULL,
  photo_url           TEXT NULL,
  is_active           BOOLEAN DEFAULT TRUE,
  created_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, name)
);

-- 3. Create inventory_checkouts
CREATE TABLE inventory_checkouts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id               UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity              INTEGER NOT NULL CHECK (quantity > 0),
  item_type_at_checkout TEXT NOT NULL CHECK (item_type_at_checkout IN ('lease', 'permanent')),
  checkout_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  due_return_date       DATE NULL,
  actual_return_date    DATE NULL,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned', 'overdue')),
  return_condition      TEXT NULL CHECK (return_condition IN ('good', 'damaged', 'lost')),
  condition_flag        BOOLEAN DEFAULT FALSE,
  condition_notes       TEXT NULL,
  notes                 TEXT NULL,
  manually_returned_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create inventory_stock_adjustments
CREATE TABLE inventory_stock_adjustments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             UUID REFERENCES inventory_items(id) ON DELETE CASCADE,
  adjusted_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  old_available_stock INTEGER NOT NULL,
  new_available_stock INTEGER NOT NULL,
  reason              TEXT NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Apply RLS Policies from Section 8
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS for inventory_items
CREATE POLICY "inventory_items_select" ON inventory_items
  FOR SELECT TO authenticated
  USING (
    is_active = TRUE OR 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

CREATE POLICY "inventory_items_insert" ON inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

CREATE POLICY "inventory_items_update" ON inventory_items
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

CREATE POLICY "inventory_items_delete" ON inventory_items
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'super'
    )
  );

-- RLS for inventory_categories
CREATE POLICY "inventory_categories_select" ON inventory_categories
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "inventory_categories_insert" ON inventory_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

CREATE POLICY "inventory_categories_update" ON inventory_categories
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

CREATE POLICY "inventory_categories_delete" ON inventory_categories
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'super'
    )
  );

-- RLS for inventory_checkouts
CREATE POLICY "inventory_checkouts_select" ON inventory_checkouts
  FOR SELECT TO authenticated
  USING (
    member_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

CREATE POLICY "inventory_checkouts_insert" ON inventory_checkouts
  FOR INSERT TO authenticated
  WITH CHECK (
    member_id = auth.uid()
  );

CREATE POLICY "inventory_checkouts_update" ON inventory_checkouts
  FOR UPDATE TO authenticated
  USING (
    (member_id = auth.uid() AND status = 'active') OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

-- RLS for inventory_stock_adjustments
CREATE POLICY "inventory_stock_adjustments_select" ON inventory_stock_adjustments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

CREATE POLICY "inventory_stock_adjustments_insert" ON inventory_stock_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );
