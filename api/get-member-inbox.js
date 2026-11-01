if (!globalThis.WebSocket) globalThis.WebSocket = class {};
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
  : null;

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
    const { requestId, action, dismissalReason } = req.body || {};
    if (!requestId || !['review', 'dismiss', 'history', 'edit'].includes(action)) {
      return res.status(400).json({ error: 'Invalid request action' });
    }
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
        'applicant_gender', 'requester_address', 'loan_amount_requested',
        'repayment_period_months', 'monthly_income', 'income_source',
        'existing_debts', 'existing_debts_detail', 'loan_purpose_detail',
        'witness1_name', 'witness1_phone',
        'witness2_name', 'witness2_phone'
      ];
      const changes = {};
      for (const field of Object.keys(inputChanges)) {
        if (!allowedFields.includes(field)) return res.status(400).json({ error: `Field is not editable: ${field}` });
        changes[field] = inputChanges[field];
      }
      if (changes.loan_amount_requested !== undefined && (!Number.isFinite(Number(changes.loan_amount_requested)) || Number(changes.loan_amount_requested) <= 0)) return res.status(400).json({ error: 'Requested amount must be greater than zero.' });
      if (changes.repayment_period_months !== undefined && (!Number.isInteger(Number(changes.repayment_period_months)) || Number(changes.repayment_period_months) <= 0)) return res.status(400).json({ error: 'Repayment period must be a positive whole number.' });
      if (changes.monthly_income !== undefined && changes.monthly_income !== '' && (!Number.isFinite(Number(changes.monthly_income)) || Number(changes.monthly_income) < 0)) return res.status(400).json({ error: 'Monthly income is invalid.' });
      if (changes.applicant_phone !== undefined && String(changes.applicant_phone).length > 40) return res.status(400).json({ error: 'Phone number is too long.' });
      if (changes.requester_address !== undefined && String(changes.requester_address).trim().length < 5) return res.status(400).json({ error: 'Address is required.' });
      if (changes.loan_purpose_detail !== undefined && String(changes.loan_purpose_detail).trim().length < 3) return res.status(400).json({ error: 'Purpose details are required.' });

      // Normalize types before passing them to the transactional PostgreSQL
      // function so history JSON reflects the actual stored values.
      if (changes.loan_amount_requested !== undefined) changes.loan_amount_requested = Number(changes.loan_amount_requested);
      if (changes.repayment_period_months !== undefined) changes.repayment_period_months = Number(changes.repayment_period_months);
      if (changes.monthly_income !== undefined && changes.monthly_income !== '') changes.monthly_income = Number(changes.monthly_income);
      if (changes.existing_debts !== undefined) changes.existing_debts = changes.existing_debts === true || changes.existing_debts === 'true';
      for (const field of ['applicant_name', 'applicant_phone', 'applicant_whatsapp', 'applicant_gender', 'requester_address', 'income_source', 'existing_debts_detail', 'loan_purpose_detail', 'witness1_name', 'witness1_phone', 'witness2_name', 'witness2_phone']) {
        if (changes[field] !== undefined && changes[field] !== null) changes[field] = String(changes[field]).trim();
      }
      if (changes.applicant_dob !== undefined) changes.applicant_dob = changes.applicant_dob ? String(changes.applicant_dob).trim() : null;

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
