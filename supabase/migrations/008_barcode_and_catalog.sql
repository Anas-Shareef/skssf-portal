-- ============================================================
-- 008: Barcode auto-generation + Public Catalog + Org Settings
-- ============================================================

-- 1. Add barcode_value column to inventory_items (immutable once set)
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS barcode_value       TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS public_visible      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS public_description  TEXT NULL;

-- 2. org_settings table for admin-configurable values (e.g. catalog_whatsapp)
CREATE TABLE IF NOT EXISTS org_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow admins to read/write org_settings
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_settings_select" ON org_settings
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "org_settings_update" ON org_settings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','super'))
  );

-- 3. Seed the catalog_whatsapp key (safe to run multiple times)
INSERT INTO org_settings (key, value)
  VALUES ('catalog_whatsapp', '')
  ON CONFLICT (key) DO NOTHING;

-- 4. Backfill barcode_value for existing items that don't have one yet.
--    Format: SKSSF-{CATCODE}-{6-digit rownum}
--    This uses ROW_NUMBER() over creation order.
WITH ranked AS (
  SELECT
    i.id,
    UPPER(LEFT(REGEXP_REPLACE(c.name, '\s+', '', 'g'), 4)) AS cat_code,
    ROW_NUMBER() OVER (ORDER BY i.created_at ASC) AS rn
  FROM inventory_items i
  JOIN inventory_categories c ON c.id = i.category_id
  WHERE i.barcode_value IS NULL
)
UPDATE inventory_items
SET barcode_value = 'SKSSF-' || ranked.cat_code || '-' || LPAD(ranked.rn::TEXT, 6, '0')
FROM ranked
WHERE inventory_items.id = ranked.id;
