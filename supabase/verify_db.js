import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

globalThis.WebSocket = class {};

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabase = createClient(
  env.SUPABASE_URL || '',
  env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function run() {
  console.log('==================================================');
  console.log('   SKSSF DB SCHEMA VERIFICATION TOOL');
  console.log('==================================================');

  try {
    // 1. Check inventory_items columns
    console.log('1. Checking inventory_items schema...');
    const { error: itemErr } = await supabase
      .from('inventory_items')
      .select('id, name, item_type, available_stock, total_stock, photo_url, barcode_value, public_visible, public_description')
      .limit(0);

    if (itemErr) {
      if (itemErr.message.includes('column') || itemErr.code === '42703') {
        console.log('❌ Missing columns in inventory_items. Please run 008_barcode_and_catalog.sql migration.');
        // Try basic select to confirm table accessibility
        const { error: basicErr } = await supabase.from('inventory_items').select('id, name').limit(0);
        if (basicErr) {
          console.log('❌ Table inventory_items is NOT accessible:', basicErr.message);
        } else {
          console.log('✅ Table inventory_items is accessible, but missing barcode/public columns.');
        }
      } else {
        console.log('❌ Error inventory_items:', itemErr.message);
      }
    } else {
      console.log('✅ inventory_items table is accessible and all columns (barcode_value, public_visible, public_description) are present!');
    }

    // 2. Check inventory_units table
    console.log('\n2. Checking inventory_units schema...');
    const { data: unitData, error: unitErr } = await supabase
      .from('inventory_units')
      .select('*')
      .limit(1);

    if (unitErr) {
      if (unitErr.code === 'PGRST205') {
        console.log('❌ Table public.inventory_units does NOT exist in schema cache. Please run 009_physical_units.sql.');
      } else {
        console.log('❌ Error inventory_units:', unitErr.message);
      }
    } else {
      const sample = unitData[0] || {};
      console.log('✅ inventory_units table is accessible!');
      console.log('   Available columns:', Object.keys(sample).join(', '));
    }

    // 3. Check inventory_checkouts unit_id column
    console.log('\n3. Checking inventory_checkouts unit_id column...');
    const { error: chkErr } = await supabase
      .from('inventory_checkouts')
      .select('id, unit_id')
      .limit(0);

    if (chkErr) {
      if (chkErr.message.includes('column') || chkErr.code === '42703') {
        console.log('⚠️ unit_id column is missing in inventory_checkouts. Please run 009_physical_units.sql.');
      } else {
        console.log('❌ Error inventory_checkouts:', chkErr.message);
      }
    } else {
      console.log('✅ unit_id column is present in inventory_checkouts!');
    }

    // 4. Check org_settings table
    console.log('\n4. Checking org_settings schema...');
    const { data: setRecs, error: setErr } = await supabase
      .from('org_settings')
      .select('*')
      .limit(5);

    if (setErr) {
      if (setErr.code === 'PGRST205') {
        console.log('❌ Table public.org_settings does NOT exist in schema cache. Please run 008_barcode_and_catalog.sql.');
      } else {
        console.log('❌ Error org_settings:', setErr.message);
      }
    } else {
      console.log('✅ org_settings table is accessible!');
      console.log('   Settings entries:', setRecs);
    }

    // 5. Check inventory_reviews table
    console.log('\n5. Checking inventory_reviews schema...');
    const { data: revRecs, error: revErr } = await supabase
      .from('inventory_reviews')
      .select('*')
      .limit(1);

    if (revErr) {
      if (revErr.code === 'PGRST205') {
        console.log('❌ Table public.inventory_reviews does NOT exist in schema cache. Please run 010_inventory_reviews.sql.');
      } else {
        console.log('❌ Error inventory_reviews:', revErr.message);
      }
    } else {
      console.log('✅ inventory_reviews table is accessible!');
    }

    console.log('==================================================');
  } catch (err) {
    console.error('Fatal verification failure:', err);
  }
}

run();
