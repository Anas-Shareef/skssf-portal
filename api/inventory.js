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

  const resourceCheck = req.query.resource || req.body?.resource;

  // ============================================================
  // PUBLIC RESOURCE: PUBLIC-CATALOG (NO AUTH)
  // ============================================================
  if (resourceCheck === 'public-catalog') {
    try {
      const { search, category_id, id } = req.query;

      // 1. Single Item Detail Request
      if (id) {
        const { data: item, error: itemErr } = await supabase
          .from('inventory_items')
          .select('id, name, item_type, available_stock, total_stock, photo_url, public_description, barcode_value, categories:category_id(id, name)')
          .eq('id', id)
          .eq('is_active', true)
          .eq('public_visible', true)
          .single();

        if (itemErr || !item) return res.status(404).json({ error: 'Item not found' });

        // Query physical units (fallback to empty array if table not created yet)
        const { data: units, error: unitsErr } = await supabase
          .from('inventory_units')
          .select('id, unit_number, barcode_value, status')
          .eq('item_id', id)
          .order('unit_number');

        return res.status(200).json({ item, units: units || [] });
      }

      // 2. List items request
      let query = supabase
        .from('inventory_items')
        .select('id, name, item_type, available_stock, total_stock, photo_url, public_description, barcode_value, categories:category_id(id, name)')
        .eq('is_active', true)
        .eq('public_visible', true)
        .order('name');

      if (search) query = query.ilike('name', `%${search}%`);
      if (category_id) query = query.eq('category_id', category_id);

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ items: data || [] });
    } catch (err) {
      console.error('Public catalog error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ============================================================
  // PUBLIC RESOURCE: ORG-SETTINGS GET (NO AUTH)
  // ============================================================
  if (resourceCheck === 'org-settings' && req.method === 'GET') {
    try {
      const { data, error } = await supabase.from('org_settings').select('*');
      if (error) {
        if (error.code === 'PGRST205') {
          return res.status(200).json({ settings: { catalog_whatsapp: '' } });
        }
        return res.status(500).json({ error: error.message });
      }
      const settings = {};
      (data || []).forEach(row => { settings[row.key] = row.value; });
      return res.status(200).json({ settings });
    } catch (err) {
      console.error('Public settings GET error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ==========================================
  // AUTH MIDDLEWARE (all other resources)
  // ==========================================
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

        const { data: items, error } = await query.order('name');
        if (error) throw error;

        // Fetch physical units count/status for admins
        const itemsWithUnits = [];
        for (const item of (items || [])) {
          const { data: units } = await supabase
            .from('inventory_units')
            .select('id, unit_number, barcode_value, status')
            .eq('item_id', item.id)
            .order('unit_number');
          itemsWithUnits.push({ ...item, units: units || [] });
        }

        return res.status(200).json({ items: itemsWithUnits });
      }

      // Mutation auth check
      if (profile.role !== 'admin' && profile.role !== 'super') {
        return res.status(403).json({ error: 'Forbidden - Admins only' });
      }

      if (req.method === 'POST') {
        const { name, category_id, item_type, total_stock, lease_duration_days, description, photo_url, public_visible, public_description } = req.body;
        if (!name || !category_id || !item_type || total_stock === undefined) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }

        // 1. Fetch category name to generate dynamic SKU
        const { data: catData } = await supabase
          .from('inventory_categories')
          .select('name')
          .eq('id', category_id)
          .single();
        
        let catCode = 'GEN';
        if (catData) {
          const rawCode = catData.name.toUpperCase().replace(/[^A-Z]/g, '');
          catCode = rawCode.slice(0, 3) || 'GEN';
        }
        
        const { count: itemCount } = await supabase
          .from('inventory_items')
          .select('*', { count: 'exact', head: true });
        
        const currentYear = new Date().getFullYear();
        const seq = String((itemCount || 0) + 1).padStart(3, '0');
        const barcodeValue = `SKSSF-${currentYear}-${catCode}-${seq}`;

        // 2. Insert item details
        const { data: item, error: itemErr } = await supabase
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
            public_visible: public_visible || false,
            public_description: public_description || null,
            barcode_value: barcodeValue,
            is_active: true,
            created_by: profile.id
          })
          .select()
          .single();

        if (itemErr) throw itemErr;

        // 3. Generate physical units in inventory_units table
        const unitsToInsert = [];
        for (let i = 1; i <= total_stock; i++) {
          unitsToInsert.push({
            item_id: item.id,
            unit_number: i,
            barcode_value: `${barcodeValue}-U${String(i).padStart(2, '0')}`,
            status: 'available'
          });
        }
        if (unitsToInsert.length > 0) {
          await supabase.from('inventory_units').insert(unitsToInsert);
        }

        return res.status(201).json({ item });
      }
    }

    // ==========================================
    // RESOURCE: ITEM ACTIONS
    // ==========================================
    if (resource === 'item-actions') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      if (profile.role !== 'admin' && profile.role !== 'super') {
        return res.status(403).json({ error: 'Forbidden - Admins only' });
      }

      const { action, id } = req.body;
      if (!action || !id) return res.status(400).json({ error: 'Action and ID required' });

      // 1. EDIT
      if (action === 'edit') {
        const { name, category_id, lease_duration_days, description, photo_url, public_visible, public_description, total_stock } = req.body;
        
        // Fetch current item details first
        const { data: currentItem, error: fetchErr } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('id', id)
          .single();

        if (fetchErr || !currentItem) throw fetchErr || new Error('Item not found');

        // Update the item main record
        const { error: editErr } = await supabase
          .from('inventory_items')
          .update({
            name,
            category_id,
            total_stock: total_stock !== undefined ? total_stock : currentItem.total_stock,
            lease_duration_days: currentItem.item_type === 'lease' ? lease_duration_days : null,
            description,
            photo_url,
            public_visible: public_visible !== undefined ? public_visible : false,
            public_description: public_description || null,
            updated_by: profile.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (editErr) throw editErr;

        // If total_stock changes, sync the physical units
        if (total_stock !== undefined && total_stock !== currentItem.total_stock) {
          const diffStock = total_stock - currentItem.available_stock; // adjust available stock
          
          if (total_stock > currentItem.total_stock) {
            // Add units
            const newUnits = [];
            for (let i = currentItem.total_stock + 1; i <= total_stock; i++) {
              newUnits.push({
                item_id: id,
                unit_number: i,
                barcode_value: `${currentItem.barcode_value}-U${String(i).padStart(2, '0')}`,
                status: 'available'
              });
            }
            await supabase.from('inventory_units').insert(newUnits);
            
            // Adjust available_stock proportionally
            const addedCount = total_stock - currentItem.total_stock;
            await supabase
              .from('inventory_items')
              .update({ available_stock: currentItem.available_stock + addedCount })
              .eq('id', id);
          } else {
            // Decrease units (only delete available ones starting from highest unit_number)
            const reduceCount = currentItem.total_stock - total_stock;
            const { data: unitsToDelete } = await supabase
              .from('inventory_units')
              .select('id')
              .eq('item_id', id)
              .eq('status', 'available')
              .order('unit_number', { ascending: false })
              .limit(reduceCount);

            if (unitsToDelete && unitsToDelete.length > 0) {
              const ids = unitsToDelete.map(u => u.id);
              await supabase.from('inventory_units').delete().in('id', ids);
              
              // Decrement available_stock accordingly
              await supabase
                .from('inventory_items')
                .update({ available_stock: Math.max(0, currentItem.available_stock - unitsToDelete.length) })
                .eq('id', id);
            }
          }
        }

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
            .select('*, items:item_id(*), unit:unit_id(barcode_value)')
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
          .select('*, member:member_id(name), items:item_id(*), unit:unit_id(barcode_value)');

        if (member_id) query.eq('member_id', member_id);
        if (status) query.eq('status', status);
        if (type) query.eq('item_type_at_checkout', type);

        const { data, error } = await query.order('due_return_date', { ascending: true, nullsFirst: false });
        if (error) throw error;
        return res.status(200).json({ checkouts: data || [] });
      }

      if (req.method === 'POST') {
        const { item_id, quantity, notes, unit_id, member_id } = req.body;
        if (!item_id) return res.status(400).json({ error: 'Item ID required' });
        const qty = quantity || 1;

        // Fetch item
        const { data: item, error: fetchErr } = await supabase
          .from('inventory_items')
          .select('*')
          .eq('id', item_id)
          .single();

        if (fetchErr || !item) throw fetchErr || new Error('Item not found');
        if (item.available_stock < qty) {
          return res.status(400).json({ error: 'Item no longer in stock.' });
        }

        // Verify unit availability if checking out a specific unit
        let targetUnitId = unit_id;
        if (targetUnitId) {
          const { data: uRec } = await supabase
            .from('inventory_units')
            .select('*')
            .eq('id', targetUnitId)
            .single();
          if (!uRec || uRec.status !== 'available') {
            return res.status(400).json({ error: 'Selected physical unit is not available.' });
          }
        } else {
          // Find first available physical unit dynamically if not provided
          const { data: uRec } = await supabase
            .from('inventory_units')
            .select('id')
            .eq('item_id', item_id)
            .eq('status', 'available')
            .order('unit_number')
            .limit(1)
            .maybeSingle();
          if (uRec) targetUnitId = uRec.id;
        }

        const checkoutDateStr = new Date().toISOString().split('T')[0];
        let dueReturnDateStr = null;
        if (item.item_type === 'lease') {
          const due = new Date();
          due.setDate(due.getDate() + (item.lease_duration_days || 30));
          dueReturnDateStr = due.toISOString().split('T')[0];
        }

        // Decrement available stock
        const { data: updatedItem, error: updateErr } = await supabase
          .from('inventory_items')
          .update({
            available_stock: item.available_stock - qty,
            updated_at: new Date().toISOString()
          })
          .eq('id', item_id)
          .gte('available_stock', qty)
          .select()
          .maybeSingle();

        if (updateErr || !updatedItem) {
          return res.status(400).json({ error: 'Item no longer in stock.' });
        }

        // Insert record
        const { data: checkout, error: insertErr } = await supabase
          .from('inventory_checkouts')
          .insert({
            member_id: member_id || profile.id,
            item_id,
            unit_id: targetUnitId || null,
            quantity: qty,
            item_type_at_checkout: item.item_type,
            checkout_date: checkoutDateStr,
            due_return_date: dueReturnDateStr,
            status: 'active',
            notes
          })
          .select()
          .single();

        if (insertErr) {
          // Rollback stock
          await supabase
            .from('inventory_items')
            .update({ available_stock: updatedItem.available_stock + qty })
            .eq('id', item_id);
          throw insertErr;
        }

        // Update physical unit status to checked_out
        if (targetUnitId) {
          await supabase
            .from('inventory_units')
            .update({ status: 'checked_out', current_checkout_id: checkout.id })
            .eq('id', targetUnitId);
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

        // Update physical unit status
        if (checkout.unit_id) {
          await supabase
            .from('inventory_units')
            .update({
              status: return_condition === 'good' ? 'available' : return_condition,
              current_checkout_id: null
            })
            .eq('id', checkout.unit_id);
        }

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

        const { return_condition, return_date, condition_notes } = req.body;
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
            condition_notes: condition_notes || null,
            manually_returned_by: profile.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (updateCheckoutErr) throw updateCheckoutErr;

        // Update physical unit status
        if (checkout.unit_id) {
          await supabase
            .from('inventory_units')
            .update({
              status: condition === 'good' ? 'available' : condition,
              current_checkout_id: null
            })
            .eq('id', checkout.unit_id);
        }

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

    // ==========================================
    // RESOURCE: BARCODE LOOKUP
    // ==========================================
    if (resource === 'barcode-lookup') {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      const { barcode } = req.query;
      if (!barcode) return res.status(400).json({ error: 'Barcode required' });

      // First check if barcode matches a physical unit (e.g. contains -U)
      const { data: unit } = await supabase
        .from('inventory_units')
        .select('*, items:item_id(*, categories:category_id(name))')
        .eq('barcode_value', barcode)
        .maybeSingle();

      if (unit) {
        return res.status(200).json({ type: 'unit', unit, item: unit.items });
      }

      // Check if barcode matches a product SKU
      const { data: item } = await supabase
        .from('inventory_items')
        .select('*, categories:category_id(name)')
        .eq('barcode_value', barcode)
        .eq('is_active', true)
        .maybeSingle();

      if (item) {
        return res.status(200).json({ type: 'product', item });
      }

      return res.status(404).json({ error: 'No product or physical unit matches this barcode' });
    }

    // ==========================================
    // RESOURCE: ORG SETTINGS
    // ==========================================
    if (resource === 'org-settings') {
      if (req.method === 'POST') {
        if (profile.role !== 'admin' && profile.role !== 'super') return res.status(403).json({ error: 'Forbidden' });
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: 'Key required' });
        const { error } = await supabase.from('org_settings').upsert({ key, value, updated_at: new Date().toISOString() });
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
    }

    // ==========================================
    // RESOURCE: DAMAGE REVIEW
    // ==========================================
    if (resource === 'damage-review') {
      if (profile.role !== 'admin' && profile.role !== 'super') return res.status(403).json({ error: 'Forbidden' });

      if (req.method === 'GET') {
        const { data, error } = await supabase
          .from('inventory_checkouts')
          .select('*, member:member_id(name), items:item_id(name, barcode_value), unit:unit_id(barcode_value)')
          .eq('condition_flag', true)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return res.status(200).json({ records: data || [] });
      }

      if (req.method === 'POST') {
        const { id, resolve_action } = req.body;
        if (!id) return res.status(400).json({ error: 'ID required' });

        // Resolve checkout flag
        const { data: checkout, error: fetchErr } = await supabase
          .from('inventory_checkouts')
          .select('*')
          .eq('id', id)
          .single();
        
        if (fetchErr || !checkout) return res.status(404).json({ error: 'Record not found' });

        // If resolve action is "restock" or "repaired", make the unit available and restore stock
        if (resolve_action === 'repaired') {
          if (checkout.unit_id) {
            await supabase
              .from('inventory_units')
              .update({ status: 'available' })
              .eq('id', checkout.unit_id);
          }
          // Increment stock
          const { data: item } = await supabase.from('inventory_items').select('available_stock').eq('id', checkout.item_id).single();
          if (item) {
            await supabase
              .from('inventory_items')
              .update({ available_stock: item.available_stock + checkout.quantity })
              .eq('id', checkout.item_id);
          }
        } else if (resolve_action === 'writeoff') {
          // Keep unit marked as damaged/lost permanently, and decrement total_stock on product
          const { data: item } = await supabase.from('inventory_items').select('total_stock').eq('id', checkout.item_id).single();
          if (item) {
            await supabase
              .from('inventory_items')
              .update({ total_stock: Math.max(0, item.total_stock - checkout.quantity) })
              .eq('id', checkout.item_id);
          }
        }

        // Clear flag
        const { error } = await supabase.from('inventory_checkouts').update({ condition_flag: false }).eq('id', id);
        if (error) throw error;
        return res.status(200).json({ success: true });
      }
    }

    return res.status(400).json({ error: 'Invalid resource or request method' });
  } catch (err) {
    console.error('Inventory API consolidated error:', err);
    return res.status(500).json({ error: err.message });
  }
}
