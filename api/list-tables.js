import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { data, error } = await supabase.from('profiles').select('role').limit(1);
    
    // Let's run a query to check which tables exist
    // We can try to query a single row from the candidate tables. If it succeeds, the table exists! If it fails with 404 or table not found, it doesn't!
    const tables = [
      'products',
      'inventory_items',
      'inventory_categories',
      'inventory_checkouts',
      'inventory_stock_adjustments',
      'inventory_checkout_requests',
      'inventory_return_requests',
      'inventory_checkout_records'
    ];

    const results = {};
    for (const table of tables) {
      const { error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        results[table] = { exists: false, error: error.message };
      } else {
        results[table] = { exists: true };
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
