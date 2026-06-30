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

  const { action, id } = req.body;
  if (!action || !id) return res.status(400).json({ error: 'Action and ID required' });

  try {
    const { data: checkout, error: fetchErr } = await supabase
      .from('inventory_checkouts')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !checkout) throw fetchErr || new Error('Checkout record not found');
    if (checkout.status !== 'active' && checkout.status !== 'overdue') {
      return res.status(400).json({ error: 'Checkout record is not active' });
    }

    // 1. SELF CHECK-IN
    if (action === 'checkin') {
      // Safety: non-admins can only check in their own checkouts
      if (profile.role !== 'admin' && profile.role !== 'super' && checkout.member_id !== profile.id) {
        return res.status(403).json({ error: 'Unauthorized to check in this item' });
      }

      const { return_condition, condition_notes } = req.body;
      if (!return_condition) return res.status(400).json({ error: 'Return condition required' });

      const conditionFlag = return_condition === 'damaged' || return_condition === 'lost';

      const { error: updateCheckoutErr } = await supabase
        .from('inventory_checkouts')
        .update({
          status: 'returned',
          actual_return_date: new Date().toISOString().split('T')[0],
          return_condition,
          condition_flag: conditionFlag,
          condition_notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateCheckoutErr) throw updateCheckoutErr;

      // Add back to available stock only if good
      if (return_condition === 'good') {
        const { data: item } = await supabase.from('inventory_items').select('available_stock').eq('id', checkout.item_id).single();
        if (item) {
          await supabase
            .from('inventory_items')
            .update({ available_stock: item.available_stock + checkout.quantity })
            .eq('id', checkout.item_id);
        }
      }

      return res.status(200).json({ success: true });
    }

    // 2. ADMIN MANUAL OVERRIDE (MARK-RETURNED)
    if (action === 'mark-returned') {
      if (profile.role !== 'admin' && profile.role !== 'super') {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const { return_condition, return_date } = req.body;
      const condition = return_condition || 'good';
      const rDate = return_date || new Date().toISOString().split('T')[0];

      const conditionFlag = condition === 'damaged' || condition === 'lost';

      const { error: updateCheckoutErr } = await supabase
        .from('inventory_checkouts')
        .update({
          status: 'returned',
          actual_return_date: rDate,
          return_condition: condition,
          condition_flag: conditionFlag,
          manually_returned_by: profile.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (updateCheckoutErr) throw updateCheckoutErr;

      if (condition === 'good') {
        const { data: item } = await supabase.from('inventory_items').select('available_stock').eq('id', checkout.item_id).single();
        if (item) {
          await supabase
            .from('inventory_items')
            .update({ available_stock: item.available_stock + checkout.quantity })
            .eq('id', checkout.item_id);
        }
      }

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Inventory checkout actions error:', err);
    return res.status(500).json({ error: err.message });
  }
}
