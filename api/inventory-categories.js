import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
      const { data, error } = await supabase.from('inventory_categories').select('*').order('name');
      if (error) throw error;
      return res.status(200).json({ categories: data || [] });
    }

    // Auth check for mutations
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

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Inventory categories error:', err);
    return res.status(500).json({ error: err.message });
  }
}
