if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function logInventoryAudit(actorId, action, entityType, entityId, payload = null) {
  try {
    await supabase.from('inventory_audit_log').insert({
      actor_id: actorId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      payload
    });
  } catch (err) {
    console.error('Audit log insertion failed:', err.message);
  }
}

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
        let item, itemErr;
        const mainQuery = await supabase
          .from('inventory_items')
          .select('id, name, item_type, available_stock, total_stock, photo_url, public_description, barcode_value, categories:category_id(id, name)')
          .eq('id', id)
          .eq('is_active', true)
          .eq('public_visible', true)
          .single();

        item = mainQuery.data;
        itemErr = mainQuery.error;

        if (itemErr) {
          // Fallback: try without public/barcode/description columns or filters
          const fallbackQuery = await supabase
            .from('inventory_items')
            .select('id, name, item_type, available_stock, total_stock, photo_url, categories:category_id(id, name)')
            .eq('id', id)
            .eq('is_active', true)
            .single();

          if (fallbackQuery.error) return res.status(404).json({ error: 'Item not found' });
          item = fallbackQuery.data;
        }

        // Query physical units (fallback to empty array if table not created yet)
        const { data: units } = await supabase
          .from('inventory_units')
          .select('id, unit_number, barcode_value, status')
          .eq('item_id', id)
          .order('unit_number');

        // Query reviews
        let reviews = [];
        try {
          const { data: revs } = await supabase
            .from('inventory_reviews')
            .select('id, rating, review_text, created_at, member:member_id(name)')
            .eq('item_id', id)
            .order('created_at', { ascending: false });
          reviews = (revs || []).map(r => ({
            id: r.id,
            rating: r.rating,
            text: r.review_text,
            date: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'N/A',
            memberName: r.member?.name || 'Anonymous'
          }));
        } catch (e) {
          console.warn('Reviews fetch failed:', e.message);
        }

        return res.status(200).json({ item, units: units || [], reviews });
      }

      // 2. List items request
      const buildListQuery = (withPublic) => {
        let q = supabase.from('inventory_items');
        if (withPublic) {
          q = q.select('id, name, item_type, available_stock, total_stock, photo_url, public_description, barcode_value, categories:category_id(id, name)')
               .eq('public_visible', true);
        } else {
          q = q.select('id, name, item_type, available_stock, total_stock, photo_url, categories:category_id(id, name)');
        }
        q = q.eq('is_active', true).order('name');
        if (search) q = q.ilike('name', `%${search}%`);
        if (category_id) q = q.eq('category_id', category_id);
        return q;
      };

      let { data: items, error } = await buildListQuery(true);
      if (error) {
        // Fallback list select without public columns
        const fbResult = await buildListQuery(false);
        if (fbResult.error) return res.status(500).json({ error: fbResult.error.message });
        items = fbResult.data;
      }

      const itemsWithUnitsAndReviews = [];
      for (const item of (items || [])) {
        const { data: units } = await supabase
          .from('inventory_units')
          .select('id, unit_number, barcode_value, status')
          .eq('item_id', item.id)
          .order('unit_number');

        let reviews = [];
        try {
          const { data: revs } = await supabase
            .from('inventory_reviews')
            .select('rating')
            .eq('item_id', item.id);
          reviews = revs || [];
        } catch (e) {
          // fallback
        }
        itemsWithUnitsAndReviews.push({ ...item, units: units || [], reviews });
      }
      return res.status(200).json({ items: itemsWithUnitsAndReviews });
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

  const hasPermission = (perm) => {
    if (profile.role === 'super') return true;
    return !!profile.perms?.[perm];
  };

  const resource = req.query.resource || req.body?.resource;
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
      if (req.method === 'POST') {
        if (!hasPermission('catalogue.create')) {
          return res.status(403).json({ error: 'Forbidden - Requires catalogue.create permission' });
        }
      } else if (req.method === 'PATCH' || req.method === 'PUT') {
        if (!hasPermission('catalogue.edit')) {
          return res.status(403).json({ error: 'Forbidden - Requires catalogue.edit permission' });
        }
      } else if (req.method === 'DELETE') {
        if (!hasPermission('catalogue.delete')) {
          return res.status(403).json({ error: 'Forbidden - Requires catalogue.delete permission' });
        }
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

      if (req.method === 'PATCH' || req.method === 'PUT') {
        const { id, name } = req.body;
        if (!id) return res.status(400).json({ error: 'Category ID required' });
        if (!name) return res.status(400).json({ error: 'Category name required' });

        const { data, error } = await supabase
          .from('inventory_categories')
          .update({ name })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ category: data });
      }

      if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Category ID required' });

        if (profile.role !== 'super' && profile.role !== 'admin' && profile.role !== 'member') {
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
    // RESOURCE: REVIEWS
    // ==========================================
    if (resource === 'reviews') {
      if (req.method === 'GET') {
        const { item_id } = req.query;
        if (!item_id) return res.status(400).json({ error: 'Item ID required' });
        const { data, error } = await supabase
          .from('inventory_reviews')
          .select('id, rating, review_text, created_at, member:member_id(name)')
          .eq('item_id', item_id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        const formatted = (data || []).map(r => ({
          id: r.id,
          rating: r.rating,
          text: r.review_text,
          date: r.created_at ? new Date(r.created_at).toLocaleDateString() : 'N/A',
          memberName: r.member?.name || 'Anonymous'
        }));
        return res.status(200).json({ reviews: formatted });
      }

      if (req.method === 'POST') {
        const { item_id, rating, review_text } = req.body;
        if (!item_id || !rating) return res.status(400).json({ error: 'Item ID and rating required' });
        const { data, error } = await supabase
          .from('inventory_reviews')
          .upsert({
            item_id,
            member_id: profile.id,
            rating: Number(rating),
            review_text
          }, { onConflict: 'item_id,member_id' })
          .select();
        if (error) throw error;
        return res.status(200).json({ review: data });
      }
    }

    // ==========================================
    // RESOURCE: ITEMS
    // ==========================================
    if (resource === 'items') {
      if (req.method === 'GET') {
        let query = supabase.from('inventory_items').select('*, categories:category_id(name)');

        // Non-admins can only see active items
        if (profile.role !== 'admin' && profile.role !== 'super' && profile.role !== 'member') {
          query = query.eq('is_active', true);
        }

        // Apply filters
        const { search, category_id, type } = req.query;
        if (search) query = query.ilike('name', `%${search}%`);
        if (category_id) query = query.eq('category_id', category_id);
        if (type) query = query.eq('item_type', type);

        const { data: items, error } = await query.order('name');
        if (error) throw error;

        // Fetch physical units count/status and reviews for admins
        const itemsWithUnits = [];
        for (const item of (items || [])) {
          const { data: units } = await supabase
            .from('inventory_units')
            .select('id, unit_number, barcode_value, status')
            .eq('item_id', item.id)
            .order('unit_number');
          
          let reviews = [];
          try {
            const { data: revs } = await supabase
              .from('inventory_reviews')
              .select('rating')
              .eq('item_id', item.id);
            reviews = revs || [];
          } catch (e) {
            // fallback if reviews table doesn't exist yet
          }
          
          itemsWithUnits.push({ ...item, units: units || [], reviews });
        }

        return res.status(200).json({ items: itemsWithUnits });
      }

      // Mutation auth check
      if (!hasPermission('catalogue.create')) {
        return res.status(403).json({ error: 'Forbidden - Requires catalogue.create permission' });
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
        let item, itemErr;
        const mainPayload = {
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
        };

        const resInsert = await supabase
          .from('inventory_items')
          .insert(mainPayload)
          .select()
          .single();

        item = resInsert.data;
        itemErr = resInsert.error;

        if (itemErr && (itemErr.message.includes('barcode_value') || itemErr.message.includes('public_visible') || itemErr.message.includes('public_description') || itemErr.code === '42703')) {
          // Fallback: remove the columns that might be missing in older schemas
          const fallbackPayload = {
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
          };
          const fallbackInsert = await supabase
            .from('inventory_items')
            .insert(fallbackPayload)
            .select()
            .single();
          
          item = fallbackInsert.data;
          itemErr = fallbackInsert.error;
        }

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

        await logInventoryAudit(profile.id, 'item-create', 'item', item.id, item);

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

      const { action, id } = req.body;
      if (!action || !id) return res.status(400).json({ error: 'Action and ID required' });

      // Enforce action-specific permissions
      if (action === 'edit' || action === 'deactivate') {
        if (!hasPermission('catalogue.edit')) {
          return res.status(403).json({ error: 'Forbidden - Requires catalogue.edit permission' });
        }
      } else if (action === 'delete') {
        if (!hasPermission('catalogue.delete')) {
          return res.status(403).json({ error: 'Forbidden - Requires catalogue.delete permission' });
        }
      } else if (action === 'adjust-stock') {
        if (!hasPermission('inventory.stock.update')) {
          return res.status(403).json({ error: 'Forbidden - Requires inventory.stock.update permission' });
        }
      } else {
        return res.status(400).json({ error: `Invalid item action: ${action}` });
      }

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
        const updatePayload = {
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
        };

        let { error: editErr } = await supabase
          .from('inventory_items')
          .update(updatePayload)
          .eq('id', id);

        if (editErr && (editErr.message.includes('public_visible') || editErr.message.includes('public_description') || editErr.code === '42703')) {
          // Fallback: update without public columns
          const fallbackPayload = {
            name,
            category_id,
            total_stock: total_stock !== undefined ? total_stock : currentItem.total_stock,
            lease_duration_days: currentItem.item_type === 'lease' ? lease_duration_days : null,
            description,
            photo_url,
            updated_by: profile.id,
            updated_at: new Date().toISOString()
          };
          const fallbackRes = await supabase
            .from('inventory_items')
            .update(fallbackPayload)
            .eq('id', id);
          editErr = fallbackRes.error;
        }

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
        await logInventoryAudit(profile.id, 'item-edit', 'item', id, {
          name,
          category_id,
          total_stock: total_stock !== undefined ? total_stock : currentItem.total_stock,
          lease_duration_days: currentItem.item_type === 'lease' ? lease_duration_days : null,
          description,
          photo_url,
          public_visible: public_visible !== undefined ? public_visible : false,
          public_description
        });

        return res.status(200).json({ success: true });
      }

      // 2. DEACTIVATE
      if (action === 'deactivate') {
        const { error } = await supabase
          .from('inventory_items')
          .update({ is_active: false, updated_by: profile.id, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
        await logInventoryAudit(profile.id, 'item-deactivate', 'item', id);
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

        await logInventoryAudit(profile.id, 'adjust-stock', 'item', id, { old_available_stock: item.available_stock, new_available_stock, reason });

        return res.status(200).json({ success: true });
      }

      if (action === 'delete') {
        if (profile.role !== 'super' && profile.role !== 'admin' && profile.role !== 'member') return res.status(403).json({ error: 'Super-admin only' });

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

        await logInventoryAudit(profile.id, 'item-delete', 'item', id);

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
          let { data, error } = await supabase
            .from('inventory_checkouts')
            .select('*, items:item_id(*), unit:unit_id(barcode_value)')
            .eq('member_id', profile.id)
            .order('due_return_date', { ascending: true, nullsFirst: false });
          
          if (error) {
            const fallbackQuery = await supabase
              .from('inventory_checkouts')
              .select('*, items:item_id(*)')
              .eq('member_id', profile.id)
              .order('due_return_date', { ascending: true, nullsFirst: false });
            if (fallbackQuery.error) throw fallbackQuery.error;
            data = fallbackQuery.data;
          }
          return res.status(200).json({ checkouts: data || [] });
        }

        // Admin/Member checks all
        if (!hasPermission('checkout.view')) {
          return res.status(403).json({ error: 'Forbidden - Requires checkout.view permission' });
        }

        const buildQuery = (withUnit) => {
          let q = supabase.from('inventory_checkouts');
          if (withUnit) {
            q = q.select('*, member:member_id(name), items:item_id(*), unit:unit_id(barcode_value)');
          } else {
            q = q.select('*, member:member_id(name), items:item_id(*)');
          }
          if (member_id) q = q.eq('member_id', member_id);
          if (status) q = q.eq('status', status);
          if (type) q = q.eq('item_type_at_checkout', type);
          return q.order('due_return_date', { ascending: true, nullsFirst: false });
        };

        let { data, error } = await buildQuery(true);
        if (error) {
          const fallbackQuery = await buildQuery(false);
          if (fallbackQuery.error) throw fallbackQuery.error;
          data = fallbackQuery.data;
        }
        return res.status(200).json({ checkouts: data || [] });
      }

      if (req.method === 'POST') {
        if (!hasPermission('checkout.create')) {
          return res.status(403).json({ error: 'Forbidden - Requires checkout.create permission' });
        }
        const { item_id, quantity, notes, unit_id, member_id, mission_id } = req.body;
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
            notes,
            mission_id: mission_id || null
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

        await logInventoryAudit(profile.id, 'checkout', 'checkout', checkout.id, checkout);

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
        if (checkout.member_id === profile.id) {
          if (!hasPermission('checkout.return')) {
            return res.status(403).json({ error: 'Forbidden - Requires checkout.return permission' });
          }
        } else {
          if (!hasPermission('checkout.force_return')) {
            return res.status(403).json({ error: 'Forbidden - Requires checkout.force_return permission to check in other users\' leases' });
          }
        }

        const { return_condition, condition_notes } = req.body;
        if (!return_condition) return res.status(400).json({ error: 'Return condition required' });

        const conditionFlag = return_condition === 'damaged' || return_condition === 'lost';

        const { error: updateCheckoutErr } = await supabase
          .from('inventory_checkouts')
          .update({
            status: 'returned',
            actual_return_date: new Date().toISOString(),
            return_condition,
            condition_flag: conditionFlag,
            condition_notes,
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

        await logInventoryAudit(profile.id, 'checkin', 'checkout', id, { return_condition, condition_notes });

        return res.status(200).json({ success: true });
      }

      // 2. ADMIN MANUAL OVERRIDE (MARK-RETURNED)
      if (action === 'mark-returned') {
        if (!hasPermission('checkout.force_return')) {
          return res.status(403).json({ error: 'Forbidden - Requires checkout.force_return permission' });
        }

        const { return_condition, return_date, condition_notes } = req.body;
        const condition = return_condition || 'good';
        const rDate = return_date ? new Date(return_date).toISOString() : new Date().toISOString();

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

        await logInventoryAudit(profile.id, 'mark-returned', 'checkout', id, { return_condition: condition, return_date: rDate, condition_notes });

        return res.status(200).json({ success: true });
      }

      // 3. UPDATE PHYSICAL UNIT STATUS/CONDITION
      if (action === 'update-unit-condition') {
        if (!hasPermission('checkout.force_return')) {
          return res.status(403).json({ error: 'Forbidden - Requires admin permissions' });
        }
        const { unit_id, status } = req.body;
        if (!unit_id || !status) return res.status(400).json({ error: 'Unit ID and Status required' });

        const { data: unit } = await supabase.from('inventory_units').select('*').eq('id', unit_id).single();
        if (!unit) return res.status(404).json({ error: 'Unit not found' });

        const { error: unitErr } = await supabase
          .from('inventory_units')
          .update({ status })
          .eq('id', unit_id);
        if (unitErr) throw unitErr;

        const wasDamagedOrLost = unit.status === 'damaged' || unit.status === 'lost';
        const isNowAvailable = status === 'available';
        if (wasDamagedOrLost && isNowAvailable) {
          const { data: item } = await supabase.from('inventory_items').select('available_stock').eq('id', unit.item_id).single();
          if (item) {
            await supabase
              .from('inventory_items')
              .update({ available_stock: item.available_stock + 1 })
              .eq('id', unit.item_id);
          }
        }
        
        const wasAvailable = unit.status === 'available';
        const isNowDamagedOrLost = status === 'damaged' || status === 'lost' || status === 'archived';
        if (wasAvailable && isNowDamagedOrLost) {
          const { data: item } = await supabase.from('inventory_items').select('available_stock').eq('id', unit.item_id).single();
          if (item && item.available_stock > 0) {
            await supabase
              .from('inventory_items')
              .update({ available_stock: item.available_stock - 1 })
              .eq('id', unit.item_id);
          }
        }

        await logInventoryAudit(profile.id, 'update-unit-condition', 'unit', unit_id, { old_status: unit.status, new_status: status });
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
        let currentCheckout = null;
        if (unit.status === 'checked_out' && unit.current_checkout_id) {
          const { data: co } = await supabase
            .from('inventory_checkouts')
            .select('*, member:member_id(id, name, membership_no)')
            .eq('id', unit.current_checkout_id)
            .maybeSingle();
          currentCheckout = co;
        }

        const { data: units } = await supabase
          .from('inventory_units')
          .select('id, unit_number, barcode_value, status')
          .eq('item_id', unit.items.id)
          .order('unit_number');
        const itemWithUnits = { ...unit.items, units: units || [] };
        const unitWithCheckout = { ...unit, current_checkout: currentCheckout };
        return res.status(200).json({ type: 'unit', unit: unitWithCheckout, item: itemWithUnits });
      }

      // Check if barcode matches a product SKU
      const { data: item } = await supabase
        .from('inventory_items')
        .select('*, categories:category_id(name)')
        .eq('barcode_value', barcode)
        .eq('is_active', true)
        .maybeSingle();

      if (item) {
        const { data: units } = await supabase
          .from('inventory_units')
          .select('id, unit_number, barcode_value, status')
          .eq('item_id', item.id)
          .order('unit_number');
        const itemWithUnits = { ...item, units: units || [] };
        return res.status(200).json({ type: 'product', item: itemWithUnits });
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
      if (profile.role !== 'admin' && profile.role !== 'super' && profile.role !== 'member') return res.status(403).json({ error: 'Forbidden' });

      if (req.method === 'GET') {
        const queryWithAll = () => supabase
          .from('inventory_checkouts')
          .select('*, member:member_id(name), items:item_id(name, barcode_value), unit:unit_id(barcode_value)')
          .eq('condition_flag', true)
          .order('created_at', { ascending: false });

        let { data, error } = await queryWithAll();

        if (error) {
          // Fallback 1: Try without unit relation
          const queryWithoutUnit = () => supabase
            .from('inventory_checkouts')
            .select('*, member:member_id(name), items:item_id(name, barcode_value)')
            .eq('condition_flag', true)
            .order('created_at', { ascending: false });
          
          let fb1 = await queryWithoutUnit();
          if (fb1.error) {
            // Fallback 2: Try without unit relation AND without barcode_value
            const queryBasic = () => supabase
              .from('inventory_checkouts')
              .select('*, member:member_id(name), items:item_id(name)')
              .eq('condition_flag', true)
              .order('created_at', { ascending: false });
            
            let fb2 = await queryBasic();
            if (fb2.error) throw fb2.error;
            data = fb2.data;
          } else {
            data = fb1.data;
          }
        }

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

    // ==========================================
    // RESOURCE: MISSIONS
    // ==========================================
    if (resource === 'missions') {
      if (req.method === 'GET') {
        const { data: missions, error } = await supabase
          .from('welfare_missions')
          .select('*')
          .order('created_at', { ascending: false });

        // Gracefully handle missing table (PGRST205 = table not in schema cache, 42P01 = relation does not exist)
        if (error) {
          if (error.code === 'PGRST205' || error.code === '42P01' || (error.message && error.message.includes('welfare_missions'))) {
            return res.status(500).json({
              error: `Database table 'welfare_missions' not found. Please run migration: supabase/migrations/012_db_missions.sql in your Supabase SQL Editor.`,
              missions: [],
              migration_required: true
            });
          }
          throw error;
        }

        // Fetch counts of active checkouts dynamically for each mission
        const missionsWithCounts = [];
        for (const mission of (missions || [])) {
          const { count } = await supabase
            .from('inventory_checkouts')
            .select('id', { count: 'exact', head: true })
            .eq('mission_id', mission.id)
            .eq('status', 'active');
          missionsWithCounts.push({ ...mission, active_checkouts_count: count || 0 });
        }
        return res.status(200).json({ missions: missionsWithCounts });
      }

      // Permissions check for missions mutations
      if (req.method === 'POST') {
        if (!hasPermission('missions.create')) {
          return res.status(403).json({ error: 'Forbidden - Requires missions.create permission' });
        }
      } else if (req.method === 'PATCH') {
        const { status } = req.body;
        if (status === 'completed') {
          if (!hasPermission('missions.complete')) {
            return res.status(403).json({ error: 'Forbidden - Requires missions.complete permission' });
          }
        } else {
          if (!hasPermission('missions.create') && !hasPermission('missions.assign')) {
            return res.status(403).json({ error: 'Forbidden - Requires missions.create or missions.assign permission' });
          }
        }
      } else if (req.method === 'DELETE') {
        if (!hasPermission('missions.create')) {
          return res.status(403).json({ error: 'Forbidden - Requires missions.create permission to delete missions' });
        }
      }

      if (req.method === 'POST') {
        const { name, emoji, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Mission name required' });

        const { data, error } = await supabase
          .from('welfare_missions')
          .insert({
            name,
            emoji: emoji || '🤝',
            description,
            created_by: profile.id
          })
          .select()
          .single();
        if (error) throw error;

        await logInventoryAudit(profile.id, 'mission-create', 'mission', data.id, data);

        return res.status(201).json({ mission: data });
      }

      if (req.method === 'PATCH') {
        const { id, status, name, emoji, description } = req.body;
        if (!id) return res.status(400).json({ error: 'Mission ID required' });

        const updateData = {};
        if (status) {
          updateData.status = status;
          if (status === 'completed') {
            updateData.completed_at = new Date().toISOString();
          }
        }
        if (name) updateData.name = name;
        if (emoji) updateData.emoji = emoji;
        if (description !== undefined) updateData.description = description;

        const { data, error } = await supabase
          .from('welfare_missions')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;

        await logInventoryAudit(profile.id, 'mission-update', 'mission', id, data);

        return res.status(200).json({ mission: data });
      }

      if (req.method === 'DELETE') {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'Mission ID required' });

        const { count } = await supabase
          .from('inventory_checkouts')
          .select('id', { count: 'exact', head: true })
          .eq('mission_id', id);

        if (count > 0) {
          return res.status(400).json({ error: 'Cannot delete mission with linked checkouts' });
        }

        const { error } = await supabase.from('welfare_missions').delete().eq('id', id);
        if (error) throw error;

        await logInventoryAudit(profile.id, 'mission-delete', 'mission', id);

        return res.status(200).json({ success: true });
      }
    }

    return res.status(400).json({ error: 'Invalid resource or request method' });
  } catch (err) {
    console.error('Inventory API consolidated error:', err);
    return res.status(500).json({ error: err.message });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};
