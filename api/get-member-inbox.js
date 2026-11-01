if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

const asTrimmed = (value) => value === null || value === undefined ? '' : String(value).trim();

const ageFromDate = (value) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const month = now.getUTCMonth() - date.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
};

const requestWitnesses = (request) => {
  if (Array.isArray(request?.witnesses) && request.witnesses.length) return request.witnesses.map((witness, index) => ({
    ...witness,
    status: witness.status || request[`witness${index + 1}_status`] || null,
    verified_at: witness.verified_at || request[`witness${index + 1}_verified_at`] || null
  }));
  const result = [];
  if (request?.witness1_name || request?.witness1_phone) result.push({ name: request.witness1_name || '', phone: request.witness1_phone || '', member_no: request.witness1_member_no || '', status: request.witness1_status || null, verified_at: request.witness1_verified_at || null });
  if (request?.witness2_name || request?.witness2_phone) result.push({ name: request.witness2_name || '', phone: request.witness2_phone || '', member_no: request.witness2_member_no || '', status: request.witness2_status || null, verified_at: request.witness2_verified_at || null });
  return result;
};

const WITNESS_TOKEN_TTL_DAYS = 7;
const witnessToken = () => `wv_${crypto.randomBytes(32).toString('base64url')}`;
const witnessTokenHash = token => crypto.createHash('sha256').update(`${process.env.APPLICANT_TRACKING_SECRET || 'missing-secret'}:${token}`).digest('hex');
const maskPhone = value => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 4 ? `••••••${digits.slice(-4)}` : null;
};
const requestOrigin = req => {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'skssf-portal.vercel.app').split(',')[0].trim();
  return `${proto}://${host}`;
};

const witnessActionNames = ['witness_status', 'witness_link', 'witness_shared'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabase) {
    console.error('Member inbox is unavailable: Supabase server credentials are not configured.');
    return res.status(500).json({ error: 'Member inbox is temporarily unavailable.' });
  }

  // 1. Authenticate member via bearer token
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Unauthenticated' });

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) return res.status(401).json({ error: 'Unauthenticated' });

  // 2. Fetch member profile
  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .select('id, name, role, member_unique_code, code')
    .eq('id', user.id)
    .maybeSingle();

  if (profError) {
    console.error('Member inbox profile lookup failed:', profError);
    return res.status(500).json({ error: 'Unable to verify member access.' });
  }
  if (!profile) return res.status(403).json({ error: 'Forbidden - No portal profile' });

  const memberId = profile.id;
  const isAdmin = profile.role === 'admin' || profile.role === 'super';

  if (req.method === 'POST') {
    const { action, dismissalReason } = req.body || {};
    const allowedActions = ['review', 'dismiss', 'history', 'edit', ...witnessActionNames];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ error: 'Invalid request action' });
    }

    // Witness actions may target a filed loan; resolve its source request.
    let requestId = req.body?.requestId || null;
    if (!requestId && req.body?.loanId) {
      const { data: loanRow, error: loanLookupError } = await supabase
        .from('loans')
        .select('id, source_request_id, submitted_by_member_id')
        .eq('id', req.body.loanId)
        .maybeSingle();
      if (loanLookupError) {
        console.error('Member witness loan lookup failed:', loanLookupError);
        return res.status(500).json({ error: 'Unable to verify the filed application.' });
      }
      if (!loanRow) return res.status(404).json({ error: 'Application not found.' });
      if (!isAdmin && loanRow.submitted_by_member_id !== memberId) return res.status(403).json({ error: 'Forbidden' });
      requestId = loanRow.source_request_id;
    }
    if (!requestId) return res.status(400).json({ error: 'Invalid request action' });

    const { data: request, error: requestError } = await supabase
      .from('loan_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (requestError) {
      console.error('Member inbox ownership lookup failed:', requestError);
      return res.status(500).json({ error: 'Unable to verify request ownership.' });
    }
    if (!request || (!isAdmin && request.referred_member_id !== memberId)) return res.status(403).json({ error: 'Forbidden' });

    // ================================================================
    // Witness verification management (member / admin / super)
    // ================================================================
    if (witnessActionNames.includes(action)) {
      const { data: verificationRows, error: verificationError } = await supabase
        .from('witness_verifications')
        .select('*')
        .eq('loan_request_id', requestId)
        .order('issued_at', { ascending: false });
      if (verificationError) {
        if (['PGRST205', '42P01'].includes(verificationError.code)) {
          return res.status(503).json({ error: 'Witness verification is not enabled yet.' });
        }
        console.error('Witness verification lookup failed:', verificationError);
        return res.status(500).json({ error: 'Unable to load witness verification records.' });
      }

      const latestByIndex = new Map();
      for (const row of verificationRows || []) {
        if (!latestByIndex.has(row.witness_index)) latestByIndex.set(row.witness_index, row);
      }
      const canonical = requestWitnesses(request);

      const summarise = () => [1, 2].map(index => {
        const row = latestByIndex.get(index);
        const witness = canonical[index - 1] || {};
        const status = row?.status || witness.status || (witness.name ? 'PENDING' : null);
        return {
          index,
          name: row?.witness_name || witness.name || null,
          maskedPhone: row?.witness_phone_last4 ? maskPhone(row.witness_phone_last4) : maskPhone(witness.phone),
          relationship: witness.relationship || null,
          memberNo: witness.member_no || null,
          status,
          hasActiveLink: !!row && row.status === 'PENDING' && new Date(row.expires_at).getTime() > Date.now(),
          issuedAt: row?.issued_at || null,
          expiresAt: row?.expires_at || null,
          firstViewedAt: row?.first_viewed_at || null,
          respondedAt: row?.responded_at || witness.verified_at || null,
          sharedAt: row?.shared_at || null,
          shareChannel: row?.share_channel || null,
          revokedAt: row?.revoked_at || null,
          revokedReason: row?.revoked_reason || null,
          responseNote: row?.response_note || null
        };
      }).filter(witness => witness.name || witness.status);

      if (action === 'witness_status') {
        const { data: events } = await supabase
          .from('witness_verification_events')
          .select('id, verification_id, event_type, actor_type, metadata, created_at')
          .eq('loan_request_id', requestId)
          .order('created_at', { ascending: false })
          .limit(60);
        const witnesses = summarise();
        const verifiedCount = witnesses.filter(witness => witness.status === 'VERIFIED').length;
        return res.status(200).json({
          success: true,
          reference: request.application_reference || null,
          applicantName: request.applicant_name || request.requester_name || null,
          witnesses,
          events: events || [],
          progress: {
            verifiedCount,
            requiredCount: witnesses.length,
            overall: witnesses.some(w => w.status === 'DECLINED')
              ? 'DECLINED'
              : witnesses.length > 0 && verifiedCount >= witnesses.length
                ? 'ALL_VERIFIED'
                : verifiedCount > 0
                  ? 'PARTIALLY_VERIFIED'
                  : witnesses.some(w => w.status === 'EXPIRED' || w.status === 'REVOKED')
                    ? 'EXPIRED'
                    : 'WAITING'
          }
        });
      }

      if (action === 'witness_link') {
        const index = Number(req.body?.witnessIndex);
        if (![1, 2].includes(index)) return res.status(400).json({ error: 'A valid witness index is required.' });
        const witness = canonical[index - 1];
        if (!witness?.name || !/^\d{10}$/.test(String(witness.phone || '').replace(/\D/g, ''))) {
          return res.status(400).json({ error: 'This witness does not have a valid name and mobile number.' });
        }

        const token = witnessToken();
        const { data: verificationId, error: issueError } = await supabase.rpc('issue_witness_verification', {
          p_request_id: requestId,
          p_witness_index: index,
          p_token_hash: witnessTokenHash(token),
          p_witness_name: witness.name,
          p_witness_phone_last4: String(witness.phone).replace(/\D/g, '').slice(-4),
          p_created_by: memberId,
          p_ttl: `${WITNESS_TOKEN_TTL_DAYS} days`
        });
        if (issueError) {
          if (['PGRST202', '42883'].includes(issueError.code)) return res.status(503).json({ error: 'Witness verification is not enabled yet.' });
          console.error('Witness link issue failed:', issueError);
          return res.status(500).json({ error: 'Unable to issue a witness verification link.' });
        }

        await supabase.from('witness_verification_events').insert({
          verification_id: verificationId,
          loan_request_id: requestId,
          event_type: 'LINK_PREPARED',
          actor_type: isAdmin ? (profile.role === 'super' ? 'super' : 'admin') : 'member',
          actor_id: memberId,
          metadata: { witness_index: index, channel: 'whatsapp' }
        });

        const expiresAt = new Date(Date.now() + WITNESS_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
        return res.status(200).json({
          success: true,
          link: {
            index,
            name: witness.name,
            phone: witness.phone,
            url: `${requestOrigin(req)}/witness-verify/${token}`,
            expiresAt
          },
          previousLinkRevoked: latestByIndex.get(index)?.status === 'PENDING'
        });
      }

      // action === 'witness_shared'
      const index = Number(req.body?.witnessIndex);
      let verificationId = req.body?.verificationId || (latestByIndex.get(index) || {}).id;
      if (!verificationId) return res.status(400).json({ error: 'No witness verification link has been issued yet.' });
      const { data: sharedOk, error: shareError } = await supabase.rpc('mark_witness_shared', {
        p_verification_id: verificationId,
        p_channel: String(req.body?.channel || 'whatsapp').slice(0, 30),
        p_actor: memberId
      });
      if (shareError) {
        if (['PGRST202', '42883'].includes(shareError.code)) return res.status(503).json({ error: 'Witness verification is not enabled yet.' });
        console.error('Witness share marking failed:', shareError);
        return res.status(500).json({ error: 'Unable to record the share action.' });
      }
      return res.status(200).json({ success: sharedOk === true, deliveryConfirmed: false });
    }

    if (action === 'history') {
      const { data: versions, error: historyError } = await supabase
        .from('loan_application_versions')
        .select('id, loan_request_id, application_version, edited_by, editor_role, previous_data, updated_data, changed_fields, edit_reason, created_at')
        .eq('loan_request_id', requestId)
        .order('application_version', { ascending: true });
      if (historyError) {
        console.error('Application history lookup failed:', historyError);
        return res.status(historyError.code === 'PGRST205' ? 503 : 500).json({ error: historyError.code === 'PGRST205' ? 'Application history is not enabled yet.' : 'Unable to load application history.' });
      }
      const editorIds = [...new Set((versions || []).map(version => version.edited_by).filter(Boolean))];
      let editors = [];
      if (editorIds.length) {
        const { data: editorRows } = await supabase.from('profiles').select('id, name, role').in('id', editorIds);
        editors = editorRows || [];
      }
      const editorMap = new Map(editors.map(editor => [editor.id, editor]));
      return res.status(200).json({
        success: true,
        request: {
          id: request.id,
          status: request.status,
          application_version: request.application_version || 1,
          last_edited_at: request.last_edited_at || null
        },
        versions: (versions || []).map(version => ({
          ...version,
          editor: version.edited_by ? editorMap.get(version.edited_by) || { id: version.edited_by } : null
        }))
      });
    }

    if (action === 'edit') {
      if (isAdmin) return res.status(403).json({ error: 'Administrators can review history but cannot edit member applications.' });
      if (request.status !== 'DRAFT_UNASSIGNED') return res.status(409).json({ error: 'Application editing is locked after submission.' });
      const expectedVersion = Number(req.body?.expectedVersion);
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return res.status(400).json({ error: 'A valid application version is required.' });
      const inputChanges = req.body?.changes;
      if (!inputChanges || typeof inputChanges !== 'object' || Array.isArray(inputChanges)) return res.status(400).json({ error: 'Invalid application changes.' });

      const allowedFields = [
        'applicant_name', 'applicant_phone', 'applicant_whatsapp', 'applicant_dob',
        'applicant_gender', 'requester_address', 'applicant_address_house',
        'applicant_address_street', 'applicant_address_city', 'applicant_address_pin',
        'applicant_father_name', 'applicant_occupation', 'applicant_employer_name',
        'loan_amount_requested', 'loan_purpose_category', 'repayment_period_months',
        'monthly_income', 'income_source', 'existing_debts', 'existing_debts_detail',
        'loan_purpose_detail', 'witnesses', 'witness1_name', 'witness1_phone',
        'witness1_member_no', 'witness2_name', 'witness2_phone', 'witness2_member_no'
      ];
      const changes = {};
      for (const field of Object.keys(inputChanges)) {
        if (!allowedFields.includes(field)) return res.status(400).json({ error: `Field is not editable: ${field}` });
        changes[field] = inputChanges[field];
      }
      if (changes.loan_amount_requested !== undefined && (!Number.isFinite(Number(changes.loan_amount_requested)) || Number(changes.loan_amount_requested) <= 0)) return res.status(400).json({ error: 'Requested amount must be greater than zero.' });
      if (changes.loan_amount_requested !== undefined && Number(changes.loan_amount_requested) > 50000) return res.status(400).json({ error: 'Requested amount exceeds the branch maximum limit.' });
      if (changes.repayment_period_months !== undefined && (!Number.isInteger(Number(changes.repayment_period_months)) || Number(changes.repayment_period_months) <= 0)) return res.status(400).json({ error: 'Repayment period must be a positive whole number.' });
      if (changes.monthly_income !== undefined && (!Number.isFinite(Number(changes.monthly_income)) || Number(changes.monthly_income) < 1000)) return res.status(400).json({ error: 'Monthly income must be at least 1,000.' });
      if (changes.applicant_name !== undefined && asTrimmed(changes.applicant_name).length < 3) return res.status(400).json({ error: 'Applicant name is required.' });
      if (changes.applicant_phone !== undefined && !/^\d{10}$/.test(asTrimmed(changes.applicant_phone))) return res.status(400).json({ error: 'Phone number must contain 10 digits.' });
      if (changes.applicant_whatsapp !== undefined && changes.applicant_whatsapp !== '' && !/^\d{10}$/.test(asTrimmed(changes.applicant_whatsapp))) return res.status(400).json({ error: 'WhatsApp number must contain 10 digits.' });
      if (changes.applicant_dob !== undefined && (ageFromDate(changes.applicant_dob) === null || ageFromDate(changes.applicant_dob) < 18)) return res.status(400).json({ error: 'Applicant must be at least 18 years old.' });
      if (changes.requester_address !== undefined && String(changes.requester_address).trim().length < 5) return res.status(400).json({ error: 'Address is required.' });
      if (changes.applicant_address_pin !== undefined && !/^\d{6}$/.test(asTrimmed(changes.applicant_address_pin))) return res.status(400).json({ error: 'PIN code must contain 6 digits.' });
      if (changes.income_source !== undefined && asTrimmed(changes.income_source).length < 1) return res.status(400).json({ error: 'Source of income is required.' });
      if (changes.loan_purpose_detail !== undefined && String(changes.loan_purpose_detail).trim().length < 20) return res.status(400).json({ error: 'Purpose details must be at least 20 characters.' });

      // Normalize types before passing them to the transactional PostgreSQL
      // function so history JSON reflects the actual stored values.
      if (changes.loan_amount_requested !== undefined) changes.loan_amount_requested = Number(changes.loan_amount_requested);
      if (changes.repayment_period_months !== undefined) changes.repayment_period_months = Number(changes.repayment_period_months);
      if (changes.monthly_income !== undefined && changes.monthly_income !== '') changes.monthly_income = Number(changes.monthly_income);
      if (changes.existing_debts !== undefined) changes.existing_debts = changes.existing_debts === true || changes.existing_debts === 'true';
      for (const field of ['applicant_name', 'applicant_phone', 'applicant_whatsapp', 'applicant_gender', 'requester_address', 'applicant_address_house', 'applicant_address_street', 'applicant_address_city', 'applicant_address_pin', 'applicant_father_name', 'applicant_occupation', 'applicant_employer_name', 'loan_purpose_category', 'income_source', 'existing_debts_detail', 'loan_purpose_detail', 'witness1_name', 'witness1_phone', 'witness1_member_no', 'witness2_name', 'witness2_phone', 'witness2_member_no']) {
        if (changes[field] !== undefined && changes[field] !== null) changes[field] = String(changes[field]).trim();
      }
      if (changes.applicant_dob !== undefined) changes.applicant_dob = changes.applicant_dob ? String(changes.applicant_dob).trim() : null;

      const submittedWitnesses = Array.isArray(inputChanges.witnesses)
        ? inputChanges.witnesses
        : requestWitnesses({
            ...request,
            witness1_name: changes.witness1_name ?? request.witness1_name,
            witness1_phone: changes.witness1_phone ?? request.witness1_phone,
            witness1_member_no: changes.witness1_member_no ?? request.witness1_member_no,
            witness2_name: changes.witness2_name ?? request.witness2_name,
            witness2_phone: changes.witness2_phone ?? request.witness2_phone,
            witness2_member_no: changes.witness2_member_no ?? request.witness2_member_no
          });
      if (!Array.isArray(submittedWitnesses) || submittedWitnesses.length < 2) return res.status(400).json({ error: 'Two witnesses are required.' });
      const existingWitnesses = requestWitnesses(request);
      const witnesses = submittedWitnesses.map((witness, index) => {
        const prior = existingWitnesses[index] || {};
        return {
          name: asTrimmed(witness?.name),
          phone: asTrimmed(witness?.phone),
          member_no: asTrimmed(witness?.member_no),
          // Verification state is server-owned and cannot be changed by edit input.
          status: prior.status || null,
          verified_at: prior.verified_at || null
        };
      });
      for (const witness of witnesses) {
        if (witness.name.length < 3) return res.status(400).json({ error: 'Each witness name is required.' });
        if (!/^\d{10}$/.test(witness.phone)) return res.status(400).json({ error: 'Each witness phone must contain 10 digits.' });
      }
      changes.witnesses = witnesses;
      delete changes.witness1_name;
      delete changes.witness1_phone;
      delete changes.witness1_member_no;
      delete changes.witness2_name;
      delete changes.witness2_phone;
      delete changes.witness2_member_no;

      const { data: editResult, error: editError } = await supabase.rpc('apply_loan_request_edit', {
        p_request_id: requestId,
        p_editor_id: memberId,
        p_expected_version: expectedVersion,
        p_changes: changes,
        p_edit_reason: String(req.body?.editReason || '').trim().slice(0, 500) || null
      });
      if (editError) {
        console.error('Application edit failed:', editError);
        const status = editError.code === 'PGRST202' ? 503 : editError.code === '40001' ? 409 : editError.code === '42501' ? 403 : 500;
        return res.status(status).json({ error: status === 503 ? 'Application editing is not enabled yet.' : status === 409 ? 'This application was edited elsewhere. Refresh and try again.' : status === 403 ? 'Forbidden' : 'Unable to save application changes.' });
      }
      return res.status(200).json({ success: true, edit: editResult });
    }
    if (request.status === 'CONVERTED' || request.status === 'DISMISSED') {
      return res.status(409).json({ error: 'This request is no longer actionable.' });
    }

    // Opening a request is a UI event, not a database status transition.
    // Production loan_requests accepts DRAFT_UNASSIGNED, CONVERTED and
    // DISMISSED; writing REVIEWED here caused the check-constraint 500.
    if (action === 'review') {
      return res.status(200).json({
        success: true,
        request: { id: request.id, status: request.status }
      });
    }

    if (action === 'dismiss' && !String(dismissalReason || '').trim()) {
      return res.status(400).json({ error: 'Dismissal reason is required' });
    }
    const { data, error } = await supabase
      .from('loan_requests')
      .update({
        status: 'DISMISSED',
        dismissal_reason: String(dismissalReason).trim(),
        dismissed_by: memberId
      })
      .eq('id', requestId)
      .eq('referred_member_id', memberId)
      .select('id,status')
      .maybeSingle();
    if (error) {
      console.error('Member inbox dismissal failed:', error);
      return res.status(500).json({ error: 'Unable to update this request.' });
    }
    if (!data) return res.status(403).json({ error: 'Forbidden' });
    return res.status(200).json({ success: true, request: data });
  }

  try {
    // 3. Service-role query with an authoritative ownership filter.
    const { data: requests, error: fetchErr } = await supabase
      .from('loan_requests')
      .select('*')
      .eq('referred_member_id', memberId)
      .order('created_at', { ascending: false });

    if (fetchErr) {
      console.error('Member inbox query failed:', fetchErr);
      return res.status(500).json({ error: 'Unable to load the member inbox.' });
    }

    const data = requests || [];
    return res.status(200).json({ success: true, data, requests: data });
  } catch (err) {
    console.error('Error in get-member-inbox:', err);
    return res.status(500).json({ error: 'Unable to load the member inbox.' });
  }
}
