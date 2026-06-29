import { supabase } from './supabaseClient';

const isTableMissingError = (err: any) => {
  return err && (err.code === 'PGRST204' || err.code === 'PGRST205' || String(err.message || '').includes('relation') || String(err.message || '').includes('does not exist'));
};

const calculateRepaymentsOverview = (installments: any[]) => {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(today.getDate() + 7);
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  let dueThisWeekCount = 0;
  let dueThisWeekAmt = 0;
  let overdueCount = 0;
  let overdueAmt = 0;
  let receivedThisMonthAmt = 0;
  let totalOutstanding = 0;

  installments.forEach(inst => {
    const dueDate = new Date(inst.due_date);
    const amountDue = Number(inst.amount_due || 0);
    const paidAmount = Number(inst.paid_amount || 0);
    const isPaid = inst.status === 'paid';
    const isOverdue = inst.status === 'overdue' || (inst.status === 'pending' && dueDate < today);

    totalOutstanding += Math.max(0, amountDue - paidAmount);

    if (!isPaid) {
      if (dueDate >= today && dueDate <= nextWeek) {
        dueThisWeekCount++;
        dueThisWeekAmt += (amountDue - paidAmount);
      }
      if (isOverdue) {
        overdueCount++;
        overdueAmt += (amountDue - paidAmount);
      }
    } else {
      if (inst.paid_date) {
        const paidDate = new Date(inst.paid_date);
        if (paidDate >= thisMonthStart && paidDate <= thisMonthEnd) {
          receivedThisMonthAmt += paidAmount;
        }
      }
    }
  });

  return {
    dueThisWeekCount,
    dueThisWeekAmt,
    overdueCount,
    overdueAmt,
    receivedThisMonthAmt,
    totalOutstanding
  };
};

export const api = {
  baseUrl: '',

  get: async <T>(path: string, _token?: string): Promise<T> => {
    if (path === '/auth/me') {
      const token = _token || sessionStorage.getItem('active_api_token') || '';
      if (!token) throw new Error('Unauthenticated');
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) throw new Error('Unauthenticated');
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error || !profile) throw new Error('Profile not found');
      return { user: { ...profile, email: user.email, address: profile.addr } } as T;
    }

    if (path === '/bootstrap') {
      const token = sessionStorage.getItem('active_api_token') || '';
      let activeUser: any = null;
      if (token) {
        try {
          const { data: { user } } = await supabase.auth.getUser(token);
          if (user) {
            const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            activeUser = prof;
          }
        } catch (e) {
          console.warn('Bootstrap auth fetch failed:', e);
        }
      }

      // For members: fetch via service-role API to bypass RLS
      // For admins/super: use anon client (they have full access via RLS)
      let loanFetchPromise: Promise<{ data: any[] }>;
      if (activeUser && activeUser.role === 'member') {
        loanFetchPromise = fetch('/api/get-member-loans', {
          headers: { 'Authorization': `Bearer ${token}` }
        }).then(r => r.json()).then(j => ({ data: j.loans || [] })).catch(() => ({ data: [] }));
      } else {
        loanFetchPromise = supabase.from('loans').select('*').order('created_at', { ascending: false }) as unknown as Promise<{ data: any[] }>;
      }

      const [
        { data: portalConfig },
        { data: users },
        { data: loans },
        { data: campaigns },
        { data: donations },
        { data: products },
        { data: units },
        { data: kits },
        { data: inventoryTransactions }
      ] = await Promise.all([
        supabase.from('portal_configs').select('*').maybeSingle(),
        fetch('/api/get-users', {
          headers: {
            'Authorization': `Bearer ${sessionStorage.getItem('active_api_token')}`
          }
        }).then(res => res.json()).then(json => ({ data: json.users || [] })).catch(() => ({ data: [] })),
        loanFetchPromise,
        supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('donations').select('*').order('created_at', { ascending: false }),
        supabase.from('products').select('*').order('created_at', { ascending: false }),
        supabase.from('units').select('*').order('created_at', { ascending: false }),
        supabase.from('kits').select('*').order('created_at', { ascending: false }),
        supabase.from('inventory_transactions').select('*').order('happened_at', { ascending: false })
      ]);

      let config = portalConfig;
      if (!config) {
        const { data: newConfig } = await supabase.from('portal_configs').insert({
          org_name: 'SKSSF Poyanad Branch',
          org_logo: '',
          org_scale: 1.0,
          max_loan: 50000,
          sah_amt: 100,
          repayment_approvals_needed: 1,
          loan_approvals_needed: 2,
          approver_roles: ['President', 'Secretary', 'Treasurer'],
          authorized_reviewers: [],
          default_committee: []
        }).select().single();
        config = newConfig;
      }

      const formattedUsers = (users || []).map(u => ({
        ...u,
        address: u.addr,
      }));

      return {
        portal_config: config,
        users: formattedUsers,
        loans: loans || [],
        campaigns: campaigns || [],
        donations: donations || [],
        products: products || [],
        units: units || [],
        kits: kits || [],
        inventory_transactions: inventoryTransactions || []
      } as T;
    }

    if (path.startsWith('/loans/') && path.endsWith('/repayments')) {
      const loanId = path.split('/')[2];
      try {
        const { data, error } = await supabase.from('loan_installments').select('*').eq('loan_id', loanId).order('installment_number');
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const { data: loan } = await supabase.from('loans').select('id, amt, months, repayments').eq('loan_no', loanId).maybeSingle();
          if (loan) {
            const installments = (loan.repayments || []).map((r: any, idx: number) => ({
              id: r.id || `inst-${loan.id}-${idx}`,
              loan_id: loan.id,
              installment_number: idx + 1,
              due_date: r.due || r.due_date || '',
              amount_due: Number(r.amt || r.amount_due || (loan.amt / (loan.months || 1))),
              status: r.paid ? 'paid' : (r.request?.status === 'pending' ? 'pending' : (r.due && new Date(r.due) < new Date() ? 'overdue' : 'pending')),
              paid_date: r.paidDate || r.paid_date || null,
              paid_amount: r.paid_amount || null,
              payment_method: r.method || r.payment_method || null,
              payment_reference: r.ref || r.payment_reference || null,
              marked_by: r.marked_by || null,
              notification_sent_at: r.notification_sent_at || {},
              member_notified_requester_at: r.member_notified_requester_at || null,
              notes: r.note || r.notes || null
            }));
            return { data: installments } as T;
          }
        }
        throw err;
      }
    }

    if (path === '/admin/repayments/overview') {
      try {
        const { data: installments, error } = await supabase.from('loan_installments').select('*');
        if (error) throw error;
        return { data: calculateRepaymentsOverview(installments || []) } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const { data: loans } = await supabase.from('loans').select('id, amt, repayments');
          const allInsts: any[] = [];
          (loans || []).forEach((loan: any) => {
            (loan.repayments || []).forEach((r: any, idx: number) => {
              allInsts.push({
                due_date: r.due || r.due_date || '',
                amount_due: Number(r.amt || (loan.amt / (loan.repayments.length || 1))),
                status: r.paid ? 'paid' : (r.request?.status === 'pending' ? 'pending' : (r.due && new Date(r.due) < new Date() ? 'overdue' : 'pending')),
                paid_amount: r.paid_amount || (r.paid ? r.amt : 0),
                paid_date: r.paidDate || r.paid_date || null
              });
            });
          });
          return { data: calculateRepaymentsOverview(allInsts) } as T;
        }
        throw err;
      }
    }

    if (path.startsWith('/admin/repayments')) {
      try {
        const { data, error } = await supabase.from('loan_installments').select('*, loans(*)').order('due_date');
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const { data: loans } = await supabase.from('loans').select('*');
          const allInsts: any[] = [];
          (loans || []).forEach((loan: any) => {
            (loan.repayments || []).forEach((r: any, idx: number) => {
              allInsts.push({
                id: r.id || `inst-${loan.id}-${idx}`,
                loan_id: loan.id,
                loan: {
                  id: loan.loan_no || loan.id,
                  loan_no: loan.loan_no,
                  name: loan.name,
                  user_id: loan.user_id || loan.applicant_id,
                  branch: loan.branch
                },
                installment_number: idx + 1,
                due_date: r.due || r.due_date || '',
                amount_due: Number(r.amt || (loan.amt / (loan.repayments.length || 1))),
                status: r.paid ? 'paid' : (r.request?.status === 'pending' ? 'pending' : (r.due && new Date(r.due) < new Date() ? 'overdue' : 'pending')),
                paid_date: r.paidDate || r.paid_date || null,
                paid_amount: r.paid_amount || null,
                payment_method: r.method || r.payment_method || null,
                payment_reference: r.ref || r.payment_reference || null,
                member_notified_requester_at: r.member_notified_requester_at || null
              });
            });
          });
          return { data: allInsts } as T;
        }
        throw err;
      }
    }

    if (path === '/notifications') {
      const token = _token || sessionStorage.getItem('active_api_token') || '';
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) throw new Error('Unauthenticated');

      try {
        const { data, error } = await supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const notifs = JSON.parse(localStorage.getItem('db_notifications') || '[]');
          const userNotifs = notifs.filter((n: any) => n.user_id === user.id).sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          return { data: userNotifs } as T;
        }
        throw err;
      }
    }

    if (path === '/settings/notifications') {
      try {
        const { data, error } = await supabase.from('notification_settings').select('*').eq('id', 1).maybeSingle();
        if (error) throw error;
        return { data: data || {
          alert_days_advance_1: 15,
          alert_days_advance_2: 7,
          alert_days_urgent: 3,
          alert_days_final: 1,
          overdue_alert_daily_days: 7,
          overdue_alert_weekly_after: 7,
          overdue_stop_days: 60
        } } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const settings = JSON.parse(localStorage.getItem('db_notification_settings') || '{}');
          return { data: {
            alert_days_advance_1: 15,
            alert_days_advance_2: 7,
            alert_days_urgent: 3,
            alert_days_final: 1,
            overdue_alert_daily_days: 7,
            overdue_alert_weekly_after: 7,
            overdue_stop_days: 60,
            ...settings
          } } as T;
        }
        throw err;
      }
    }

    if (path.startsWith('/request/')) {
      const code = path.split('/')[2];
      try {
        const { data, error } = await supabase.from('profiles').select('id, name, branch, member_unique_code').eq('member_unique_code', code).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('Member not found');
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const users = JSON.parse(localStorage.getItem('db_users') || '[]');
          const member = users.find((u: any) => u.member_unique_code === code && u.role === 'member');
          if (!member) throw new Error('Member not found');
          return { data: { id: member.id, name: member.name, branch: member.branch, member_unique_code: member.member_unique_code } } as T;
        }
        throw err;
      }
    }

    if (path === '/member/inbox') {
      const token = _token || sessionStorage.getItem('active_api_token') || '';
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) throw new Error('Unauthenticated');
      try {
        const { data, error } = await supabase
          .from('loan_requests')
          .select('*')
          .or(`referred_member_id.eq.${user.id},referred_member_name.ilike.%${user.email}%`)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        try {
          const { data, error } = await supabase.from('inbox_submissions').select('*').eq('member_id', user.id).order('submitted_at', { ascending: false });
          if (error) throw error;
          return { data } as T;
        } catch (innerErr) {
          const submissions = JSON.parse(localStorage.getItem('db_inbox_submissions') || '[]');
          const memberSubs = submissions.filter((s: any) => s.member_id === user.id).sort((a: any, b: any) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
          return { data: memberSubs } as T;
        }
      }
    }

    if (path === '/inventory/checkout-requests') {
      try {
        const { data, error } = await supabase.from('checkout_requests').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const requests = JSON.parse(localStorage.getItem('db_checkout_requests') || '[]');
          return { data: requests } as T;
        }
        throw err;
      }
    }

    if (path === '/inventory/return-requests') {
      try {
        const { data, error } = await supabase.from('return_requests').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const requests = JSON.parse(localStorage.getItem('db_return_requests') || '[]');
          return { data: requests } as T;
        }
        throw err;
      }
    }

    throw new Error(`Endpoint GET ${path} not implemented`);
  },


  post: async <T>(path: string, body?: any, _token?: string): Promise<T> => {
    if (path === '/loans/otp/send' || path === '/loans/otp/verify') {
      const functionPath = path === '/loans/otp/send' ? '/api/send-otp' : '/api/verify-otp';
      const res = await fetch(functionPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to process OTP request');
      return json as T;
    }

    if (path === '/auth/login') {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: body.email,
        password: body.password
      });
      if (authError) throw new Error(authError.message);
      const user = authData.user;
      if (!user) throw new Error('Auth user not found');
      const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profileError || !profile) throw new Error('User profile not found');
      sessionStorage.setItem('active_api_token', authData.session?.access_token || '');
      return { token: authData.session?.access_token, user: { ...profile, email: user.email, address: profile.addr } } as T;
    }

    if (path === '/auth/logout') {
      const { error } = await supabase.auth.signOut();
      if (error) throw new Error(error.message);
      sessionStorage.removeItem('active_api_token');
      return { success: true } as T;
    }

    if (path === '/auth/register') {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: body.email,
        password: body.password,
        options: {
          data: {
            name: body.name,
            role: body.role || 'member'
          }
        }
      });
      if (authError) throw new Error(authError.message);
      const user = authData.user;
      if (user) {
        const { error: profileError } = await supabase.from('profiles').upsert({
          id: user.id,
          code: body.code,
          member_no: body.member_no,
          phone: body.phone,
          branch: body.branch || body.unit,
          designation: body.designation,
          occupation: body.occupation,
          addr: body.addr || body.address,
          dob: body.dob,
          gender: body.gender,
          salary: body.salary,
          active: body.active !== undefined ? body.active : true,
          join_date: body.join_date || new Date().toISOString().split('T')[0],
          is_approver: body.is_approver || false,
          name: body.name,
          role: body.role || 'member'
        });
        if (profileError) throw new Error(profileError.message);
      }
      return { success: true } as T;
    }

    if (path === '/users') {
      const res = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('active_api_token')}`
        },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to create user');
      return json as T;
    }

    if (path === '/loans') {
      const { data, error } = await supabase.from('loans').insert({
        loan_no: body.loan_no || body.loanNo,
        user_id: body.user_id || body.userId,
        member_no: body.member_no || body.memberNo,
        name: body.name || body.requester_name,
        branch: body.branch,
        mob: body.mob || body.phone || body.requester_phone,
        amount: body.amount || body.loan_amount_requested,
        purpose: body.purpose,
        purpose_desc: body.purpose_desc || body.purpDesc,
        months: body.months || body.repayment_period_months,
        status: body.status || 'pending',
        submitted_date: body.submitted_date || new Date().toISOString().split('T')[0],
        guarantors: body.guarantors || [],
        repayments: body.repayments || [],
        request: body.request || {},
        audit: body.audit || [],
        signature: body.signature,
        witnesses: body.witnesses || [],
        submitted_by_member_id: body.submitted_by_member_id || body.submittedByMemberId || null,
        requester_name: body.requester_name || body.name,
        requester_phone: body.requester_phone || body.mob || body.phone,
        requester_address: body.requester_address || body.address || '',
        repayment_period_months: body.repayment_period_months || body.months || 12,
        loan_amount_requested: body.loan_amount_requested || body.amount || 0,
        workflow_status: body.workflow_status || 'PENDING_COORDINATOR_REVIEW',
        member_notes: body.member_notes || body.memberNotes || ''
      }).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path.startsWith('/loans/') && path.endsWith('/verify')) {
      const loanNo = path.split('/')[2];
      const { data: loan, error: fetchErr } = await supabase.from('loans').select('*').eq('loan_no', loanNo).single();
      if (fetchErr || !loan) throw new Error('Loan not found');

      const approval = {
        id: body.adminId || null,
        by: body.adminBy || 'Admin',
        role: body.adminRole || 'admin',
        date: new Date().toISOString(),
        note: body.adminNotes || '',
        status: body.status
      };

      const requestState = loan.request ?? {};
      requestState.approvals = requestState.approvals ?? [];
      requestState.threshold = requestState.threshold ?? 2;

      let found = false;
      for (let i = 0; i < requestState.approvals.length; i++) {
        if ((approval.id && requestState.approvals[i].id === approval.id) || requestState.approvals[i].by === approval.by) {
          requestState.approvals[i] = approval;
          found = true;
          break;
        }
      }
      if (!found) requestState.approvals.push(approval);

      const approved = requestState.approvals.filter((a: any) => a.status === 'approved');
      const rejected = requestState.approvals.filter((a: any) => a.status === 'rejected');
      const superApproved = approved.some((a: any) => a.role === 'super');

      let resolvedStatus = 'pending';
      let loanStatus = 'pending';

      if (superApproved || approved.length >= requestState.threshold) {
        resolvedStatus = 'approved';
        loanStatus = 'approved';
      } else if (rejected.length > 0) {
        resolvedStatus = 'rejected';
        loanStatus = 'rejected';
      } else if (approved.length > 0) {
        resolvedStatus = 'partially_approved';
        loanStatus = 'pending';
      }

      requestState.status = resolvedStatus;
      loan.request = requestState;
      loan.status = loanStatus;
      if (loanStatus === 'approved') {
        loan.approved_date = new Date().toISOString().split('T')[0];
      }

      const audit = loan.audit ?? [];
      audit.push({
        action: body.status === 'approved' ? 'Loan Verified' : (body.status === 'rejected' ? 'Loan Rejected' : 'Loan Deliberation'),
        by: approval.by,
        date: new Date().toLocaleString(),
        note: body.adminNotes || '',
        category: 'loan'
      });
      loan.audit = audit;

      const { data: updatedLoan, error: updateErr } = await supabase.from('loans').update({
        status: loan.status,
        approved_date: loan.approved_date,
        request: loan.request,
        audit: loan.audit
      }).eq('id', loan.id).select().single();
      if (updateErr) throw new Error(updateErr.message);
      return { data: updatedLoan } as T;
    }

    if (path.startsWith('/loans/') && path.includes('/repayments/') && path.endsWith('/submit')) {
      const loanNo = path.split('/')[2];
      const monthIdx = parseInt(path.split('/')[4]);

      const { data: loan, error: fetchErr } = await supabase.from('loans').select('*').eq('loan_no', loanNo).single();
      if (fetchErr || !loan) throw new Error('Loan not found');

      const repayments = loan.repayments ?? [];
      if (!repayments[monthIdx]) throw new Error('Repayment index invalid');

      repayments[monthIdx].request = {
        ...body,
        installment_no: monthIdx + 1,
        submittedAt: new Date().toISOString(),
        status: 'pending',
        approvals: [],
        assignedReviewers: body.assignedReviewers || []
      };

      const audit = loan.audit ?? [];
      audit.push({
        action: 'Payment Proof Submitted',
        by: 'Member',
        date: new Date().toLocaleString(),
        note: `Member submitted proof for EMI #${monthIdx + 1}`,
        category: 'repayment'
      });

      const { data: updatedLoan, error: updateErr } = await supabase.from('loans').update({
        repayments,
        audit
      }).eq('id', loan.id).select().single();
      if (updateErr) throw new Error(updateErr.message);
      return { data: updatedLoan } as T;
    }

    if (path.startsWith('/loans/') && path.includes('/repayments/') && path.endsWith('/verify')) {
      const loanNo = path.split('/')[2];
      const monthIdx = parseInt(path.split('/')[4]);

      const { data: loan, error: fetchErr } = await supabase.from('loans').select('*').eq('loan_no', loanNo).single();
      if (fetchErr || !loan) throw new Error('Loan not found');

      const repayments = loan.repayments ?? [];
      if (!repayments[monthIdx]?.request) throw new Error('Repayment request not found');

      const signature = {
        id: body.adminId || null,
        by: body.adminBy || 'Admin',
        role: body.adminRole || 'admin',
        date: new Date().toISOString(),
        note: body.adminNotes || '',
        status: body.status
      };

      const requestState = repayments[monthIdx].request;
      requestState.approvals = requestState.approvals ?? [];

      let found = false;
      for (let i = 0; i < requestState.approvals.length; i++) {
        if ((signature.id && requestState.approvals[i].id === signature.id) || requestState.approvals[i].by === signature.by) {
          requestState.approvals[i] = signature;
          found = true;
          break;
        }
      }
      if (!found) requestState.approvals.push(signature);

      const approved = requestState.approvals.filter((a: any) => a.status === 'approved');
      const rejected = requestState.approvals.filter((a: any) => a.status === 'rejected');

      let resolvedStatus = 'pending';
      if (approved.length >= 1) resolvedStatus = 'approved';
      else if (rejected.length > 0) resolvedStatus = 'rejected';

      requestState.status = resolvedStatus;
      requestState.reviewedAt = new Date().toISOString();
      repayments[monthIdx].request = requestState;

      if (resolvedStatus === 'approved') {
        repayments[monthIdx].paid = new Date().toISOString().split('T')[0];
        repayments[monthIdx].paid_date = new Date().toLocaleDateString('en-GB');
        repayments[monthIdx].method = requestState.mode || 'transfer';
        repayments[monthIdx].notes = body.adminNotes || (requestState.memberNote || '');
        repayments[monthIdx].proof = requestState.proof || '';

        if (requestState.isFullClearance) {
          for (let i = 0; i < repayments.length; i++) {
            if (!repayments[i].paid) {
              repayments[i].paid = new Date().toISOString().split('T')[0];
              repayments[i].paid_date = new Date().toLocaleDateString('en-GB');
              repayments[i].method = requestState.mode || 'transfer';
              repayments[i].notes = (requestState.memberNote || '') + ' (Full Clearance Approved)';
              repayments[i].proof = requestState.proof || '';
            }
          }
        }
      }

      const allPaid = repayments.every((r: any) => !!r.paid);
      const audit = loan.audit ?? [];
      audit.push({
        action: body.status === 'approved' ? 'Payment Verified' : (body.status === 'rejected' ? 'Payment Rejected' : 'Payment Deliberation'),
        by: signature.by,
        date: new Date().toLocaleString(),
        note: body.adminNotes || '',
        category: 'repayment'
      });

      const { data: updatedLoan, error: updateErr } = await supabase.from('loans').update({
        repayments,
        status: allPaid ? 'completed' : loan.status,
        audit
      }).eq('id', loan.id).select().single();
      if (updateErr) throw new Error(updateErr.message);
      return { data: updatedLoan } as T;
    }

    if (path.startsWith('/loans/') && path.includes('/repayments/') && path.endsWith('/log')) {
      const loanNo = path.split('/')[2];
      const monthIdx = parseInt(path.split('/')[4]);

      const { data: loan, error: fetchErr } = await supabase.from('loans').select('*').eq('loan_no', loanNo).single();
      if (fetchErr || !loan) throw new Error('Loan not found');

      const repayments = loan.repayments ?? [];
      if (!repayments[monthIdx]) throw new Error('Repayment index invalid');

      if (body.isFullClearance) {
        for (let i = 0; i < repayments.length; i++) {
          if (!repayments[i].paid) {
            repayments[i].paid = new Date().toISOString().split('T')[0];
            repayments[i].paid_date = new Date().toLocaleDateString('en-GB');
            repayments[i].method = body.method;
            repayments[i].notes = (body.notes || '') + ' (Full Settlement Logged)';
            repayments[i].proof = body.proof || '';
          }
        }
      } else {
        repayments[monthIdx].paid = new Date().toISOString().split('T')[0];
        repayments[monthIdx].paid_date = new Date().toLocaleDateString('en-GB');
        repayments[monthIdx].method = body.method;
        repayments[monthIdx].notes = body.notes || '';
        repayments[monthIdx].proof = body.proof || '';
        repayments[monthIdx].paid_amount = body.amt || repayments[monthIdx].amt;
      }

      const allPaid = repayments.every((r: any) => !!r.paid);
      const audit = loan.audit ?? [];
      audit.push({
        action: body.isFullClearance ? 'Full Loan Settlement Logged' : 'Repayment Logged',
        by: 'Admin',
        date: new Date().toLocaleString(),
        note: body.isFullClearance ? 'All remaining installments cleared manually.' : `EMI #${monthIdx + 1} marked as paid.`,
        category: 'repayment'
      });

      const { data: updatedLoan, error: updateErr } = await supabase.from('loans').update({
        repayments,
        status: allPaid ? 'completed' : loan.status,
        audit
      }).eq('id', loan.id).select().single();
      if (updateErr) throw new Error(updateErr.message);
      return { data: updatedLoan } as T;
    }

    if (path === '/donations') {
      const { data, error } = await supabase.from('donations').insert({
        donation_no: body.donation_no || body.donationNo,
        campaign_id: body.campaign_id || body.campaignId,
        user_id: body.user_id || body.userId,
        donor_name: body.donor_name || body.donorName,
        donor_phone: body.donor_phone || body.donorPhone,
        amount: body.amount,
        method: body.method,
        note: body.note,
        donated_at: body.donated_at || body.donatedAt || new Date().toISOString().split('T')[0],
        branch: body.branch
      }).select().single();
      if (error) throw new Error(error.message);

      if (body.campaign_id || body.campaignId) {
        const campaignId = body.campaign_id || body.campaignId;
        const { data: campaign } = await supabase.from('campaigns').select('received').eq('id', campaignId).single();
        if (campaign) {
          await supabase.from('campaigns').update({
            received: (campaign.received || 0) + Number(body.amount)
          }).eq('id', campaignId);
        }
      }
      return { data } as T;
    }

    if (path === '/campaigns') {
      const { data, error } = await supabase.from('campaigns').insert({
        campaign_no: body.campaign_no || body.campaignNo,
        title: body.title,
        goal: body.goal || 0,
        received: body.received || 0,
        status: body.status || 'Active',
        note: body.note,
        period: body.period
      }).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path === '/admin/reset') {
      await Promise.all([
        supabase.from('inventory_transactions').delete().neq('id', 0),
        supabase.from('kits').delete().neq('id', 0),
        supabase.from('units').delete().neq('id', 0),
        supabase.from('products').delete().neq('id', 0),
        supabase.from('donations').delete().neq('id', 0),
        supabase.from('loans').delete().neq('id', 0),
        supabase.from('campaigns').delete().neq('id', 0)
      ]);
      return { success: true } as T;
    }

    if (path === '/inventory/products') {
      const { data, error } = await supabase.from('products').insert({
        product_no: body.product_no || body.productNo,
        name: body.name,
        category: body.category,
        unit: body.unit,
        total_quantity: body.total_quantity || 0,
        available_quantity: body.available_quantity || 0,
        photo: body.photo || ''
      }).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path === '/inventory/kits') {
      const { data, error } = await supabase.from('kits').insert({
        kit_no: body.kit_no || body.kitNo,
        name: body.name,
        barcode: body.barcode,
        child_units: body.child_units || body.childUnits || []
      }).select().single();
      if (error) throw new Error(error.message);

      const childIds = body.child_units || body.childUnits || [];
      if (childIds.length > 0) {
        await supabase.from('units').update({ status: 'kitted' }).in('id', childIds);
      }
      return { data } as T;
    }

    if (path === '/inventory/scan') {
      const barcode = body.barcode;
      const type = body.type;
      const adminBy = body.adminBy;
      const assignedTo = body.assignedTo;
      const memberName = body.memberName;
      const missionIdVal = body.missionId;

      const { data: kit } = await supabase.from('kits').select('*').eq('barcode', barcode).maybeSingle();
      let units: any[] = [];
      if (kit) {
        const { data: kitUnits } = await supabase.from('units').select('*').in('id', kit.child_units || []);
        units = kitUnits || [];
      } else {
        const { data: singleUnit } = await supabase.from('units').select('*').eq('barcode', barcode);
        units = singleUnit || [];
      }

      if (units.length === 0) throw new Error('Barcode not found');

      for (const unit of units) {
        const { data: product } = await supabase.from('products').select('*').eq('id', unit.product_id).single();
        if (!product) continue;

        if (type === 'checkout' && (unit.status === 'available' || unit.status === 'kitted')) {
          let holderId = null;
          if (assignedTo) {
            const { data: holder } = await supabase.from('profiles').select('id').eq('code', assignedTo).maybeSingle();
            holderId = holder?.id || null;
          }
          let missionId = null;
          if (missionIdVal) {
            const { data: mission } = await supabase.from('campaigns').select('id').eq('campaign_no', missionIdVal).maybeSingle();
            missionId = mission?.id || null;
          }

          await supabase.from('units').update({
            status: 'checked_out',
            current_holder_id: holderId,
            current_mission_id: missionId,
            checkout_at: new Date().toISOString()
          }).eq('id', unit.id);

          await supabase.from('products').update({
            available_quantity: Math.max(0, (product.available_quantity || 0) - 1)
          }).eq('id', product.id);

        } else if (type === 'checkin' && unit.status === 'checked_out') {
          await supabase.from('units').update({
            status: 'available',
            current_holder_id: null,
            current_mission_id: null,
            checkin_at: new Date().toISOString()
          }).eq('id', unit.id);

          await supabase.from('products').update({
            available_quantity: (product.available_quantity || 0) + 1
          }).eq('id', product.id);
        }

        const txNo = 'TX-' + Math.random().toString(36).substring(2, 9).toUpperCase();
        await supabase.from('inventory_transactions').insert({
          tx_no: txNo,
          unit_id: unit.id,
          product_id: unit.product_id,
          barcode: unit.barcode,
          type: type,
          admin_by: adminBy,
          assigned_to: assignedTo || null,
          member_name: memberName || null,
          mission_id: missionIdVal || null,
          note: type === 'checkout' ? 'Checked out' : 'Checked in',
          happened_at: new Date().toISOString()
        });
      }

      return { success: true } as T;
    }

    if (path === '/inventory/clear-all-history') {
      await supabase.from('inventory_transactions').delete().neq('id', 0);
      return { success: true } as T;
    }

    if (path.startsWith('/inventory/units/') && path.endsWith('/clear-history')) {
      const unitId = path.split('/')[3];
      await supabase.from('inventory_transactions').delete().eq('unit_id', unitId);
      return { success: true } as T;
    }

    if (path.startsWith('/inventory/units/') && path.endsWith('/status')) {
      const unitId = path.split('/')[3];
      const { data: unit, error: fetchErr } = await supabase.from('units').select('*').eq('id', unitId).single();
      if (fetchErr || !unit) throw new Error('Unit not found');

      const { data: product } = await supabase.from('products').select('*').eq('id', unit.product_id).single();
      if (product) {
        let availDiff = 0;
        if (unit.status === 'available' && body.status !== 'available') availDiff = -1;
        else if (unit.status !== 'available' && body.status === 'available') availDiff = 1;

        if (availDiff !== 0) {
          await supabase.from('products').update({
            available_quantity: Math.max(0, (product.available_quantity || 0) + availDiff)
          }).eq('id', product.id);
        }
      }

      const { data: updatedUnit, error } = await supabase.from('units').update({
        status: body.status,
        current_holder_id: body.current_holder_id || null,
        current_mission_id: body.current_mission_id || null
      }).eq('id', unitId).select().single();
      if (error) throw new Error(error.message);
      return { data: updatedUnit } as T;
    }



    if (path.startsWith('/loans/') && path.endsWith('/repayments/generate')) {
      const loanId = path.split('/')[2];
      const disbursementDate = body.disbursement_date || new Date().toISOString().split('T')[0];
      const tenureMonths = Number(body.tenure_months || 12);
      const frequency = body.repayment_frequency || 'monthly';

      const { data: loan, error: fetchErr } = await supabase.from('loans').select('*').eq('loan_no', loanId).single();
      if (fetchErr || !loan) throw new Error('Loan not found');

      const installmentsCount = frequency === 'one_time' ? 1 : (frequency === 'quarterly' ? Math.ceil(tenureMonths / 3) : tenureMonths);
      const installmentAmount = Number((loan.amt / installmentsCount).toFixed(2));

      const installments: any[] = [];
      const repaymentsArrayForFallback: any[] = [];

      for (let i = 0; i < installmentsCount; i++) {
        const dueDate = new Date(disbursementDate);
        if (frequency === 'monthly') {
          dueDate.setMonth(dueDate.getMonth() + i + 1);
        } else if (frequency === 'quarterly') {
          dueDate.setMonth(dueDate.getMonth() + (i + 1) * 3);
        } else {
          dueDate.setMonth(dueDate.getMonth() + tenureMonths);
        }

        const dueDateStr = dueDate.toISOString().split('T')[0];

        installments.push({
          loan_id: loan.id,
          installment_number: i + 1,
          due_date: dueDateStr,
          amount_due: installmentAmount,
          status: 'pending',
          notification_sent_at: {},
          notes: ''
        });

        repaymentsArrayForFallback.push({
          due: dueDateStr,
          amt: installmentAmount,
          paid: false,
          request: null
        });
      }

      const loanUpdates = {
        disbursement_date: disbursementDate,
        tenure_months: tenureMonths,
        repayment_frequency: frequency,
        installment_amount: installmentAmount,
        total_installments: installmentsCount,
        outstanding_balance: loan.amt,
        repayment_status: 'on_track',
        repayments: repaymentsArrayForFallback
      };

      await supabase.from('loans').update(loanUpdates).eq('id', loan.id);

      try {
        await supabase.from('loan_installments').delete().eq('loan_id', loan.id);
        const { error: insertErr } = await supabase.from('loan_installments').insert(installments);
        if (insertErr) throw insertErr;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          console.log('loan_installments table missing, stored repayments in loans JSON column.');
        } else {
          throw err;
        }
      }

      return { success: true } as T;
    }

    if (path.startsWith('/loans/') && path.includes('/repayments/') && path.endsWith('/notify-requester')) {
      const loanId = path.split('/')[2];
      const installmentId = path.split('/')[4];
      const timestamp = new Date().toISOString();

      try {
        const { error } = await supabase
          .from('loan_installments')
          .update({ member_notified_requester_at: timestamp })
          .eq('id', installmentId);
        if (error) throw error;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const { data: loan } = await supabase.from('loans').select('*').eq('loan_no', loanId).single();
          if (loan) {
            const instIdx = parseInt(installmentId.split('-').pop() || '0');
            const repayments = loan.repayments || [];
            if (repayments[instIdx]) {
              repayments[instIdx].member_notified_requester_at = timestamp;
              await supabase.from('loans').update({ repayments }).eq('id', loan.id);
            }
          }
        } else {
          throw err;
        }
      }

      return { success: true } as T;
    }

    if (path === '/admin/members') {
      try {
        const uniqueCode = `MBR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const profileData = {
          role: 'member',
          name: body.name,
          email: body.email,
          phone: body.phone || '',
          branch: body.branch || '',
          member_unique_code: uniqueCode,
          must_change_password: true,
          is_active: true,
          created_at: new Date().toISOString()
        };
        const { data, error } = await supabase.from('profiles').insert(profileData).select().single();
        if (error) throw error;

        console.log(`[EMAIL SIMULATION] To: ${body.email} | Subject: Welcome to SKSSF Member Portal! | Body: Hello ${body.name}, your account is created. Login with your email and temp password: password123. Share your public loan request link: /request/${uniqueCode}`);
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const users = JSON.parse(localStorage.getItem('db_users') || '[]');
          const uniqueCode = `MBR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          const newMember = {
            id: `MBR-${Math.random().toString(36).substring(2, 9)}`,
            role: 'member',
            name: body.name,
            email: body.email,
            phone: body.phone || '',
            branch: body.branch || '',
            member_unique_code: uniqueCode,
            must_change_password: true,
            active: true,
            joinDate: new Date().toISOString().split('T')[0]
          };
          users.push(newMember);
          localStorage.setItem('db_users', JSON.stringify(users));
          
          console.log(`[EMAIL SIMULATION] To: ${body.email} | Subject: Welcome to SKSSF Member Portal! | Body: Hello ${body.name}, your account is created. Login with your email and temp password: password123. Share your public loan request link: /request/${uniqueCode}`);
          return { data: newMember } as T;
        }
        throw err;
      }
    }

    if (path === '/member/inbox') {
      try {
        const { data, error } = await supabase
          .from('loan_requests')
          .insert({
            requester_name: body.requester_name || body.name,
            requester_phone: body.requester_phone || body.phone,
            requester_address: body.requester_address || body.address,
            reason: body.reason || body.loan_purpose_detail || body.purpose || '',
            approximate_amount: body.approximate_amount || body.loan_amount_requested || 0,
            referred_member_name: body.referred_member_name || body.member_name || '',
            referred_member_id: body.referred_member_id || body.member_id || null,
            status: body.status || 'DRAFT_UNASSIGNED'
          })
          .select()
          .single();
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        try {
          const { data, error } = await supabase.from('inbox_submissions').insert(body).select().single();
          if (error) throw error;
          return { data } as T;
        } catch (innerErr) {
          const subs = JSON.parse(localStorage.getItem('db_inbox_submissions') || '[]');
          subs.push(body);
          localStorage.setItem('db_inbox_submissions', JSON.stringify(subs));
          return { data: body } as T;
        }
      }
    }

    if (path === '/inventory/checkout-request') {
      try {
        const { data, error } = await supabase
          .from('inventory_checkout_records')
          .insert({
            item_id: body.product_id || body.item_id,
            item_name: body.product_name || body.item_name,
            checked_out_by_member_id: body.member_id || body.checked_out_by_member_id,
            quantity_checked_out: body.quantity || body.quantity_checked_out || 1,
            purpose: body.purpose,
            issue_type: body.item_type || body.issue_type || 'LEASE',
            status: body.status || 'PENDING_APPROVAL'
          })
          .select()
          .single();
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        try {
          const { data, error } = await supabase.from('checkout_requests').insert(body).select().single();
          if (error) throw error;
          return { data } as T;
        } catch (innerErr) {
          const reqs = JSON.parse(localStorage.getItem('db_checkout_requests') || '[]');
          reqs.push(body);
          localStorage.setItem('db_checkout_requests', JSON.stringify(reqs));
          return { data: body } as T;
        }
      }
    }

    if (path === '/inventory/return-request') {
      try {
        const { data, error } = await supabase.from('return_requests').insert(body).select().single();
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const reqs = JSON.parse(localStorage.getItem('db_return_requests') || '[]');
          reqs.push(body);
          localStorage.setItem('db_return_requests', JSON.stringify(reqs));
          return { data: body } as T;
        }
        throw err;
      }
    }

    throw new Error(`Endpoint POST ${path} not implemented`);
  },

  patch: async <T>(path: string, body?: any, _token?: string): Promise<T> => {
    if (path.startsWith('/users/')) {
      const id = path.split('/')[2];
      const res = await fetch(`/api/update-user?id=${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('active_api_token')}`
        },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to update user');
      return { data: json.user } as T;
    }

    if (path.startsWith('/loans/')) {
      const id = path.split('/')[2];
      const { data, error } = await supabase.from('loans').update(body).eq('loan_no', id).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path.startsWith('/campaigns/')) {
      const id = path.split('/')[2];
      const { data, error } = await supabase.from('campaigns').update({
        title: body.title,
        goal: body.goal,
        received: body.received,
        status: body.status,
        note: body.note,
        period: body.period
      }).eq('campaign_no', id).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path === '/portal-config') {
      const { data: existing } = await supabase.from('portal_configs').select('id').maybeSingle();
      const id = existing?.id;
      if (id) {
        const { data, error } = await supabase.from('portal_configs').update(body).eq('id', id).select().single();
        if (error) throw new Error(error.message);
        return { data } as T;
      } else {
        const { data, error } = await supabase.from('portal_configs').insert(body).select().single();
        if (error) throw new Error(error.message);
        return { data } as T;
      }
    }

    if (path.startsWith('/inventory/products/')) {
      const id = path.split('/')[3];
      const { data, error } = await supabase.from('products').update({
        name: body.name,
        category: body.category,
        unit: body.unit,
        total_quantity: body.total_quantity,
        available_quantity: body.available_quantity,
        photo: body.photo
      }).eq('product_no', id).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path.startsWith('/inventory/kits/')) {
      const id = path.split('/')[3];
      const { data, error } = await supabase.from('kits').update({
        name: body.name,
        child_units: body.child_units || body.childUnits
      }).eq('kit_no', id).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path.startsWith('/inventory/units/')) {
      const id = path.split('/')[3];
      const { data, error } = await supabase.from('units').update(body).eq('unit_no', id).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path.startsWith('/loans/') && path.includes('/repayments/') && path.endsWith('/pay')) {
      const loanId = path.split('/')[2];
      const installmentId = path.split('/')[4];
      const { paid_amount, paid_date, payment_method, payment_reference, notes, marked_by } = body;

      const { data: loan, error: fetchErr } = await supabase.from('loans').select('*').eq('loan_no', loanId).single();
      if (fetchErr || !loan) throw new Error('Loan not found');

      let isRelationalTableSuccess = false;
      try {
        const { error } = await supabase
          .from('loan_installments')
          .update({
            status: Number(paid_amount) >= Number(body.amount_due) ? 'paid' : 'partially_paid',
            paid_amount,
            paid_date,
            payment_method,
            payment_reference,
            notes,
            marked_by
          })
          .eq('id', installmentId);
        if (error) throw error;
        isRelationalTableSuccess = true;
      } catch (err: any) {
        if (!isTableMissingError(err)) throw err;
      }

      const repayments = loan.repayments || [];
      const instIdx = installmentId.includes('-') ? parseInt(installmentId.split('-').pop() || '0') : 0;
      
      let targetIdx = instIdx;
      if (isNaN(targetIdx) || !repayments[targetIdx]) {
        targetIdx = repayments.findIndex((r: any) => r.due === body.due_date);
        if (targetIdx === -1) targetIdx = 0;
      }

      if (repayments[targetIdx]) {
        repayments[targetIdx].paid = true;
        repayments[targetIdx].paidDate = paid_date;
        repayments[targetIdx].paid_amount = paid_amount;
        repayments[targetIdx].method = payment_method;
        repayments[targetIdx].ref = payment_reference;
        repayments[targetIdx].note = notes;
        repayments[targetIdx].marked_by = marked_by;
        repayments[targetIdx].request = {
          status: 'approved',
          amt: paid_amount,
          payDate: paid_date,
          mode: payment_method,
          ref: payment_reference,
          memberNote: notes,
          reviewedAt: new Date().toISOString()
        };
      }

      let calculatedPaid = 0;
      if (isRelationalTableSuccess) {
        const { data: insts } = await supabase.from('loan_installments').select('paid_amount').eq('loan_id', loan.id).in('status', ['paid', 'partially_paid']);
        calculatedPaid = (insts || []).reduce((s, i) => s + Number(i.paid_amount || 0), 0);
      } else {
        calculatedPaid = repayments.reduce((s, r) => s + Number(r.paid_amount || (r.paid ? r.amt : 0) || 0), 0);
      }

      const outstandingBalance = Math.max(0, loan.amt - calculatedPaid);
      const isClosed = outstandingBalance <= 1.0;

      const loanUpdates = {
        repayments,
        outstanding_balance: outstandingBalance,
        repayment_status: isClosed ? 'closed' : loan.repayment_status,
        status: isClosed ? 'completed' : loan.status
      };

      await supabase.from('loans').update(loanUpdates).eq('id', loan.id);

      return { success: true } as T;
    }

    if (path === '/notifications/read') {
      const token = _token || sessionStorage.getItem('active_api_token') || '';
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) throw new Error('Unauthenticated');

      try {
        await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id);
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const notifs = JSON.parse(localStorage.getItem('db_notifications') || '[]');
          notifs.forEach((n: any) => {
            if (n.user_id === user.id) n.is_read = true;
          });
          localStorage.setItem('db_notifications', JSON.stringify(notifs));
        } else {
          throw err;
        }
      }

      return { success: true } as T;
    }

    if (path === '/settings/notifications') {
      const token = _token || sessionStorage.getItem('active_api_token') || '';
      const { data: { user } } = await supabase.auth.getUser(token);
      
      try {
        const { data: existing } = await supabase.from('notification_settings').select('id').eq('id', 1).maybeSingle();
        if (existing) {
          await supabase.from('notification_settings').update({
            ...body,
            updated_by: user?.id,
            updated_at: new Date().toISOString()
          }).eq('id', 1);
        } else {
          await supabase.from('notification_settings').insert({
            id: 1,
            ...body,
            updated_by: user?.id
          });
        }
      } catch (err: any) {
        if (isTableMissingError(err)) {
          localStorage.setItem('db_notification_settings', JSON.stringify(body));
        } else {
          throw err;
        }
      }

      return { success: true } as T;
    }

    if (path.startsWith('/member/inbox/')) {
      const id = path.split('/')[3];
      try {
        const { data, error } = await supabase.from('inbox_submissions').update(body).eq('id', id).select().single();
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const subs = JSON.parse(localStorage.getItem('db_inbox_submissions') || '[]');
          const idx = subs.findIndex((s: any) => s.id === id);
          if (idx > -1) {
            subs[idx] = { ...subs[idx], ...body, actioned_at: new Date().toISOString() };
            localStorage.setItem('db_inbox_submissions', JSON.stringify(subs));
            return { data: subs[idx] } as T;
          }
        }
        throw err;
      }
    }

    if (path.startsWith('/inventory/checkout-request/')) {
      const id = path.split('/')[3];
      try {
        const { data, error } = await supabase.from('checkout_requests').update(body).eq('id', id).select().single();
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const reqs = JSON.parse(localStorage.getItem('db_checkout_requests') || '[]');
          const idx = reqs.findIndex((r: any) => r.id === id);
          if (idx > -1) {
            reqs[idx] = { ...reqs[idx], ...body, actioned_at: new Date().toISOString() };
            localStorage.setItem('db_checkout_requests', JSON.stringify(reqs));
            return { data: reqs[idx] } as T;
          }
        }
        throw err;
      }
    }

    if (path.startsWith('/inventory/return-request/')) {
      const id = path.split('/')[3];
      try {
        const { data, error } = await supabase.from('return_requests').update(body).eq('id', id).select().single();
        if (error) throw error;
        return { data } as T;
      } catch (err: any) {
        if (isTableMissingError(err)) {
          const reqs = JSON.parse(localStorage.getItem('db_return_requests') || '[]');
          const idx = reqs.findIndex((r: any) => r.id === id);
          if (idx > -1) {
            reqs[idx] = { ...reqs[idx], ...body, actioned_at: new Date().toISOString() };
            localStorage.setItem('db_return_requests', JSON.stringify(reqs));
            return { data: reqs[idx] } as T;
          }
        }
        throw err;
      }
    }

    throw new Error(`Endpoint PATCH ${path} not implemented`);
  },

  del: async <T>(path: string, body?: any, _token?: string): Promise<T> => {
    if (path.startsWith('/users/')) {
      const id = path.split('/')[2];
      const res = await fetch(`/api/delete-user?id=${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${sessionStorage.getItem('active_api_token')}`
        }
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to delete user');
      return json as T;
    }

    if (path === '/loans') {
      const ids = body.ids || [];
      const { error } = await supabase.from('loans').delete().in('loan_no', ids);
      if (error) throw new Error(error.message);
      return { success: true } as T;
    }

    if (path.startsWith('/inventory/kits/')) {
      const id = path.split('/')[3];
      const { data: kit } = await supabase.from('kits').select('child_units').eq('kit_no', id).single();
      if (kit && kit.child_units && kit.child_units.length > 0) {
        await supabase.from('units').update({ status: 'available' }).in('id', kit.child_units);
      }
      const { error } = await supabase.from('kits').delete().eq('kit_no', id);
      if (error) throw new Error(error.message);
      return { success: true } as T;
    }

    if (path.startsWith('/inventory/units/')) {
      const id = path.split('/')[3];
      const { data: unit } = await supabase.from('units').select('product_id, status').eq('unit_no', id).single();
      if (unit) {
        const { data: product } = await supabase.from('products').select('*').eq('id', unit.product_id).single();
        if (product) {
          await supabase.from('products').update({
            total_quantity: Math.max(0, (product.total_quantity || 0) - 1),
            available_quantity: unit.status === 'available' ? Math.max(0, (product.available_quantity || 0) - 1) : product.available_quantity
          }).eq('id', product.id);
        }
      }
      const { error } = await supabase.from('units').delete().eq('unit_no', id);
      if (error) throw new Error(error.message);
      return { success: true } as T;
    }

    if (path.startsWith('/inventory/products/')) {
      const id = path.split('/')[3];
      const { error } = await supabase.from('products').delete().eq('product_no', id);
      if (error) throw new Error(error.message);
      return { success: true } as T;
    }

    if (path.startsWith('/campaigns/')) {
      const id = path.split('/')[2];
      const { error } = await supabase.from('campaigns').delete().eq('campaign_no', id);
      if (error) throw new Error(error.message);
      return { success: true } as T;
    }

    throw new Error(`Endpoint DELETE ${path} not implemented`);
  }
};
