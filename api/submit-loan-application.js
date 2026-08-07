if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://jgxzdwbixqhkjrdbhnlc.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      source_request_id,
      applicant_name,
      applicant_phone,
      applicant_address,
      amount,
      months,
      relationship,
      member_notes,
      purpose,
      submitted_by_member_id
    } = req.body || {};

    const nameVal = applicant_name || 'Applicant';
    const phoneVal = applicant_phone || '';
    const addressVal = applicant_address || '';
    const amtVal = parseFloat(amount) || 1000;
    const monthsVal = parseInt(months) || 12;

    // Truncate purpose & notes to <= 220 chars to guarantee VARCHAR(255) compliance
    const cleanPurpose = (purpose || 'Loan Request').slice(0, 220);
    const cleanNotes = (member_notes || '').slice(0, 220);
    const loanNo = 'LN-' + Math.floor(100000 + Math.random() * 900000);

    // Candidates in order of preference.
    // Mandatory NOT NULL columns provided in ALL candidates: `loan_no`, `name`, `amount`, `purpose`, `status`.
    const candidates = [
      // Candidate A: Full PRD Schema with all column aliases
      {
        loan_no: loanNo,
        name: nameVal,
        amount: amtVal,
        amt: amtVal,
        loan_amount_requested: amtVal,
        loan_amount_approved: amtVal,
        purpose: cleanPurpose,
        requester_name: nameVal,
        requester_phone: phoneVal,
        requester_address: addressVal,
        repayment_period_months: monthsVal,
        member_notes: cleanNotes,
        submitted_by_member_id: submitted_by_member_id || null,
        filed_by_member_id: submitted_by_member_id || null,
        source_request_id: source_request_id || null,
        workflow_status: 'PENDING_COORDINATOR_REVIEW',
        status: 'pending'
      },
      // Candidate B: Extended schema without source_request_id / filed_by_member_id
      {
        loan_no: loanNo,
        name: nameVal,
        amount: amtVal,
        amt: amtVal,
        loan_amount_requested: amtVal,
        loan_amount_approved: amtVal,
        purpose: cleanPurpose,
        requester_name: nameVal,
        requester_phone: phoneVal,
        requester_address: addressVal,
        repayment_period_months: monthsVal,
        submitted_by_member_id: submitted_by_member_id || null,
        workflow_status: 'PENDING_COORDINATOR_REVIEW',
        status: 'pending'
      },
      // Candidate C: Legacy DB Schema (loan_no, name, amount, amt, purpose, status, submitted_by_member_id)
      {
        loan_no: loanNo,
        name: nameVal,
        amount: amtVal,
        amt: amtVal,
        purpose: cleanPurpose,
        submitted_by_member_id: submitted_by_member_id || null,
        status: 'pending'
      },
      // Candidate D: Universal Base Schema (loan_no, name, amount, purpose, status)
      {
        loan_no: loanNo,
        name: nameVal,
        amount: amtVal,
        purpose: cleanPurpose,
        status: 'pending'
      }
    ];

    let insertedLoan = null;
    let lastError = null;

    for (const payload of candidates) {
      const cleanPayload = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v !== undefined && v !== null) cleanPayload[k] = v;
      }

      const { data, error } = await supabase
        .from('loans')
        .insert([cleanPayload])
        .select();

      if (!error && data && data.length > 0) {
        insertedLoan = data[0];
        break;
      } else if (error) {
        lastError = error;
        console.warn(`Candidate payload failed (${error.message}), trying next candidate...`);
      }
    }

    if (!insertedLoan) {
      throw new Error(lastError ? lastError.message : 'Failed to insert loan record.');
    }

    // Update loan_requests if source_request_id is provided
    if (source_request_id) {
      try {
        await supabase
          .from('loan_requests')
          .update({
            status: 'forwarded',
            converted_to_loan_id: insertedLoan.id
          })
          .eq('id', source_request_id);
      } catch (updErr) {
        console.warn('Silent loan_requests update error:', updErr);
      }
    }

    return res.status(200).json({ success: true, loan: insertedLoan });
  } catch (err) {
    console.error('Error in submit-loan-application handler:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
