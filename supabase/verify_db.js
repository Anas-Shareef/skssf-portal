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
    const { data: itemData, error: itemErr } = await supabase
      .from('inventory_items')
      .select('*')
      .limit(1);

    if (itemErr) {
      console.log('❌ Error inventory_items:', itemErr.message);
    } else {
      const sample = itemData[0] || {};
      const cols = Object.keys(sample);
      console.log('✅ inventory_items table is accessible!');
      console.log('   Available columns:', cols.join(', '));
      const expected = ['barcode_value', 'public_visible', 'public_description'];
      const missing = expected.filter(c => !cols.includes(c));
      if (missing.length > 0) {
        console.log(`   ⚠️ Missing columns: ${missing.join(', ')}. Please run 008_barcode_and_catalog.sql migration.`);
      } else {
        console.log('   🎉 All catalog columns are present!');
      }
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
    const { data: chkData, error: chkErr } = await supabase
      .from('inventory_checkouts')
      .select('*')
      .limit(1);

    if (chkErr) {
      console.log('❌ Error inventory_checkouts:', chkErr.message);
    } else {
      const sample = chkData[0] || {};
      const cols = Object.keys(sample);
      if (cols.includes('unit_id')) {
        console.log('✅ unit_id column is present in inventory_checkouts!');
      } else {
        console.log('⚠️ unit_id column is missing in inventory_checkouts. Please run 009_physical_units.sql.');
      }
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

    console.log('==================================================');
  } catch (err) {
    console.error('Fatal verification failure:', err);
  }
}

run();
