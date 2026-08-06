if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const code = (req.query.code || '').toString().trim().toUpperCase();
  if (!code) {
    return res.status(400).json({ error: 'Member code is required' });
  }

  try {
    // 1. Search profiles by member_unique_code, member_code, or code
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name, role, member_unique_code, code, phone, branch')
      .or(`member_unique_code.ilike.${code},code.ilike.${code}`)
      .limit(1);

    if (error) throw error;

    if (profiles && profiles.length > 0) {
      return res.status(200).json({ success: true, member: profiles[0] });
    }

    // 2. Fallback: Search by ID prefix if code format is MBR-XXXX
    if (code.startsWith('MBR-')) {
      const codePart = code.replace('MBR-', '').toLowerCase();
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, name, role, member_unique_code, code, phone, branch');

      if (allProfiles) {
        const match = allProfiles.find(p => {
          const uCode = (p.member_unique_code || p.code || '').toUpperCase();
          const pId = (p.id || '').toLowerCase();
          return uCode === code || pId.startsWith(codePart) || pId.endsWith(codePart);
        });

        if (match) {
          return res.status(200).json({ success: true, member: match });
        }
      }
    }

    return res.status(444).json({ success: false, error: 'Member not found with this code' });
  } catch (err) {
    console.error('Error resolving member code:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
