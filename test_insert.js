import fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
});

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';

async function testInsert() {
  const loanPayload = {
    loan_no: `LOAN-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    user_id: '0bb52e0c-4a26-42de-af84-f48663a22016', // Existing profile ID from profiles table
    member_no: 'MBR-1234',
    name: 'Rizwan',
    branch: 'Poyanad Central',
    mob: '8848622661',
    amount: 10000,
    purpose: 'Education',
    purpose_desc: 'School fees',
    months: 12,
    status: 'pending',
    submitted_date: new Date().toISOString().split('T')[0],
    guarantors: [],
    repayments: [],
    request: {},
    audit: [],
    signature: 'data:image/png;base64,sample...',
    witnesses: [],
    submitted_by_member_id: '0bb52e0c-4a26-42de-af84-f48663a22016',
    requester_name: 'Rizwan',
    requester_phone: '8848622661',
    requester_address: 'Address here',
    repayment_period_months: 12,
    loan_amount_requested: 10000,
    workflow_status: 'PENDING_COORDINATOR_REVIEW',
    member_notes: ''
  };

  try {
    const url = `${supabaseUrl}/rest/v1/loans`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(loanPayload)
    });
    console.log(`loans insert check: Status ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log('Result:', text);
  } catch (err) {
    console.error('Failed:', err);
  }
}

testInsert();
