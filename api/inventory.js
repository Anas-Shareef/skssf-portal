import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. Authenticate user
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

  // Determine sub-resource from query parameter or request body
  const resource = req.query.resource || req.body.resource;
  if (!resource) {
    return res.status(400).json({ error: 'Resource parameter required' });
  }

  try {
    // ==========================================
    // RESOURCE: CATEGORIES
    // ==========================================
    if (resource === 'categories') {
      if (req.method === 'GET') {
        const { data, error } = await supabase.from('inventory_categories').select('*').order('name');
        if (error) throw error;
        return res.status(200).json({ categories: data || [] });
      }

      // Mutation auth check
      if (profile.role !== 'admin' && profile.role !== 'super') {
        return res.status(403).json({ error: 'Forbidden - Admins only' });
      }

      if (req.method === 'POST') {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Category name required' });
        
        const { data, error } = await supabase
          .from('inventory_categories')
          .insert({ name, created_by: profile.id })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json({ category: data });
      }

      if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Category ID required' });

        if (profile.role !== 'super') {
          return res.status(403).json({ error: 'Super-admin only' });
        }

        // Check if any items are assigned
        const { count, error: countErr } = await supabase
          .from('inventory_items')
          .select('*', { count: 'exact', head: true })
          .eq('category_id', id);
        if (countErr) throw countErr;
        if (count > 0) return res.status(400).json({ error: 'Cannot delete category with assigned items' });

        const { error } = await supabase.from('inventory_categories').delete().eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
    }

    // ==========================================
    // RESOURCE: ITEMS
    // ==========================================
    if (resource === 'items') {
      if (req.method === 'GET') {
        const query = supabase.from('inventory_items').select('*, categories:category_id(name)');
        
        // Non-admins can only see active items
        if (profile.role !== 'admin' && profile.role !== 'super') {
          query.eq('is_active', true);
        }

        // Apply filters
        const { search, category_id, type } = req.query;
        if (search) query.ilike('name', `%${search}%`);
        if (category_id) query.eq('category_id', category_id);
        if (type) query.eq('item_type', type);

        const { data, error } = await query.order('name');
        if (error) throw error;
        return res.status(200).json({ items: data || [] });
      }

      // Mutation auth check
      if (profile.role !== 'admin' && profile.role !== 'super') {
        return res.status(403).json({ error: 'Forbidden - Admins only' });
      }

      if (req.method === 'POST') {
        const { name, category_id, item_type, total_stock, lease_duration_days, description, photo_url } = req.body;
        if (!name || !category_id || !item_type || total_stock === undefined) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        const { data, error } = await supabase
          .from('inventory_items')
          .insert({
            name,
            category_id,
            item_type,
            total_stock,
            available_stock: total_stock,
            lease_duration_days: item_type === 'lease' ? lease_duration_days : null,
            description,
            photo_url,
            is_active: true,
            created_by: profile.id
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(201).json({ item: data });
      }
    }

    // ==========================================
    // RESOURCE: ITEM ACTIONS
    // ==========================================
    if (resource === 'item-actions') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      // Mutation auth check
      if (profile.role !== 'admin' && profile.role !== 'super') {
        return res.status(403).json({ error: 'Forbidden - Admins only' });
      }

      const { action, id } = req.body;
      if (!action || !id) return res.status(400).json({ error: 'Action and ID required' });

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
    }

    // ==========================================
    // RESOURCE: CHECKOUTS
    // ==========================================
    if (resource === 'checkouts') {
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
    }

    // ==========================================
    // RESOURCE: CHECKOUT ACTIONS
    // ==========================================
    if (resource === 'checkout-actions') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { action, id } = req.body;
      if (!action || !id) return res.status(400).json({ error: 'Action and ID required' });

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
    }

    return res.status(400).json({ error: 'Invalid resource or request method' });
  } catch (err) {
    console.error('Inventory API consolidated error:', err);
    return res.status(500).json({ error: err.message });
  }
}
