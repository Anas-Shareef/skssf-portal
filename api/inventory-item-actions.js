import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthenticated' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Unauthenticated' });

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profErr || !profile) return res.status(401).json({ error: 'Profile not found' });

  // Admin/Super-Admin check for mutations
  if (profile.role !== 'admin' && profile.role !== 'super') {
    return res.status(403).json({ error: 'Forbidden - Admins only' });
  }

  const { action, id } = req.body;
  if (!action || !id) return res.status(400).json({ error: 'Action and ID required' });

  try {
    // 1. EDIT
    if (action === 'edit') {
      const { name, category_id, lease_duration_days, description, photo_url } = req.body;
      const { error } = await supabase
        .from('inventory_items')
        .update({
          name,
          category_id,
          lease_duration_days,
          description,
          photo_url,
          updated_by: profile.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    // 2. DEACTIVATE
    if (action === 'deactivate') {
      const { error } = await supabase
        .from('inventory_items')
        .update({ is_active: false, updated_by: profile.id, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    // 3. ADJUST STOCK
    if (action === 'adjust-stock') {
      const { new_available_stock, reason } = req.body;
      if (new_available_stock === undefined || !reason) {
        return res.status(400).json({ error: 'New available stock and reason required' });
      }

      // Fetch current item to get old stock
      const { data: item, error: fetchErr } = await supabase
        .from('inventory_items')
        .select('available_stock')
        .eq('id', id)
        .single();
      if (fetchErr || !item) throw fetchErr || new Error('Item not found');

      // Insert stock adjustment log
      const { error: logErr } = await supabase
        .from('inventory_stock_adjustments')
        .insert({
          item_id: id,
          adjusted_by: profile.id,
          old_available_stock: item.available_stock,
          new_available_stock,
          reason
        });
      if (logErr) throw logErr;

      // Update available stock
      const { error: updateErr } = await supabase
        .from('inventory_items')
        .update({ available_stock: new_available_stock, updated_by: profile.id, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (updateErr) throw updateErr;

      return res.status(200).json({ success: true });
    }

    // 4. DELETE (Super-admin only)
    if (action === 'delete') {
      if (profile.role !== 'super') return res.status(403).json({ error: 'Super-admin only' });

      // Check active checkouts
      const { count, error: countErr } = await supabase
        .from('inventory_checkouts')
        .select('*', { count: 'exact', head: true })
        .eq('item_id', id)
        .eq('status', 'active');
      if (countErr) throw countErr;
      if (count > 0) return res.status(400).json({ error: 'Cannot delete item with active checkouts' });

      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Inventory item actions error:', err);
    return res.status(500).json({ error: err.message });
  }
}
