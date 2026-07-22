-- ============================================================
-- 009: Physical Units Tracking Schema
-- ============================================================

-- 1. Create inventory_units table
CREATE TABLE IF NOT EXISTS inventory_units (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  unit_number         INTEGER NOT NULL,
  barcode_value       TEXT UNIQUE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'checked_out', 'damaged', 'lost')),
  current_checkout_id UUID NULL, -- circular reference resolved below
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id, unit_number)
);

-- 2. Add unit_id column to inventory_checkouts
ALTER TABLE inventory_checkouts
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES inventory_units(id) ON DELETE SET NULL;

-- 3. Add foreign key to inventory_units for current_checkout_id
ALTER TABLE inventory_units
  ADD CONSTRAINT fk_current_checkout
  FOREIGN KEY (current_checkout_id)
  REFERENCES inventory_checkouts(id)
  ON DELETE SET NULL;

-- 4. Enable Row Level Security
ALTER TABLE inventory_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_units_select" ON inventory_units;
CREATE POLICY "inventory_units_select" ON inventory_units
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "inventory_units_all_admin" ON inventory_units;
CREATE POLICY "inventory_units_all_admin" ON inventory_units
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role IN ('admin', 'super')
    )
  );

-- 5. Backfill products and generate physical units
DO $$
DECLARE
  item_rec RECORD;
  i INTEGER;
  cat_code TEXT;
  year_str TEXT;
  seq_str TEXT;
  seq_val INTEGER := 1;
  p_barcode TEXT;
BEGIN
  year_str := '2026';
  
  FOR item_rec IN 
    SELECT i.id, i.name, i.total_stock, c.name as cat_name, i.created_at
    FROM inventory_items i
    JOIN inventory_categories c ON c.id = i.category_id
    ORDER BY i.created_at ASC
  LOOP
    -- Generate custom category code
    cat_code := UPPER(REGEXP_REPLACE(item_rec.cat_name, '[^a-zA-Z]', '', 'g'));
    IF length(cat_code) < 3 THEN
      cat_code := RPAD(cat_code, 3, 'X');
    ELSE
      cat_code := LEFT(cat_code, 3);
    END IF;
    
    seq_str := LPAD(seq_val::TEXT, 3, '0');
    p_barcode := 'SKSSF-' || year_str || '-' || cat_code || '-' || seq_str;
    
    -- Update item barcode_value
    UPDATE inventory_items 
    SET barcode_value = p_barcode 
    WHERE id = item_rec.id;
    
    -- Create units
    FOR i IN 1..item_rec.total_stock LOOP
      IF NOT EXISTS (
        SELECT 1 FROM inventory_units 
        WHERE (item_id = item_rec.id AND unit_number = i) 
           OR barcode_value = p_barcode || '-U' || LPAD(i::TEXT, 2, '0')
      ) THEN
        INSERT INTO inventory_units (item_id, unit_number, barcode_value, status)
        VALUES (
          item_rec.id, 
          i, 
          p_barcode || '-U' || LPAD(i::TEXT, 2, '0'),
          'available'
        );
      END IF;
    END LOOP;
    
    seq_val := seq_val + 1;
  END LOOP;
END $$;

-- 6. Link existing active checkouts to units and mark units as checked out
DO $$
DECLARE
  chk_rec RECORD;
  u_rec RECORD;
BEGIN
  FOR chk_rec IN 
    SELECT c.id, c.item_id
    FROM inventory_checkouts c
    WHERE c.status = 'active' AND c.unit_id IS NULL
  LOOP
    SELECT id INTO u_rec
    FROM inventory_units
    WHERE item_id = chk_rec.item_id AND status = 'available'
    ORDER BY unit_number ASC
    LIMIT 1;
    
    IF u_rec IS NOT NULL THEN
      -- Link checkout to unit
      UPDATE inventory_checkouts SET unit_id = u_rec.id WHERE id = chk_rec.id;
      -- Mark unit as checked out
      UPDATE inventory_units SET status = 'checked_out', current_checkout_id = chk_rec.id WHERE id = u_rec.id;
    END IF;
  END LOOP;
END $$;
