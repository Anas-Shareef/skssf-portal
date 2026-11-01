if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = supabaseUrl && serviceKey
  ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  : null;

const genericMessage = 'If the application details match, a verification code has been sent to the registered mobile number.';
const cleanReference = value => String(value || '').trim().toUpperCase().slice(0, 80);
const normalizePhone = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};
const ipAddress = req => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
const hash = value => crypto.createHash('sha256').update(`${process.env.APPLICANT_TRACKING_SECRET || 'missing-secret'}:${value}`).digest('hex');
const randomOtp = () => crypto.randomInt(100000, 1000000).toString();
const randomToken = () => `trk_${crypto.randomBytes(32).toString('hex')}`;

const ageSafeDate = value => value ? String(value).slice(0, 10) : null;

const witnessesFor = request => {
  if (Array.isArray(request?.witnesses) && request.witnesses.length) {
    return request.witnesses.map((witness, index) => ({
      name: witness.name || null,
      phone: witness.phone || null,
      member_no: witness.member_no || null,
      status: witness.status || request[`witness${index + 1}_status`] || null,
      verified_at: witness.verified_at || request[`witness${index + 1}_verified_at`] || null
    })).filter(witness => witness.name || witness.phone || witness.member_no);
  }
  return [1, 2].map(index => ({
    name: request?.[`witness${index}_name`] || null,
    phone: request?.[`witness${index}_phone`] || null,
    member_no: request?.[`witness${index}_member_no`] || null,
    status: request?.[`witness${index}_status`] || null,
    verified_at: request?.[`witness${index}_verified_at`] || null
  })).filter(witness => witness.name || witness.phone || witness.member_no);
};

const applicantStatus = (request, loan) => {
  if (request?.status === 'DISMISSED') return { code: 'CANCELLED', label: 'Cancelled', stage: 'cancelled' };
  if (!loan) return { code: 'UNDER_MEMBER_REVIEW', label: 'Under Member Review', stage: 'member' };
  const workflow = loan.workflow_status;
  if (loan.disbursement_date) return { code: 'DISBURSED', label: 'Disbursed', stage: 'disbursed' };
  if (workflow === 'REPAYMENT_COMPLETE') return { code: 'REPAYMENT_COMPLETE', label: 'Repayment Complete', stage: 'disbursed' };
  if (loan.status === 'approved' || workflow === 'APPROVED') return { code: 'APPROVED', label: 'Approved', stage: 'decision' };
  if (loan.status === 'rejected' || String(workflow || '').startsWith('REJECTED')) return { code: 'REJECTED', label: 'Rejected', stage: 'decision' };
  if (workflow === 'PENDING_APPROVAL_PANEL') return { code: 'UNDER_SUPERADMIN_REVIEW', label: 'Under Super Admin Review', stage: 'superadmin' };
  if (workflow === 'PENDING_COORDINATOR_REVIEW') return { code: 'UNDER_ADMIN_REVIEW', label: 'Under Admin Review', stage: 'admin' };
  return { code: 'FORWARDED_TO_ADMIN', label: 'Forwarded to Admin', stage: 'admin' };
};

const safeApplication = (request, loan) => {
  const status = applicantStatus(request, loan);
  return {
    reference: request.application_reference,
    applicant: {
      name: request.applicant_name || request.requester_name || null,
      phone: request.applicant_phone || request.requester_phone || null,
      whatsapp: request.applicant_whatsapp || null,
      dob: ageSafeDate(request.applicant_dob),
      gender: request.applicant_gender || null,
      father_name: request.applicant_father_name || null,
      address: request.requester_address || null,
      address_house: request.applicant_address_house || null,
      address_street: request.applicant_address_street || null,
      address_city: request.applicant_address_city || null,
      address_pin: request.applicant_address_pin || null
    },
    loan: {
      requested_amount: request.loan_amount_requested ?? request.approximate_amount ?? null,
      repayment_period_months: request.repayment_period_months || null,
      monthly_income: request.monthly_income ?? null,
      income_source: request.income_source || null,
      existing_debts: request.existing_debts ?? false,
      existing_debts_detail: request.existing_debts_detail || null,
      purpose_category: request.loan_purpose_category || null,
      purpose_details: request.loan_purpose_detail || null,
      occupation: request.applicant_occupation || null,
      employer: request.applicant_employer_name || null
    },
    witnesses: witnessesFor(request),
    status,
    submitted_at: request.created_at,
    updated_at: request.last_edited_at || loan?.updated_at || request.updated_at || request.created_at,
    current_version: request.application_version || 1,
    editable: request.status === 'DRAFT_UNASSIGNED' && !loan
  };
};

const loadRequestByReference = async reference => {
  const result = await supabase
    .from('loan_requests')
    .select('*')
    .eq('application_reference', reference)
    .maybeSingle();
  return result;
};

const phoneMatches = (request, phone) => {
  const normalized = normalizePhone(phone);
  return normalized.length === 10 && [request.applicant_phone, request.requester_phone]
    .map(normalizePhone)
    .some(value => value === normalized);
};

const sendSms = async (phone, reference, otp) => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !authToken || !from) return false;
  const body = new URLSearchParams({
    To: process.env.TWILIO_DEFAULT_COUNTRY_CODE === '91' ? `+91${phone}` : `+${process.env.TWILIO_DEFAULT_COUNTRY_CODE || '91'}${phone}`,
    From: from,
    Body: `SKSSF verification code for ${reference}: ${otp}. It expires in 10 minutes. Do not share this code.`
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${authToken}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  return response.ok;
};

const sessionRequest = async token => {
  if (!token || !token.startsWith('trk_')) return null;
  const tokenHash = hash(token);
  const { data: session, error } = await supabase
    .from('applicant_tracking_sessions')
    .select('token_hash, loan_request_id, expires_at')
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !session) return null;
  await supabase.from('applicant_tracking_sessions').update({ last_used_at: new Date().toISOString() }).eq('token_hash', tokenHash);
  const { data: request } = await supabase.from('loan_requests').select('*').eq('id', session.loan_request_id).maybeSingle();
  if (!request) return null;
  return { request, tokenHash };
};

const safeError = error => {
  console.error('Applicant tracking database failure:', error?.code || 'unknown');
  return 'Applicant tracking is temporarily unavailable.';
};

const maskedPhone = last4 => (last4 ? `••••••${String(last4).slice(-4)}` : null);

const witnessTokenPattern = /^wv_[A-Za-z0-9_-]{20,}$/;

const loadWitnessByToken = async token => {
  const { data, error } = await supabase
    .from('witness_verifications')
    .select('*')
    .eq('token_hash', hash(token))
    .maybeSingle();
  return { row: data, error };
};

const witnessApplication = async requestId => {
  const { data } = await supabase
    .from('loan_requests')
    .select('application_reference, applicant_name, requester_name')
    .eq('id', requestId)
    .maybeSingle();
  return {
    reference: data?.application_reference || null,
    applicantName: data?.applicant_name || data?.requester_name || null
  };
};

const witnessProgressFor = (request, verifications) => {
  const latest = new Map();
  for (const row of verifications || []) {
    if (!latest.has(row.witness_index)) latest.set(row.witness_index, row);
  }
  const rows = [1, 2].map(index => {
    const row = latest.get(index);
    const fallbackStatus = request?.[`witness${index}_status`] || null;
    const name = request?.[`witness${index}_name`] || null;
    return {
      index,
      name,
      status: row?.status || fallbackStatus || (name ? 'PENDING' : null),
      issuedAt: row?.issued_at || null,
      expiresAt: row?.expires_at || null,
      respondedAt: row?.responded_at || request?.[`witness${index}_verified_at`] || null,
      sharedAt: row?.shared_at || null
    };
  }).filter(row => row.name || row.status);

  const verifiedCount = rows.filter(row => row.status === 'VERIFIED').length;
  const requiredCount = rows.length;
  let overall = 'WAITING';
  if (rows.some(row => row.status === 'DECLINED')) overall = 'DECLINED';
  else if (requiredCount > 0 && verifiedCount >= requiredCount) overall = 'ALL_VERIFIED';
  else if (verifiedCount > 0) overall = 'PARTIALLY_VERIFIED';
  else if (rows.some(row => row.status === 'EXPIRED' || row.status === 'REVOKED')) overall = 'EXPIRED';

  return { overall, verifiedCount, requiredCount, witnesses: rows };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabase || !process.env.APPLICANT_TRACKING_SECRET) return res.status(503).json({ error: 'Applicant tracking verification is not configured.' });

  const { action } = req.body || {};
  try {
    // ================================================================
    // Witness verification (link-based consent, no applicant session)
    // ================================================================
    if (action === 'witness_view') {
      const token = String(req.body.token || '').trim();
      if (!witnessTokenPattern.test(token)) return res.status(404).json({ error: 'This witness verification link is not valid.' });

      const { row, error } = await loadWitnessByToken(token);
      if (error) {
        if (['PGRST205', '42P01'].includes(error.code)) return res.status(503).json({ error: 'Witness verification is not enabled yet.' });
        return res.status(503).json({ error: safeError(error) });
      }
      if (!row) return res.status(404).json({ error: 'This witness verification link is not valid.' });

      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const { count: viewCount } = await supabase
        .from('witness_verification_events')
        .select('id', { count: 'exact', head: true })
        .eq('verification_id', row.id)
        .eq('event_type', 'VIEWED')
        .gte('created_at', hourAgo);
      if ((viewCount || 0) >= 60) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });

      let status = row.status;
      if (status === 'PENDING' && new Date(row.expires_at).getTime() <= now.getTime()) {
        status = 'EXPIRED';
        await supabase
          .from('witness_verifications')
          .update({ status: 'EXPIRED', last_activity_at: now.toISOString() })
          .eq('id', row.id)
          .eq('status', 'PENDING');
        await supabase.from('witness_verification_events').insert({
          verification_id: row.id,
          loan_request_id: row.loan_request_id,
          event_type: 'EXPIRED',
          actor_type: 'system',
          metadata: {}
        });
      }

      if (!row.first_viewed_at) {
        await supabase
          .from('witness_verifications')
          .update({ first_viewed_at: now.toISOString(), last_activity_at: now.toISOString() })
          .eq('id', row.id)
          .is('first_viewed_at', null);
        await supabase.from('witness_verification_events').insert({
          verification_id: row.id,
          loan_request_id: row.loan_request_id,
          event_type: 'VIEWED',
          actor_type: 'witness',
          metadata: { ip_hash: hash(ipAddress(req)) }
        });
      }

      const application = await witnessApplication(row.loan_request_id);
      return res.status(200).json({
        success: true,
        witness: {
          index: row.witness_index,
          name: row.witness_name || null,
          maskedPhone: maskedPhone(row.witness_phone_last4),
          status,
          issuedAt: row.issued_at,
          expiresAt: row.expires_at,
          respondedAt: row.responded_at,
          responseNote: row.response_note || null
        },
        application,
        consentNotice: 'This link records your consent response. It does not independently prove that the WhatsApp number belongs to you.'
      });
    }

    if (action === 'witness_respond') {
      const token = String(req.body.token || '').trim();
      const decision = String(req.body.decision || '').trim().toUpperCase();
      const note = String(req.body.note || '').trim().slice(0, 500);
      if (!witnessTokenPattern.test(token)) return res.status(404).json({ error: 'This witness verification link is not valid.' });
      if (!['VERIFIED', 'DECLINED'].includes(decision)) return res.status(400).json({ error: 'Choose to agree or decline.' });

      const { row, error } = await loadWitnessByToken(token);
      if (error) {
        if (['PGRST205', '42P01'].includes(error.code)) return res.status(503).json({ error: 'Witness verification is not enabled yet.' });
        return res.status(503).json({ error: safeError(error) });
      }
      if (!row) return res.status(404).json({ error: 'This witness verification link is not valid.' });
      if (row.status !== 'PENDING') {
        return res.status(409).json({ error: 'This verification link has already been used.', status: row.status });
      }

      const { data, error: respondError } = await supabase.rpc('respond_witness_verification', {
        p_token_hash: hash(token),
        p_decision: decision,
        p_note: note || null
      });
      if (respondError) {
        if (['PGRST202', '42883'].includes(respondError.code)) return res.status(503).json({ error: 'Witness verification is not enabled yet.' });
        return res.status(503).json({ error: safeError(respondError) });
      }
      if (!data?.ok) {
        const reason = data?.reason;
        if (reason === 'expired') return res.status(410).json({ error: 'This verification link has expired.', status: 'EXPIRED' });
        if (reason === 'already_processed') return res.status(409).json({ error: 'This verification link has already been used.', status: data?.status });
        if (reason === 'not_found') return res.status(404).json({ error: 'This witness verification link is not valid.' });
        return res.status(400).json({ error: 'Unable to record the witness response.' });
      }

      const application = await witnessApplication(row.loan_request_id);
      return res.status(200).json({
        success: true,
        status: data.status,
        respondedAt: data.responded_at,
        application
      });
    }

    if (action === 'send') {
      const reference = cleanReference(req.body.reference);
      const phone = normalizePhone(req.body.phone);
      if (!reference || phone.length !== 10) return res.status(400).json({ error: 'Enter a valid reference and mobile number.' });
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_NUMBER) return res.status(503).json({ error: 'Applicant SMS verification is not configured yet.' });

      const ipHash = hash(ipAddress(req));
      const phoneHash = hash(phone);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: ipCount, error: rateError } = await supabase.from('applicant_tracking_challenges').select('id', { count: 'exact', head: true }).eq('request_ip_hash', ipHash).gte('created_at', hourAgo);
      if (rateError) return res.status(503).json({ error: safeError(rateError) });
      if ((ipCount || 0) >= 5) return res.status(429).json({ error: 'Too many verification requests. Please try again later.' });
      const { count: phoneCount, error: phoneRateError } = await supabase.from('applicant_tracking_challenges').select('id', { count: 'exact', head: true }).eq('phone_hash', phoneHash).gte('created_at', hourAgo);
      if (phoneRateError) return res.status(503).json({ error: safeError(phoneRateError) });
      if ((phoneCount || 0) >= 5) return res.status(429).json({ error: 'Too many verification requests. Please try again later.' });

      const { data: request, error: requestError } = await loadRequestByReference(reference);
      if (requestError) return res.status(503).json({ error: safeError(requestError) });
      if (!request || !phoneMatches(request, phone)) return res.status(200).json({ success: true, message: genericMessage });

      const otp = randomOtp();
      const { data: challenge, error: challengeError } = await supabase.from('applicant_tracking_challenges').insert({
        loan_request_id: request.id,
        phone_hash: phoneHash,
        otp_hash: hash(otp),
        request_ip_hash: ipHash,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      }).select('id').single();
      if (challengeError || !challenge) return res.status(503).json({ error: safeError(challengeError) });
      if (!await sendSms(phone, reference, otp)) {
        await supabase.from('applicant_tracking_challenges').delete().eq('id', challenge.id);
        return res.status(503).json({ error: 'Applicant SMS verification is temporarily unavailable.' });
      }
      return res.status(200).json({ success: true, message: genericMessage });
    }

    if (action === 'verify') {
      const reference = cleanReference(req.body.reference);
      const phone = normalizePhone(req.body.phone);
      const otp = String(req.body.otp || '').trim();
      if (!reference || phone.length !== 10 || !/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Invalid verification details.' });
      const { data: request, error: requestError } = await loadRequestByReference(reference);
      if (requestError || !request || !phoneMatches(request, phone)) return res.status(401).json({ error: 'Verification failed.' });
      const { data: challenges, error: challengeError } = await supabase.from('applicant_tracking_challenges').select('id, otp_hash, attempts, max_attempts').eq('loan_request_id', request.id).eq('phone_hash', hash(phone)).is('consumed_at', null).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
      if (challengeError || !challenges?.[0]) return res.status(401).json({ error: 'Verification failed or expired.' });
      const challenge = challenges[0];
      if (challenge.attempts >= challenge.max_attempts) return res.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });
      if (hash(otp) !== challenge.otp_hash) {
        await supabase.from('applicant_tracking_challenges').update({ attempts: challenge.attempts + 1 }).eq('id', challenge.id).eq('attempts', challenge.attempts);
        return res.status(401).json({ error: 'Verification failed or expired.' });
      }
      await supabase.from('applicant_tracking_challenges').update({ consumed_at: new Date().toISOString() }).eq('id', challenge.id).is('consumed_at', null);
      const token = randomToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error: sessionError } = await supabase.from('applicant_tracking_sessions').insert({ token_hash: hash(token), loan_request_id: request.id, expires_at: expiresAt });
      if (sessionError) return res.status(503).json({ error: safeError(sessionError) });
      return res.status(200).json({ success: true, sessionToken: token, expiresAt });
    }

    const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    const session = await sessionRequest(bearer || req.body.sessionToken);
    if (!session) return res.status(401).json({ error: 'Tracking session expired. Verify again.' });
    const { request } = session;
    const { data: loan } = await supabase.from('loans').select('workflow_status,status,updated_at,created_at,disbursement_date,source_request_id').eq('source_request_id', request.id).maybeSingle();

    if (action === 'details') {
      const { data: versions, error: versionsError } = await supabase.from('loan_application_versions').select('application_version,editor_role,editor_identifier,changed_fields,previous_data,updated_data,edit_reason,created_at').eq('loan_request_id', request.id).order('application_version', { ascending: true });
      const { data: events, error: eventsError } = await supabase.from('application_status_events').select('status_code,actor_type,applicant_visible_note,created_at').eq('loan_request_id', request.id).order('created_at', { ascending: true });
      const { data: verifications, error: verificationError } = await supabase
        .from('witness_verifications')
        .select('witness_index,status,issued_at,expires_at,responded_at,shared_at,revoked_at')
        .eq('loan_request_id', request.id)
        .order('issued_at', { ascending: false });
      if (versionsError && versionsError.code !== 'PGRST205') return res.status(503).json({ error: safeError(versionsError) });
      if (eventsError && eventsError.code !== 'PGRST205') return res.status(503).json({ error: safeError(eventsError) });
      const witnessRows = verificationError && !['PGRST205', '42P01'].includes(verificationError.code) ? [] : (verifications || []);
      return res.status(200).json({
        success: true,
        application: safeApplication(request, loan),
        history: versions || [],
        events: events || [],
        witnessProgress: witnessProgressFor(request, witnessRows)
      });
    }

    if (action === 'edit') {
      if (request.status !== 'DRAFT_UNASSIGNED' || loan) return res.status(409).json({ error: 'Application editing is locked after forwarding.' });
      const expectedVersion = Number(req.body.expectedVersion);
      const changes = req.body.changes;
      if (!Number.isInteger(expectedVersion) || !changes || typeof changes !== 'object' || Array.isArray(changes)) return res.status(400).json({ error: 'Invalid application update.' });
      const allowed = ['applicant_name', 'applicant_phone', 'applicant_whatsapp', 'applicant_dob', 'applicant_gender', 'requester_address', 'applicant_address_house', 'applicant_address_street', 'applicant_address_city', 'applicant_address_pin', 'applicant_father_name', 'applicant_occupation', 'applicant_employer_name', 'loan_amount_requested', 'loan_purpose_category', 'loan_purpose_detail', 'repayment_period_months', 'monthly_income', 'income_source', 'existing_debts', 'existing_debts_detail', 'witnesses'];
      if (Object.keys(changes).some(field => !allowed.includes(field))) return res.status(400).json({ error: 'An application field is not editable.' });
      if (!Array.isArray(changes.witnesses) || changes.witnesses.length < 2 || changes.witnesses.some(w => String(w?.name || '').trim().length < 3 || !/^\d{10}$/.test(String(w?.phone || '').replace(/\D/g, '')))) return res.status(400).json({ error: 'Two valid witnesses are required.' });
      if (!Number.isFinite(Number(changes.loan_amount_requested)) || Number(changes.loan_amount_requested) < 1000 || Number(changes.loan_amount_requested) > 50000) return res.status(400).json({ error: 'Requested amount is invalid.' });
      if (!Number.isInteger(Number(changes.repayment_period_months)) || Number(changes.repayment_period_months) <= 0) return res.status(400).json({ error: 'Repayment period is invalid.' });
      if (!Number.isFinite(Number(changes.monthly_income)) || Number(changes.monthly_income) < 1000) return res.status(400).json({ error: 'Monthly income is invalid.' });
      if (String(changes.loan_purpose_detail || '').trim().length < 20) return res.status(400).json({ error: 'Purpose details must be at least 20 characters.' });
      const normalizedChanges = { ...changes,
        applicant_phone: String(changes.applicant_phone || '').replace(/\D/g, ''),
        applicant_whatsapp: changes.applicant_whatsapp ? String(changes.applicant_whatsapp).replace(/\D/g, '') : '',
        loan_amount_requested: Number(changes.loan_amount_requested),
        repayment_period_months: Number(changes.repayment_period_months),
        monthly_income: Number(changes.monthly_income),
        existing_debts: changes.existing_debts === true || changes.existing_debts === 'true',
        witnesses: changes.witnesses.map(w => ({ name: String(w.name || '').trim(), phone: String(w.phone || '').replace(/\D/g, ''), member_no: String(w.member_no || '').trim() }))
      };
      const { data: edit, error: editError } = await supabase.rpc('apply_applicant_loan_request_edit', { p_request_id: request.id, p_expected_version: expectedVersion, p_changes: normalizedChanges, p_editor_identifier: 'Verified applicant', p_edit_reason: String(req.body.editReason || '').trim().slice(0, 500) || null });
      if (editError) {
        const status = ['40001', '55000'].includes(editError.code) ? 409 : editError.code === 'PGRST202' ? 503 : 500;
        return res.status(status).json({ error: status === 409 ? (editError.code === '55000' ? 'Application editing is locked after forwarding.' : 'This application was updated elsewhere. Refresh and try again.') : status === 503 ? 'Applicant editing is not enabled yet.' : 'Unable to save application changes.' });
      }
      return res.status(200).json({
        success: true,
        edit: {
          application_version: edit?.application_version,
          changed_fields: edit?.changed_fields || [],
          last_edited_at: edit?.last_edited_at
        }
      });
    }

    return res.status(400).json({ error: 'Invalid tracking action.' });
  } catch (error) {
    console.error('Applicant tracking handler failure:', error?.code || error?.message || 'unknown');
    return res.status(500).json({ error: 'Applicant tracking is temporarily unavailable.' });
  }
}
