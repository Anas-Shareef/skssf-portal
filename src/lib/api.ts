import { supabase } from './supabaseClient';

export const api = {
  baseUrl: '',

  get: async <T>(path: string, _token?: string): Promise<T> => {
    if (path === '/auth/me') {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Unauthenticated');
      const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
      if (error || !profile) throw new Error('Profile not found');
      return { user: { ...profile, address: profile.addr } } as T;
    }

    if (path === '/bootstrap') {
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
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('loans').select('*').order('created_at', { ascending: false }),
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
      return { token: authData.session?.access_token, user: { ...profile, address: profile.addr } } as T;
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
        const { error: profileError } = await supabase.from('profiles').update({
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
          is_approver: body.is_approver || false
        }).eq('id', user.id);
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
        name: body.name,
        branch: body.branch,
        mob: body.mob || body.phone,
        amount: body.amount,
        purpose: body.purpose,
        purpose_desc: body.purpose_desc,
        months: body.months,
        status: body.status || 'pending',
        submitted_date: body.submitted_date || new Date().toISOString().split('T')[0],
        guarantors: body.guarantors || [],
        repayments: body.repayments || [],
        request: body.request || {},
        audit: body.audit || [],
        signature: body.signature,
        witnesses: body.witnesses || []
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



    throw new Error(`Endpoint POST ${path} not implemented`);
  },

  patch: async <T>(path: string, body?: any, _token?: string): Promise<T> => {
    if (path.startsWith('/users/')) {
      const id = path.split('/')[2];
      const { data, error } = await supabase.from('profiles').update({
        name: body.name,
        role: body.role,
        phone: body.phone,
        branch: body.branch,
        member_no: body.member_no,
        occupation: body.occupation,
        designation: body.designation,
        avatar: body.avatar,
        addr: body.addr || body.address,
        dob: body.dob,
        gender: body.gender,
        salary: body.salary,
        active: body.active,
        join_date: body.join_date,
        sahachari_paid: body.sahachari_paid,
        sah_miss: body.sah_miss,
        total_donated: body.total_donated,
        perms: body.perms,
        is_approver: body.is_approver
      }).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path.startsWith('/loans/')) {
      const id = path.split('/')[2];
      const { data, error } = await supabase.from('loans').update(body).eq('id', id).select().single();
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
      }).eq('id', id).select().single();
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
      }).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path.startsWith('/inventory/kits/')) {
      const id = path.split('/')[3];
      const { data, error } = await supabase.from('kits').update({
        name: body.name,
        child_units: body.child_units || body.childUnits
      }).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
    }

    if (path.startsWith('/inventory/units/')) {
      const id = path.split('/')[3];
      const { data, error } = await supabase.from('units').update(body).eq('id', id).select().single();
      if (error) throw new Error(error.message);
      return { data } as T;
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
      const { data: kit } = await supabase.from('kits').select('child_units').eq('id', id).single();
      if (kit && kit.child_units && kit.child_units.length > 0) {
        await supabase.from('units').update({ status: 'available' }).in('id', kit.child_units);
      }
      const { error } = await supabase.from('kits').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { success: true } as T;
    }

    if (path.startsWith('/inventory/units/')) {
      const id = path.split('/')[3];
      const { data: unit } = await supabase.from('units').select('product_id, status').eq('id', id).single();
      if (unit) {
        const { data: product } = await supabase.from('products').select('*').eq('id', unit.product_id).single();
        if (product) {
          await supabase.from('products').update({
            total_quantity: Math.max(0, (product.total_quantity || 0) - 1),
            available_quantity: unit.status === 'available' ? Math.max(0, (product.available_quantity || 0) - 1) : product.available_quantity
          }).eq('id', product.id);
        }
      }
      const { error } = await supabase.from('units').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { success: true } as T;
    }

    if (path.startsWith('/inventory/products/')) {
      const id = path.split('/')[3];
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { success: true } as T;
    }

    if (path.startsWith('/campaigns/')) {
      const id = path.split('/')[2];
      const { error } = await supabase.from('campaigns').delete().eq('id', id);
      if (error) throw new Error(error.message);
      return { success: true } as T;
    }

    throw new Error(`Endpoint DELETE ${path} not implemented`);
  }
};
