if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://jgxzdwbixqhkjrdbhnlc.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

const trimmed = (value) => value === null || value === undefined ? '' : String(value).trim();
const applicantAge = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const month = now.getUTCMonth() - date.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
};

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
      referral_code,
      application_reference,
      referred_member_id,
      referred_member_name,
      loan_purpose_category,
      loan_purpose_detail,
       father_name,
       dob,
       gender,
       aadhaar_last4,
       whatsapp,
       address_house,
       address_place,
       address_post,
       address_pin,
       address_district,
       occupation,
       employer_name,
       income_source,
       monthly_income,
       existing_debts,
       existing_debts_detail,
       witness1_name,
       witness1_phone,
       witness1_member_no,
       witness2_name,
       witness2_phone,
       witness2_member_no,
       confirm_truth,
       confirm_schedule,
      decision_notification,
      loan_id,
      decision_status
    } = req.body || {};

    const nameVal = applicant_name || 'Applicant';
    const phoneVal = applicant_phone || '';
    const addressVal = applicant_address || '';
    const parsedAmount = parseFloat(amount);
    const amtVal = Number.isFinite(parsedAmount) ? parsedAmount : NaN;
    const parsedMonths = parseInt(months);
    const monthsVal = Number.isInteger(parsedMonths) ? parsedMonths : NaN;

    // Truncate purpose & notes to <= 220 chars to guarantee VARCHAR(255) compliance
    const cleanPurpose = (purpose || 'Loan Request').slice(0, 220);
    const cleanNotes = (member_notes || '').slice(0, 220);

    // Keep final-decision notifications in this existing function so the
    // deployment stays within Vercel Hobby's serverless-function limit.
    if (decision_notification) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (!token) return res.status(401).json({ error: 'Authentication required' });
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) return res.status(401).json({ error: 'Unauthenticated' });
      const { data: actor, error: actorError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle();
      if (actorError) {
        console.error('Decision notification actor lookup failed:', actorError);
        return res.status(500).json({ error: 'Unable to verify the approving user.' });
      }
      if (!actor || !['admin', 'super'].includes(actor.role)) {
        return res.status(403).json({ error: 'Admin permission required.' });
      }
      if (!loan_id || !['approved', 'rejected'].includes(decision_status)) {
        return res.status(400).json({ error: 'Invalid loan decision.' });
      }
      const { data: decisionLoan, error: loanLookupError } = await supabase
        .from('loans')
        .select('id, name, submitted_by_member_id')
        .eq('id', loan_id)
        .maybeSingle();
      if (loanLookupError) {
        console.error('Decision loan lookup failed:', loanLookupError);
        return res.status(500).json({ error: 'Unable to verify the loan.' });
      }
      if (!decisionLoan) return res.status(404).json({ error: 'Loan not found.' });
      if (!decisionLoan.submitted_by_member_id) return res.status(200).json({ success: true, notified: false });
      const label = decision_status === 'approved' ? 'approved' : 'rejected';
      const { error: decisionNotificationError } = await supabase.from('notifications').insert({
        user_id: decisionLoan.submitted_by_member_id,
        title: `Loan application ${label}`,
        message: `Your loan application for ${decisionLoan.name || 'the applicant'} was ${label} by Admin.`,
        link_url: '/member/dashboard/loans'
      });
      if (decisionNotificationError) {
        console.error('Decision notification insert failed:', decisionNotificationError);
        return res.status(500).json({ error: 'Decision saved, but notification delivery failed.' });
      }
      return res.status(200).json({ success: true, notified: true });
    }

    // ====================================================================
    // PATH A: Public referral form (from /request/:memberCode)
    // Creates a loan_request entry so the referring member sees it in inbox.
    // ====================================================================
    if (is_public_referral) {
      if (trimmed(applicant_name).length < 3) return res.status(400).json({ error: 'Applicant full name is required.' });
      if (!/^\d{10}$/.test(trimmed(applicant_phone))) return res.status(400).json({ error: 'A valid 10-digit phone number is required.' });
      if (!dob || applicantAge(dob) === null || applicantAge(dob) < 18) return res.status(400).json({ error: 'Applicant must be at least 18 years old.' });
      if (!trimmed(gender)) return res.status(400).json({ error: 'Gender is required.' });
      if (!trimmed(applicant_address) || trimmed(applicant_address).length < 10) return res.status(400).json({ error: 'Complete address is required.' });
      if (!Number.isFinite(amtVal) || amtVal < 1000 || amtVal > 50000) return res.status(400).json({ error: 'Requested amount must be between 1,000 and 50,000.' });
      if (!Number.isInteger(monthsVal) || monthsVal <= 0) return res.status(400).json({ error: 'A valid repayment period is required.' });
      if (trimmed(loan_purpose_detail).length < 20) return res.status(400).json({ error: 'Purpose details must be at least 20 characters.' });
      if (!Number.isFinite(Number(monthly_income)) || Number(monthly_income) < 1000) return res.status(400).json({ error: 'Monthly income must be at least 1,000.' });
      if (!trimmed(income_source)) return res.status(400).json({ error: 'Source of income is required.' });
      if (!trimmed(witness1_name) || !/^\d{10}$/.test(trimmed(witness1_phone)) || !trimmed(witness2_name) || !/^\d{10}$/.test(trimmed(witness2_phone))) return res.status(400).json({ error: 'Two valid witnesses are required.' });
      if (confirm_truth !== true || confirm_schedule !== true) return res.status(400).json({ error: 'Both declaration confirmations are required.' });

      let referredId = null;
      let referredName = null;
      if (referral_code) {
        const cleanCode = String(referral_code).trim().toUpperCase();
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('id, name, member_unique_code, code')
          .or(`member_unique_code.ilike.${cleanCode},code.ilike.${cleanCode}`);
        if (profileError) throw profileError;
        const direct = (profiles || [])[0];
        if (direct) {
          referredId = direct.id;
          referredName = direct.name;
        } else if (cleanCode.startsWith('MBR-')) {
          const prefix = cleanCode.slice(4).toLowerCase();
          const { data: allProfiles, error: allProfilesError } = await supabase
            .from('profiles')
            .select('id, name, member_unique_code, code');
          if (allProfilesError) throw allProfilesError;
          const match = (allProfiles || []).find(p => String(p.id || '').toLowerCase().startsWith(prefix));
          if (match) {
            referredId = match.id;
            referredName = match.name;
          }
        }
        if (!referredId) return res.status(400).json({ error: 'Invalid referral link' });
      }

      // Build the `reason` summary string that the inbox filter uses
      const reference = String(application_reference || `PYD-IL-2026-${Math.floor(10000 + Math.random() * 90000)}`).trim();
      const reasonStr = [
        `Application Reference: ${reference}`,
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
         applicant_dob: dob || null,
         applicant_gender: gender || null,
         applicant_whatsapp: whatsapp || null,
         applicant_address_house: address_house || null,
         applicant_address_street: address_place || null,
         applicant_address_city: address_district || null,
         applicant_address_pin: address_pin || null,
         monthly_income: monthly_income ? parseFloat(monthly_income) : null,
         income_source: income_source || null,
         existing_debts: !!existing_debts,
         existing_debts_detail: existing_debts_detail || null,
         declaration_agreed: confirm_truth === true && confirm_schedule === true,
         referred_member_id: referredId,
         referred_member_name: referredName,
         status: 'DRAFT_UNASSIGNED'
       };

      // Witness columns are added by the version-history migration. Keep the
      // live legacy schema working while preserving them automatically once
      // that migration is present.
       const { error: detailSchemaError } = await supabase
         .from('loan_requests')
         .select('application_reference, applicant_father_name, applicant_occupation, applicant_employer_name, declaration_truth_confirmed, declaration_schedule_confirmed, witness1_name, witness1_phone, witness1_member_no, witness1_status, witness2_name, witness2_phone, witness2_member_no, witness2_status, witnesses')
         .limit(1);
       if (!detailSchemaError) {
         Object.assign(requestPayload, {
           application_reference: reference,
           applicant_father_name: father_name || null,
           applicant_occupation: occupation || null,
           applicant_employer_name: employer_name || null,
           declaration_truth_confirmed: confirm_truth === true,
           declaration_schedule_confirmed: confirm_schedule === true,
           witness1_name: witness1_name || null,
           witness1_phone: witness1_phone || null,
           witness1_member_no: witness1_member_no || null,
           witness2_name: witness2_name || null,
           witness2_phone: witness2_phone || null,
           witness2_member_no: witness2_member_no || null,
           witnesses: [
             { name: witness1_name || null, phone: witness1_phone || null, member_no: witness1_member_no || null, status: null, verified_at: null },
             { name: witness2_name || null, phone: witness2_phone || null, member_no: witness2_member_no || null, status: null, verified_at: null }
           ]
         });
       }

      const { data: reqData, error: reqErr } = await supabase
        .from('loan_requests')
        .insert([requestPayload])
        .select();

      if (reqErr) {
        console.error('loan_requests insert error:', reqErr.message);
        throw new Error('Failed to save application: ' + reqErr.message);
      }

      // Keep the original application snapshot separate from later member
      // edits when the version-history migration is installed. This is
      // intentionally non-blocking so legacy deployments can still accept
      // public applications before the migration is applied.
      if (reqData?.[0]?.id) {
        const original = reqData[0];
        const originalData = {
          applicant_name: original.applicant_name || original.requester_name || null,
          applicant_phone: original.applicant_phone || original.requester_phone || null,
          applicant_whatsapp: original.applicant_whatsapp || null,
          applicant_dob: original.applicant_dob || null,
          applicant_gender: original.applicant_gender || null,
          applicant_address_house: original.applicant_address_house || null,
          applicant_address_street: original.applicant_address_street || null,
          applicant_address_city: original.applicant_address_city || null,
          applicant_address_pin: original.applicant_address_pin || null,
          requester_address: original.requester_address || null,
          applicant_father_name: original.applicant_father_name || null,
          applicant_occupation: original.applicant_occupation || null,
          applicant_employer_name: original.applicant_employer_name || null,
          loan_amount_requested: original.loan_amount_requested ?? original.approximate_amount ?? null,
          loan_purpose_category: original.loan_purpose_category || null,
          repayment_period_months: original.repayment_period_months || null,
          monthly_income: original.monthly_income ?? null,
          income_source: original.income_source || null,
          existing_debts: original.existing_debts || false,
          existing_debts_detail: original.existing_debts_detail || null,
          loan_purpose_detail: original.loan_purpose_detail || null,
          witness1_name: original.witness1_name || null,
          witness1_phone: original.witness1_phone || null,
          witness1_status: original.witness1_status || null,
          witness2_name: original.witness2_name || null,
          witness2_phone: original.witness2_phone || null,
          witness2_status: original.witness2_status || null,
          witnesses: original.witnesses || []
        };
        const { error: versionError } = await supabase.from('loan_application_versions').insert({
          loan_request_id: original.id,
          application_version: 1,
          edited_by: null,
          editor_role: 'applicant',
          previous_data: originalData,
          updated_data: originalData,
          changed_fields: [],
          edit_reason: 'Original submission'
        });
        if (versionError && versionError.code !== 'PGRST205' && versionError.code !== '23505') {
          console.warn('Original application history snapshot failed:', versionError.message);
        }
      }

      // Notify the referred member after the request has been durably saved.
      // A notification failure must not make the applicant retry and create a
      // duplicate application.
      if (referredId && reqData?.[0]?.id) {
        const { error: notificationError } = await supabase.from('notifications').insert({
          user_id: referredId,
          title: 'New application received',
          message: `A new loan application was submitted through your referral link. Reference: ${reference}`,
          link_url: '/member/dashboard/inbox'
        });
        if (notificationError) console.warn('Referral notification insert failed:', notificationError.message);
      }

      return res.status(200).json({ success: true, reference, record: reqData ? reqData[0] : null });
    }

    // Formal member submission must be authenticated and must own the source request.
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Unauthenticated' });
    if (!source_request_id) return res.status(400).json({ error: 'Source request is required' });
      const { data: sourceRequest, error: sourceError } = await supabase
        .from('loan_requests')
        .select('*')
      .eq('id', source_request_id)
      .maybeSingle();
    if (sourceError) {
      console.error('Source request lookup failed:', sourceError);
      return res.status(500).json({ error: 'Unable to verify the source request.' });
    }
    if (!sourceRequest || sourceRequest.referred_member_id !== user.id) {
      return res.status(403).json({ error: 'You may only submit your own referred applications' });
    }
    if (sourceRequest.status === 'DISMISSED') {
      return res.status(409).json({ error: 'This request was dismissed and cannot be submitted.' });
    }
    if (sourceRequest.status === 'CONVERTED' || sourceRequest.converted_to_loan_id) {
      return res.status(409).json({ error: 'This request has already been submitted to Admin.' });
    }

    const recommendedAmount = Number(amount);
    const repaymentMonths = Number(months);
    const relationshipValue = String(relationship || '').trim();
    const assessmentNotes = String(member_notes || '').trim();
    if (!Number.isFinite(recommendedAmount) || recommendedAmount <= 0) {
      return res.status(400).json({ error: 'A valid recommended amount is required.' });
    }
    if (!Number.isInteger(repaymentMonths) || repaymentMonths <= 0) {
      return res.status(400).json({ error: 'A valid repayment period is required.' });
    }
    if (!relationshipValue) {
      return res.status(400).json({ error: 'Your relationship to the applicant is required.' });
    }
    if (assessmentNotes.length < 20) {
      return res.status(400).json({ error: 'Member assessment notes must be at least 20 characters.' });
    }

    // Idempotency guard for retries/double-clicks. The production schema has
    // source_request_id on loans; never create a second loan for one inbox row.
    const { data: existingLoan, error: duplicateCheckError } = await supabase
      .from('loans')
      .select('id')
      .eq('source_request_id', source_request_id)
      .maybeSingle();
    if (duplicateCheckError) {
      console.error('Duplicate loan check failed:', duplicateCheckError);
      return res.status(500).json({ error: 'Unable to verify whether this request was already submitted.' });
    }
    if (existingLoan) {
      return res.status(409).json({ error: 'This request has already been submitted to Admin.' });
    }

    // ====================================================================
    // PATH B: Member formally submits an inbox request to admin (loans table)
    // ====================================================================
    const loanNo = 'PYD-IL-2026-' + Math.floor(10000 + Math.random() * 90000);
    const referenceMatch = String(sourceRequest.reason || '').match(/Application Reference:\s*([^\n]+)/i);
    const applicationReference = referenceMatch ? referenceMatch[1].trim() : null;
    const canonicalApplicantName = sourceRequest.applicant_name || sourceRequest.requester_name || nameVal;
    const canonicalApplicantPhone = sourceRequest.applicant_phone || sourceRequest.requester_phone || phoneVal;
    const canonicalApplicantAddress = sourceRequest.requester_address || applicant_address || '';
    const canonicalMonths = Number(sourceRequest.repayment_period_months || months || 12);
    const canonicalPurpose = sourceRequest.loan_purpose_detail || sourceRequest.reason || cleanPurpose;
    const requestSnapshot = {
      status: 'pending',
      source_request_id,
      application_reference: sourceRequest.application_reference || applicationReference,
      referred_member_id: sourceRequest.referred_member_id,
      relationship: relationshipValue,
      member_notes: assessmentNotes,
      recommended_amount: recommendedAmount,
      applicant_name: canonicalApplicantName,
      applicant_phone: canonicalApplicantPhone,
      applicant_whatsapp: sourceRequest.applicant_whatsapp || null,
      applicant_dob: sourceRequest.applicant_dob || null,
      applicant_gender: sourceRequest.applicant_gender || null,
      requester_address: canonicalApplicantAddress,
      applicant_address_house: sourceRequest.applicant_address_house || null,
      applicant_address_street: sourceRequest.applicant_address_street || null,
      applicant_address_city: sourceRequest.applicant_address_city || null,
      applicant_address_pin: sourceRequest.applicant_address_pin || null,
      applicant_father_name: sourceRequest.applicant_father_name || null,
      applicant_occupation: sourceRequest.applicant_occupation || null,
      applicant_employer_name: sourceRequest.applicant_employer_name || null,
      loan_amount_requested: sourceRequest.loan_amount_requested ?? sourceRequest.approximate_amount ?? null,
      loan_purpose_category: sourceRequest.loan_purpose_category || null,
      loan_purpose_detail: sourceRequest.loan_purpose_detail || canonicalPurpose,
      repayment_period_months: canonicalMonths,
      monthly_income: sourceRequest.monthly_income ?? null,
      income_source: sourceRequest.income_source || null,
      existing_debts: !!sourceRequest.existing_debts,
      existing_debts_detail: sourceRequest.existing_debts_detail || null,
      witnesses: sourceRequest.witnesses || [],
      witness1_name: sourceRequest.witness1_name || null,
      witness1_phone: sourceRequest.witness1_phone || null,
      witness1_member_no: sourceRequest.witness1_member_no || null,
      witness1_status: sourceRequest.witness1_status || null,
      witness2_name: sourceRequest.witness2_name || null,
      witness2_phone: sourceRequest.witness2_phone || null,
      witness2_member_no: sourceRequest.witness2_member_no || null,
      witness2_status: sourceRequest.witness2_status || null
    };
    const loanPayload = {
      loan_no: loanNo,
      user_id: user.id,
      name: canonicalApplicantName,
      amount: recommendedAmount,
      purpose: canonicalPurpose,
      purpose_desc: canonicalPurpose,
      months: canonicalMonths,
      status: 'pending',
      submitted_date: new Date().toISOString().slice(0, 10),
      requester_name: canonicalApplicantName,
      requester_phone: canonicalApplicantPhone,
      requester_address: canonicalApplicantAddress,
      repayment_period_months: canonicalMonths,
      loan_amount_requested: recommendedAmount,
      loan_amount_approved: recommendedAmount,
      member_notes: assessmentNotes.slice(0, 220),
      submitted_by_member_id: user.id,
      submission_source: 'MEMBER_INBOX',
      inbox_submission_id: source_request_id,
      source_request_id,
      workflow_status: 'PENDING_COORDINATOR_REVIEW',
      request: requestSnapshot
    };

    // These columns are added by migration 017. Keep the legacy submission
    // path compatible until that migration is installed, then persist the
    // complete canonical application on the same authoritative loan row.
    const { error: loanDetailSchemaError } = await supabase
      .from('loans')
      .select('applicant_name, applicant_phone, application_reference, applicant_dob, applicant_gender, applicant_whatsapp, applicant_address, applicant_address_house, applicant_address_street, applicant_address_city, applicant_address_pin, applicant_father_name, applicant_occupation, applicant_employer_name, loan_purpose_category, existing_debts, existing_debts_detail, monthly_income, income_source, witness1_name, witness1_phone, witness1_member_no, witness1_status, witness1_verified_at, witness2_name, witness2_phone, witness2_member_no, witness2_status, witness2_verified_at, witnesses')
      .limit(1);
    if (!loanDetailSchemaError) {
      Object.assign(loanPayload, {
        applicant_name: canonicalApplicantName,
        applicant_phone: canonicalApplicantPhone,
        application_reference: requestSnapshot.application_reference,
        applicant_dob: requestSnapshot.applicant_dob,
        applicant_gender: requestSnapshot.applicant_gender,
        applicant_whatsapp: requestSnapshot.applicant_whatsapp,
        applicant_address: requestSnapshot.requester_address,
        applicant_address_house: requestSnapshot.applicant_address_house,
        applicant_address_street: requestSnapshot.applicant_address_street,
        applicant_address_city: requestSnapshot.applicant_address_city,
        applicant_address_pin: requestSnapshot.applicant_address_pin,
        applicant_father_name: requestSnapshot.applicant_father_name,
        applicant_occupation: requestSnapshot.applicant_occupation,
        applicant_employer_name: requestSnapshot.applicant_employer_name,
        loan_purpose_category: requestSnapshot.loan_purpose_category,
        existing_debts: requestSnapshot.existing_debts,
        existing_debts_detail: requestSnapshot.existing_debts_detail,
        monthly_income: requestSnapshot.monthly_income,
        income_source: requestSnapshot.income_source,
        witness1_name: requestSnapshot.witness1_name,
        witness1_phone: requestSnapshot.witness1_phone,
        witness1_member_no: requestSnapshot.witness1_member_no,
        witness1_status: requestSnapshot.witness1_status,
        witness2_name: requestSnapshot.witness2_name,
        witness2_phone: requestSnapshot.witness2_phone,
        witness2_member_no: requestSnapshot.witness2_member_no,
        witness2_status: requestSnapshot.witness2_status,
        witnesses: requestSnapshot.witnesses
      });
    }
    const { data: insertedRows, error: loanError } = await supabase
      .from('loans')
      .insert([loanPayload])
      .select();
    if (loanError || !insertedRows?.[0]) {
      console.error('Member loan submission insert failed:', loanError);
      const safeCode = loanError?.code ? ` (${loanError.code})` : '';
      return res.status(500).json({ error: `Unable to submit the application to Admin.${safeCode}` });
    }
    const insertedLoan = insertedRows[0];

    // Update loan_requests if source_request_id is provided
    if (source_request_id) {
      try {
        const { data: convertedRequest, error: requestUpdateError } = await supabase
          .from('loan_requests')
          .update({
            status: 'CONVERTED',
            converted_to_loan_id: insertedLoan.id
          })
          .eq('id', source_request_id)
          .eq('referred_member_id', user.id)
          .eq('status', 'DRAFT_UNASSIGNED')
          .is('converted_to_loan_id', null)
          .select('id');
        if (requestUpdateError || !convertedRequest?.length) {
          console.error('Source request conversion failed:', requestUpdateError || 'request already changed');
          await supabase.from('loans').delete().eq('id', insertedLoan.id);
          return res.status(409).json({ error: 'This request was changed by another submission. No duplicate was created.' });
        }
      } catch (updErr) {
        console.error('Source request conversion failed:', updErr);
        await supabase.from('loans').delete().eq('id', insertedLoan.id);
        return res.status(500).json({ error: 'The loan was saved but the inbox request could not be updated.' });
      }
    }

    // Notify admins after the loan is visible in the admin review queue.
    const { data: admins, error: adminLookupError } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'super']);
    if (!adminLookupError && admins?.length) {
      const { error: adminNotificationError } = await supabase.from('notifications').insert(
        admins.map(admin => ({
          user_id: admin.id,
          title: 'New loan application for review',
          message: `${nameVal} submitted a referred loan application for Admin review.`,
          link_url: '/admin/dashboard/loans'
        }))
      );
      if (adminNotificationError) console.warn('Admin notification insert failed:', adminNotificationError.message);
    }

    return res.status(200).json({ success: true, loan: insertedLoan });
  } catch (err) {
    console.error('Error in submit-loan-application handler:', err);
    return res.status(500).json({ error: 'Unable to complete the loan application.' });
  }
}
