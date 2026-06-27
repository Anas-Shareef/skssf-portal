import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Service-role client — can update any user's password
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { email, newPassword } = req.body || {};

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'email and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }

  try {
    // Look up the user in Supabase Auth by email
    const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    if (listError) {
      return res.status(500).json({ message: 'Failed to look up users: ' + listError.message });
    }

    const authUser = (listData?.users || []).find(
      u => u.email?.toLowerCase() === email.trim().toLowerCase()
    );

    if (!authUser) {
      return res.status(404).json({ message: 'No account found with that email' });
    }

    // Update the password in Supabase Auth using the admin API
    const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: newPassword
    });

    if (updateError) {
      return res.status(500).json({ message: 'Password update failed: ' + updateError.message });
    }

    return res.status(200).json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('reset-own-password error:', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  }
}
