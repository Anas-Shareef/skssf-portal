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
      submitted_by_member_id,
      // public form fields (sent from PublicLoanRequest.tsx)
      is_public_referral,
      referred_member_id,
      referred_member_name,
      loan_purpose_category,
      loan_purpose_detail,
      father_name,
      dob,
      gender,
      aadhaar_last4,
      whatsapp,
      income_source,
      monthly_income,
      existing_debts,
      existing_debts_detail,
      witness1_name,
      witness1_phone,
      witness2_name,
      witness2_phone
    } = req.body || {};

    const nameVal = applicant_name || 'Applicant';
    const phoneVal = applicant_phone || '';
    const addressVal = applicant_address || '';
    const amtVal = parseFloat(amount) || 1000;
    const monthsVal = parseInt(months) || 12;

    // Truncate purpose & notes to <= 220 chars to guarantee VARCHAR(255) compliance
    const cleanPurpose = (purpose || 'Loan Request').slice(0, 220);
    const cleanNotes = (member_notes || '').slice(0, 220);

    // ====================================================================
    // PATH A: Public referral form (from /request/:memberCode)
    // Creates a loan_request entry so the referring member sees it in inbox.
    // ====================================================================
    if (is_public_referral) {
      const referredId = referred_member_id || submitted_by_member_id || null;

      // Build the `reason` summary string that the inbox filter uses
      const referredName = referred_member_name || '';
      const reasonStr = [
        referredName ? `Referred By: ${referredName}` : '',
        loan_purpose_category ? `Category: ${loan_purpose_category}` : '',
        loan_purpose_detail ? `Details: ${loan_purpose_detail}` : '',
        `Period: ${monthsVal} Months`,
        monthly_income ? `Income: ₹${monthly_income} (${income_source || ''})` : '',
        existing_debts ? `Debts: ${existing_debts_detail || 'Yes'}` : 'Debts: None',
        aadhaar_last4 ? `Aadhaar Last 4: ${aadhaar_last4}` : '',
        dob ? `DOB: ${dob}${gender ? ` (${gender})` : ''}` : ''
      ].filter(Boolean).join('\n');

      const requestPayload = {
        requester_name: nameVal,
        requester_phone: phoneVal,
        requester_address: addressVal,
        reason: reasonStr || cleanPurpose,
        approximate_amount: amtVal,
        loan_amount_requested: amtVal,
        loan_purpose_category: loan_purpose_category || null,
        loan_purpose_detail: loan_purpose_detail || null,
        repayment_period_months: monthsVal,
        applicant_name: nameVal,
        applicant_phone: phoneVal,
        monthly_income: monthly_income ? parseFloat(monthly_income) : null,
        income_source: income_source || null,
        existing_debts: !!existing_debts,
        existing_debts_detail: existing_debts_detail || null,
        declaration_agreed: true,
        referred_member_id: referredId,
        referred_member_name: referredName || null,
        status: 'DRAFT_UNASSIGNED'
      };

      const { data: reqData, error: reqErr } = await supabase
        .from('loan_requests')
        .insert([requestPayload])
        .select();

      if (reqErr) {
        console.error('loan_requests insert error:', reqErr.message);
        throw new Error('Failed to save application: ' + reqErr.message);
      }

      return res.status(200).json({ success: true, record: reqData ? reqData[0] : null });
    }

    // ====================================================================
    // PATH B: Member formally submits an inbox request to admin (loans table)
    // ====================================================================
    const loanNo = 'PYD-IL-2026-' + Math.floor(10000 + Math.random() * 90000);

    // Candidates in order of preference.
    // Mandatory NOT NULL columns provided in ALL candidates: `loan_no`, `name`, `amount`, `purpose`, `status`.
    const candidates = [
      // Candidate A: Full PRD Schema
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
        source_request_id: source_request_id || null,
        workflow_status: 'PENDING_COORDINATOR_REVIEW',
        status: 'pending'
      },
      // Candidate B: without source_request_id
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
      // Candidate C: Legacy DB Schema
      {
        loan_no: loanNo,
        name: nameVal,
        amount: amtVal,
        amt: amtVal,
        purpose: cleanPurpose,
        submitted_by_member_id: submitted_by_member_id || null,
        status: 'pending'
      },
      // Candidate D: Universal Base Schema
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
            status: 'CONVERTED',
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
