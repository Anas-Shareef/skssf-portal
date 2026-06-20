import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ message: 'Email and code are required' });
  }

  try {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    // Find the latest valid OTP code for this email that has not expired
    const { data: otps, error: dbError } = await supabase
      .from('witness_otps')
      .select('*')
      .eq('email', cleanEmail)
      .eq('code', cleanCode)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Database Error:', dbError);
      return res.status(500).json({ message: 'Database error occurred: ' + dbError.message });
    }

    if (!otps || otps.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired OTP code' });
    }

    // OTP is valid! Delete all OTPs for this email to prevent reuse
    await supabase.from('witness_otps').delete().eq('email', cleanEmail);

    return res.status(200).json({ success: true, message: 'OTP verified successfully' });
  } catch (error) {
    console.error('Verify OTP Error:', error);
    return res.status(500).json({ message: error.message || 'Failed to verify OTP' });
  }
}
