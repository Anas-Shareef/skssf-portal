import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

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

  try {
    if (req.method === 'GET') {
      const { mine, member_id, status, type } = req.query;

      // Member checking their own items
      if (mine === 'true') {
        const { data, error } = await supabase
          .from('inventory_checkouts')
          .select('*, items:item_id(*)')
          .eq('member_id', profile.id)
          .order('due_return_date', { ascending: true, nullsFirst: false });
        if (error) throw error;
        return res.status(200).json({ checkouts: data || [] });
      }

      // Admin checks all
      if (profile.role !== 'admin' && profile.role !== 'super') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const query = supabase
        .from('inventory_checkouts')
        .select('*, member:member_id(name), items:item_id(*)');

      if (member_id) query.eq('member_id', member_id);
      if (status) query.eq('status', status);
      if (type) query.eq('item_type_at_checkout', type);

      const { data, error } = await query.order('due_return_date', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return res.status(200).json({ checkouts: data || [] });
    }

    if (req.method === 'POST') {
      const { item_id, quantity, notes } = req.body;
      if (!item_id || !quantity) return res.status(400).json({ error: 'Item ID and quantity required' });

      // Fetch item
      const { data: item, error: fetchErr } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', item_id)
        .single();

      if (fetchErr || !item) throw fetchErr || new Error('Item not found');
      if (item.available_stock < quantity) {
        return res.status(400).json({ error: 'Item no longer in stock.' });
      }

      const checkoutDateStr = new Date().toISOString().split('T')[0];
      let dueReturnDateStr = null;
      if (item.item_type === 'lease') {
        const due = new Date();
        due.setDate(due.getDate() + (item.lease_duration_days || 30));
        dueReturnDateStr = due.toISOString().split('T')[0];
      }

      // Conditional stock decrement
      const { data: updatedItem, error: updateErr } = await supabase
        .from('inventory_items')
        .update({
          available_stock: item.available_stock - quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', item_id)
        .gte('available_stock', quantity)
        .select()
        .maybeSingle();

      if (updateErr || !updatedItem) {
        return res.status(400).json({ error: 'Item no longer in stock.' });
      }

      // Insert record
      const { data: checkout, error: insertErr } = await supabase
        .from('inventory_checkouts')
        .insert({
          member_id: profile.id,
          item_id,
          quantity,
          item_type_at_checkout: item.item_type,
          checkout_date: checkoutDateStr,
          due_return_date: dueReturnDateStr,
          status: 'active',
          notes
        })
        .select()
        .single();

      if (insertErr) {
        // Rollback
        await supabase
          .from('inventory_items')
          .update({ available_stock: updatedItem.available_stock + quantity })
          .eq('id', item_id);
        throw insertErr;
      }

      return res.status(201).json({ checkout });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Inventory checkouts error:', err);
    return res.status(500).json({ error: err.message });
  }
}
