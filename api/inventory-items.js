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

    // Admin/Super-Admin check for mutations
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

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Inventory items error:', err);
    return res.status(500).json({ error: err.message });
  }
}
