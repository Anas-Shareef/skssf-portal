# SKSSF Portal — Production Implementation Audit

**Date:** 2026-11-01
**Production URL:** https://skssf-portal.vercel.app
**Repository:** https://github.com/Anas-Shareef/skssf-portal (`main`)
**Supabase project:** `jgxzdwbixqhkjrdbhnlc`
**Audit type:** Read-only. No migrations run, no production rows written, no deployment performed.

---

## 0. Verdict

The applicant-tracking implementation **exists in the local working tree** and builds
successfully, but it is **not on GitHub and not deployed to production**.

| Layer | State |
|---|---|
| Local repository | `main` at `ac519ec`; tracking code present in `861ab95` |
| GitHub `origin/main` | `5c22b15` — **2 commits behind local** |
| Production bundle | Matches `5c22b15` — **tracking pages/API absent** |
| Database migrations 016–018 | **Not applied** (columns, tables and RPCs confirmed absent) |
| Production env (tracking) | `APPLICANT_TRACKING_SECRET` / Twilio variables not verifiable; the accessible Vercel project does not have them |
| Deploy access | The authenticated Vercel CLI manages **`skssf-main.vercel.app`**, not `skssf-portal.vercel.app` |

Consequently:

- `/request/MBR-0BB5` still opens the old application form instead of the two-option landing page.
- `/request/MBR-0BB5/apply` and `/request/MBR-0BB5/track` render a blank page.
- `/api/track-application` is not deployed.
- Member history returns **503** and applicant/member editing returns **503**.
- Witness fields in Section C are blank because the columns do not exist.

The repair is a **delivery problem plus a database migration problem**, not a missing
implementation.

---

## 1. Repository audit

### 1.1 Git state

```
branch:            main
HEAD:              ac519ec  docs: add combined applicant tracking SQL
previous:          861ab95  feat(applicant-tracking): add secure public status flow
origin/main:       5c22b15  fix(applications): persist complete applicant and witness details
working tree:      clean
ahead of origin:   2 commits
```

`git push --dry-run origin main` reports `5c22b15..ac519ec main -> main`, so the
machine has push access to the GitHub repository.

### 1.2 Commit `861ab95` — present in the working tree

```
api/submit-loan-application.js                        +129
api/track-application.js                              +273  (new)
docs/applicant-tracking-setup.md                       +18
src/App.tsx                                            +12
src/pages/ApplicantTracking.tsx                       +181  (new)
src/pages/PublicLoanRequest.tsx                        +24
src/pages/PublicLoanServices.tsx                       +67  (new)
src/pages/coordinator/CoordinatorLoanDetail.tsx        +22
src/pages/coordinator/PanelVotes.tsx                   +18
supabase/migrations/018_applicant_tracking_and_status_events.sql +237
```

`ac519ec` adds the combined paste-ready SQL file
`docs/apply-applicant-tracking-migrations.sql` (992 lines, four balanced
`BEGIN`/`COMMIT` blocks).

### 1.3 Public routes in the working tree (`src/App.tsx`)

| Route | Component |
|---|---|
| `/request` | `PublicLoanServices` (two-option landing) |
| `/request/apply` | `PublicLoanRequest` |
| `/request/track` | `ApplicantTracking` |
| `/request/:code` | `PublicLoanServices` |
| `/request/:code/apply` | `PublicLoanRequest` |
| `/request/:code/track` | `ApplicantTracking` |

### 1.4 Local build verification

`npm run build` exits `0` and produces `dist/assets/index-DBhb-SXy.js`
(1,876,610 bytes). The bundle contains `track-application`, `Track Application`
and `How can we help?`.

Running `vite preview` locally:

- `/request/MBR-0BB5` → renders the two-option landing page.
- `/request/MBR-0BB5/track` → renders the OTP/reference form.
- `/request/MBR-0BB5/apply` → renders the application wizard (or "Invalid Link"
  locally because the serverless resolver is not running in `vite preview`).

`node --check` passes for `api/track-application.js`,
`api/submit-loan-application.js` and `api/get-member-inbox.js`.
Targeted ESLint on the new pages passes.

### 1.5 What the implementation already contains

- Server-generated references (`SKSSF-LN-YYYY-XXXXXXXX`); existing references are
  not rewritten.
- Hashed OTP challenges, short-lived hashed sessions, generic send response.
- Applicant details, witness verification state, status timeline and edit form.
- Edit lock enforced twice: in the API (`DRAFT_UNASSIGNED` and no loan) and in the
  PostgreSQL RPC (`FOR UPDATE`, version check, converted/loan check).
- Append-only `loan_application_versions` history with original snapshot.
- Status-event bridge on submit, member forwarding, coordinator review, panel
  decision and final decision.
- Witness display and application history for members and admins.

### 1.6 What is missing in the repository

| Item | Status |
|---|---|
| Post-forwarding "correction request" workflow | **Not implemented.** Only pre-forwarding self-editing exists. If a formal correction-request flow is required, it must be designed separately. |
| `.env.example` documentation for server variables | Missing; file only contains `VITE_API_BASE_URL`. |
| Explicit JSON 404 for unknown `/api/*` paths | Missing; the SPA catch-all returns `index.html`. |
| OTP hardening (per-challenge salt / HMAC) | Current design uses a global pepper (see §9). |

---

## 2. Production deployment audit

### 2.1 What production actually serves

`https://skssf-portal.vercel.app/` loads:

```
/assets/index-BBgGh7LA.js   1,853,948 bytes
/assets/index-Z_eI3i30.css
```

The production JavaScript:

- **contains** `Section C — Witness Verifications`,
  `History migration is pending`, `Father's name`, `EDITED`
  (features from `3893c49` / `5c22b15`);
- **does not contain** `How can we help?`, `Track My Application`,
  `Apply for a Loan`, `track-application`.

That is an exact match for commit `5c22b15` and rules out the tracking commit.

The deployment timestamp corroborates this: the production `index.html` has
`Last-Modified: Sun, 01 Nov 2026 06:31:52 GMT`; commit `5c22b15` was committed at
`06:31:10 UTC` (12:01:10 +0530). The tracking commits are timestamped `12:35` and
`12:45` IST — after the last production build.

### 2.2 Route behaviour on production

| URL | Result |
|---|---|
| `/request/MBR-0BB5` | Old application form (wizard) — **not** the landing page |
| `/request/MBR-0BB5/apply` | Blank page (HTTP 200 `index.html`, no matching route) |
| `/request/MBR-0BB5/track` | Blank page (HTTP 200 `index.html`, no matching route) |
| `/request`, `/request/apply`, `/request/track` | Blank page |

### 2.3 API behaviour on production

| Endpoint | Result | Meaning |
|---|---|---|
| `GET /api/submit-loan-application` | `405 {"error":"Method not allowed"}` | Deployed |
| `POST /api/submit-loan-application` (public, invalid name) | `400 {"error":"Applicant full name is required."}` | Deployed and validating |
| `POST /api/get-member-inbox` (no token) | `401 {"error":"Unauthenticated"}` | Deployed |
| `GET /api/track-application` | `200 text/html` (the SPA) | **Not deployed** |
| `POST /api/track-application` | `405` (static-file method rejection) | **Not deployed** |

`GET /api/resolve-member-code?code=MBR-0BB5` returns a valid member, which proves
the production project has a working `SUPABASE_SERVICE_ROLE_KEY`.

### 2.4 Vercel access mismatch (important)

The authenticated Vercel CLI is:

```
user:  lucaworldin-9647
team:  Luca Glow's projects (luca-glow-s-projects)
```

Projects visible:

```
skssf-main                 → https://skssf-main.vercel.app   (bundle index-BSVdB1pV.js)
green-paper-grocery
mahall-management-system
luca-world-admin
luca-glow-admin
lucaworld.vercel.app
luca-glow-frontend
```

`https://skssf-portal.vercel.app` is **not** in this team.
`vercel inspect https://skssf-portal.vercel.app` returns
`Can't find the deployment ... under the context "luca-glow-s-projects"`.

There are therefore **two different Vercel deployments of this codebase**:

1. `skssf-portal.vercel.app` — the client's production site (outside this CLI).
2. `skssf-main.vercel.app` — a side project this CLI can deploy to; it is also
   behind (`index-BSVdB1pV.js`, no tracking pages).

Running `vercel --prod` from this repository would deploy to **`skssf-main`**, not
to the production site the client is using.

### 2.5 Deployment conclusion

- The tracking implementation was committed locally but **never pushed**.
- GitHub `main` is the last deployed state (`5c22b15`).
- Production deployment is almost certainly Git-driven (timestamp matches the
  push), but this could not be confirmed in the Vercel dashboard because the
  project is outside the authenticated team.
- Pushing `main` may auto-deploy production **if** the client's project is
  Git-connected; otherwise the client must trigger the deployment from their
  Vercel account.

---

## 3. Original bug audit

### 3.1 `/api/get-member-inbox` returning 503 — actual root cause

The inbox **list** endpoint is healthy. The 503 comes from the **POST actions**.

`api/get-member-inbox.js`, `action = "history"`:

```js
.from('loan_application_versions')
.select('id, loan_request_id, application_version, ...')
```

`public.loan_application_versions` does not exist in production. PostgREST returns
`PGRST205`; the API maps that to:

```js
return res.status(503).json({ error: 'Application history is not enabled yet.' });
```

The member UI converts any 503 from that call into:

> "History migration is pending. Editing will be available after the database
> migration is applied."

That is exactly the message in the screenshot.

`action = "edit"` has the same failure mode for a different reason:

```js
const { data, error } = await supabase.rpc('apply_loan_request_edit', ...);
if (error.code === 'PGRST202') return res.status(503)
  .json({ error: 'Application editing is not enabled yet.' });
```

The RPC does not exist in production (confirmed, §4).

**Earlier 500 is fixed:** the endpoint no longer writes `status = 'REVIEWED'` when a
member opens a card (`api/get-member-inbox.js:223-231`). The old
`loan_requests_status_check` violation that produced HTTP 500 is gone from the
code. Migration 015 also broadens the constraint, but 015 is not confirmed applied.

### 3.2 Missing witness information in Section C — actual root cause

1. Migration 017 is not applied, so `loan_requests` has **no** `witness1_name`,
   `witness1_phone`, `witness2_name`, `witness2_phone` or `witnesses` columns.
2. The submit API probes for those columns before writing:

   ```js
   const { error: detailSchemaError } = await supabase
     .from('loan_requests')
     .select('application_reference, applicant_father_name, ..., witness1_name, ..., witnesses')
     .limit(1);
   if (!detailSchemaError) { /* add extended fields */ }
   ```

   The probe fails with `42703`, so the API deliberately omits the extended fields.
   The application still saves, but witness values are **not persisted as columns**.
3. The witness data is still present inside the `reason` summary text:

   ```
   Witness 1: <name> (<phone>)
   Witness 2: <name> (<phone>)
   ```

   Migration 017 backfills the witness columns from that text.
4. The inbox reads `select('*')`; `getWitnesses()` finds no witness columns and
   returns `[]`, so Section C renders empty inputs.

**Not a display bug — the columns and the write are gated on a migration that was
never applied.**

### 3.3 Application history migration-pending message

Same root cause as §3.1: missing `loan_application_versions` (migration 016).

### 3.4 Does public submission save all fields?

The public form (`src/pages/PublicLoanRequest.tsx`) sends every field, including
father/guardian, occupation, employer, address parts, income, declarations and two
witnesses. The API persists:

- **Always (legacy schema):** name, phone, address summary, amount, purpose,
  category, period, DOB, gender, WhatsApp, address parts, income, debts,
  declaration flag, referral, status; plus the full `reason` summary.
- **Only when migration 017 is present:** `application_reference`,
  `applicant_father_name`, `applicant_occupation`, `applicant_employer_name`,
  `declaration_truth_confirmed`, `declaration_schedule_confirmed`, witness columns
  and the `witnesses` JSONB.

So on today's production schema, submissions succeed but silently drop the extended
columns (they remain recoverable from `reason`).

The legacy payload columns were verified to exist in production
(`requester_name`, `requester_phone`, `requester_address`, `reason`,
`approximate_amount`, `loan_amount_requested`, `loan_purpose_category`,
`loan_purpose_detail`, `repayment_period_months`, `applicant_name`,
`applicant_phone`, `applicant_dob`, `applicant_gender`, `applicant_whatsapp`,
`applicant_address_house/street/city/pin`, `monthly_income`, `income_source`,
`existing_debts`, `existing_debts_detail`, `declaration_agreed`,
`referred_member_id`, `referred_member_name`, `status`, `created_at`).
`updated_at` does **not** exist yet (added by migration 016).

### 3.5 Does the inbox return saved witness records?

`select('*')` returns whatever columns exist. On the current schema there are no
witness columns, so there is nothing to return. After migration 017, existing rows
are backfilled from `reason` and new rows are written with witness columns and
`witnesses` JSONB.

---

## 4. Database audit (read-only)

Method: PostgREST schema probes against
`https://jgxzdwbixqhkjrdbhnlc.supabase.co` using the public anon key. A missing
column returns `42703`; a missing table returns `PGRST205`. No rows were read
(RLS) and nothing was written.

### 4.1 Confirmed absent

**`loan_requests` columns**

```
application_version          last_edited_at
application_reference        applicant_father_name
applicant_occupation         applicant_employer_name
applicant_employment_type    applicant_monthly_income
applicant_address_place      applicant_address_post
applicant_address_district   witnesses
witness1_name                witness1_phone        witness1_member_no
witness2_name                witness2_phone        witness2_member_no
witness3_name                witness3_phone        witness3_member_no
declaration_truth_confirmed  declaration_schedule_confirmed
member_reviewed_at           member_recommended_amount
member_relationship
```

**`loans` columns**

```
application_reference   applicant_dob   applicant_gender
applicant_father_name   applicant_whatsapp
applicant_address_house / street / city / pin
witness1_name/phone/member_no/status/verified_at
witness2_name/phone/member_no/status/verified_at
```

**Tables**

```
public.loan_application_versions
public.applicant_tracking_challenges
public.applicant_tracking_sessions
public.application_status_events
```

**RPCs**

```
public.apply_loan_request_edit            → PGRST202 (not found)
public.apply_applicant_loan_request_edit  → PGRST202 (not found)
```

### 4.2 Confirmed present (legacy schema)

`loan_requests` already has `applicant_name`, `applicant_phone`,
`applicant_whatsapp`, `applicant_dob`, `applicant_gender`,
`applicant_address_house`, `applicant_address_street`, `applicant_address_city`,
`applicant_address_pin`, `loan_amount_requested`, `loan_purpose_category`,
`loan_purpose_detail`, `repayment_period_months`, `monthly_income`,
`income_source`, `existing_debts`, `existing_debts_detail`, `declaration_agreed`,
`referred_member_id`, `referred_member_name`, `status`, `created_at`.

`loans` already has `witnesses` (JSONB) but none of the individual witness columns,
so the current submit probe still skips it.

### 4.3 Migration 015 status

015 is not directly observable through PostgREST (it changes a CHECK constraint,
RLS policies and adds a partial unique index). Because 016/017/018 are absent and
were meant to run after 015, the safe assumption is that **the batch was never
applied**. 015 is still required before 016–018.

### 4.4 Migration risks / pre-flight checks

Run these **before** pasting the combined SQL (read-only):

```sql
-- 1. Status values must satisfy the new CHECK constraint in 015
SELECT status, COUNT(*) FROM public.loan_requests GROUP BY status ORDER BY 1;

-- 2. 015 creates a UNIQUE index on loans(source_request_id); duplicates abort it
SELECT source_request_id, COUNT(*)
FROM public.loans
WHERE source_request_id IS NOT NULL
GROUP BY source_request_id
HAVING COUNT(*) > 1;

-- 3. Confirm the extended columns are still absent
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'loan_requests'
  AND column_name IN ('application_version','application_reference','witnesses','witness1_name');

-- 4. 017 casts DOB text from `reason` to DATE; list any unparsable value
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, (regexp_match(reason, 'DOB:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})'))[1] AS d
    FROM public.loan_requests
    WHERE reason ~ 'DOB:\s*[0-9]{4}-[0-9]{2}-[0-9]{2}'
  LOOP
    BEGIN
      PERFORM r.d::date;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Unparsable DOB on request %: %', r.id, r.d;
    END;
  END LOOP;
END $$;
```

After 017 and **before** 018, check for duplicate references:

```sql
SELECT application_reference, COUNT(*)
FROM public.loan_requests
WHERE application_reference IS NOT NULL
GROUP BY 1
HAVING COUNT(*) > 1;
```

If duplicates exist, 018's unique partial index fails. Because each migration has
its own `BEGIN/COMMIT`, 015–017 would remain applied while 018 rolls back. Running
the file section by section (015 → 016 → 017 → check → 018) avoids a confusing
partial state.

### 4.5 Backfill behaviour (017)

- `application_reference` is recovered from
  `reason ~ 'Application Reference: ...'` only when the column is null.
- Father, DOB, gender and witness values are recovered from the saved `reason`
  summary only; nothing is invented.
- Existing `loans` rows are aligned from their source request with
  `COALESCE` (existing populated values win).
- Rows created before the reference was written into `reason` (before commit
  `90299b9`) cannot be backfilled and will not be trackable by reference.

---

## 5. Tracking feature audit (working tree)

| Requirement | Status in repo | Status in production |
|---|---|---|
| `/request/:code` two-option landing | Implemented | **Old form** |
| `/request/:code/apply` | Implemented | Blank |
| `/request/:code/track` | Implemented | Blank |
| `/api/track-application` | Implemented (POST) | Not deployed |
| OTP verification | Hashed challenge, 6 digits, 10-min expiry, 5 attempts | Not reachable |
| Applicant details | Implemented | Not reachable |
| Status timeline | `application_status_events` + versions | Not reachable |
| Applicant editing | Implemented via RPC | Not reachable |
| Editing lock after forwarding | API + RPC enforce `DRAFT_UNASSIGNED` and no loan | Not reachable |
| Correction-request workflow | **Not implemented** | Not reachable |

Status mapping (`applicantStatus`) is derived from existing values, not a new
status model:

```
DISMISSED                                  → Cancelled
no loan                                    → Under Member Review
loan.workflow_status PENDING_COORDINATOR   → Under Admin Review
loan.workflow_status PENDING_APPROVAL_PANEL→ Under Super Admin Review
approved / workflow APPROVED               → Approved
rejected / workflow REJECTED*              → Rejected
disbursement_date                          → Disbursed
REPAYMENT_COMPLETE                         → Repayment Complete
otherwise                                  → Forwarded to Admin
```

The edit RPC (`apply_applicant_loan_request_edit`) locks the row `FOR UPDATE`,
checks status, converted request, existing loan and expected version, writes the
append-only version row and updates the canonical row in one transaction.

---

## 6. Environment configuration

### 6.1 Required for tracking

| Variable | Purpose | Present? |
|---|---|---|
| `SUPABASE_URL` | Server Supabase URL | Yes (production APIs work) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes/reads | Yes (`resolve-member-code` succeeds) |
| `APPLICANT_TRACKING_SECRET` | Hash phone/OTP/session | **Not verifiable / not on accessible project** |
| `TWILIO_ACCOUNT_SID` | SMS provider | **Not verifiable** |
| `TWILIO_AUTH_TOKEN` | SMS provider | **Not verifiable** |
| `TWILIO_FROM_NUMBER` | Sender | **Not verifiable** |
| `TWILIO_DEFAULT_COUNTRY_CODE` | Optional, defaults to `91` | Not required |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Client bundle | Yes |

### 6.2 Accessible Vercel project (`skssf-main`)

`vercel env ls production` shows only:

```
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
```

No tracking or Twilio variables.

### 6.3 Local `.env.local` caveat

The local `SUPABASE_SERVICE_ROLE_KEY` is an `sb_secret_...` value of 41 characters
and returns **401** against the production project. It is not a usable production
key. Do not copy it into Vercel or use it for migration work. The anon key is valid
for schema probes.

### 6.4 Where to set the variables

They must be set on the **`skssf-portal` Vercel project** (the client's project),
not on `skssf-main`. This audit cannot list that project's variables because it is
outside the authenticated team.

---

## 7. Security review

| # | Issue | Severity | Detail | Recommendation |
|---|---|---|---|---|
| 1 | `GET /api/resolve-member-code` exposes PII | **High** | Unauthenticated; returns internal UUID, phone, role and branch for any member code. Returns `404` for unknown codes, enabling enumeration. `MBR-` fallback matches UUID prefixes. | Return only `{ name, branch }`; always return a generic response; add rate limiting. |
| 2 | OTP hashing uses a global static pepper | **Medium** | `sha256(secret + ':' + otp)` over a 6-digit space. A database leak allows instant offline recovery of all live OTPs. | Use HMAC-SHA256 with a per-challenge random salt, or bcrypt/argon2. |
| 3 | No IP rate limit on `verify` | **Medium** | Per-challenge limit is 5; 5 challenges/hour/phone → ~25 guesses/hour. | Add per-IP attempt limiting and lockout. |
| 4 | Unknown `/api/*` returns `index.html` 200 | **Medium (operational)** | `vercel.json` ends with `/(.*) → /index.html`; the `/api/(.*) → /api/$1` rewrite is a no-op. Missing functions return HTML, so clients get JSON parse errors instead of a clear 404. | Remove the self-rewrite; add an explicit `/api/*` JSON 404 before the SPA fallback. |
| 5 | Public submission has no rate limit/CAPTCHA | **Medium** | Anyone can create unlimited `DRAFT_UNASSIGNED` rows. | Add IP/phone throttling or a lightweight challenge. |
| 6 | CORS `*` on tracking and submission | **Low** | Bearer-token based, so not CSRF, but any origin can call. | Restrict to the portal origin. |
| 7 | Service-role key server-only | **OK** | No service key in the client bundle or tracked files. | Keep it that way. |
| 8 | Tracking tables are service-role only | **OK** | RLS enabled with no browser policies. | Keep. |
| 9 | Edit RPC is service-role only and locked | **OK** | `SECURITY DEFINER`, `search_path=public`, status/version/loan guards. | Keep. |
| 10 | Public repo visibility | **Info** | `git ls-remote` succeeds without prompting; verify repository visibility. No secrets are tracked (`.env*` ignored; only `.env.example` is tracked). | Confirm repo visibility and secret scanning. |

---

## 8. Recommended fixes in priority order

### P0 — Enable the feature

1. **Snapshot the database** (Supabase backup or `pg_dump`) and run the §4.4
   pre-flight queries.
2. **Apply the SQL** from `docs/apply-applicant-tracking-migrations.sql` in the
   Supabase SQL Editor (`jgxzdwbixqhkjrdbhnlc`), ideally section by section:
   015 → 016 → 017 → duplicate-reference check → 018. Capture any exact error
   before retrying.
3. **Set production env vars** on the `skssf-portal` Vercel project:

   ```
   APPLICANT_TRACKING_SECRET=<64+ hex chars>
   TWILIO_ACCOUNT_SID=...
   TWILIO_AUTH_TOKEN=...
   TWILIO_FROM_NUMBER=+91...
   TWILIO_DEFAULT_COUNTRY_CODE=91
   ```

   Generate the secret with
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

4. **Publish the commits**: `git push origin main` (dry-run already confirms
   access). Then confirm the `skssf-portal` deployment picked up `ac519ec`.
   If the project is not Git-connected, the client must redeploy from their
   Vercel account. **Do not use `vercel --prod` from this repo** — it targets
   `skssf-main`.

### P1 — Verify end to end

5. Open `/request/MBR-0BB5` and confirm the two-option landing page.
6. Submit a fresh `DRAFT_UNASSIGNED` test application and confirm the returned
   `SKSSF-LN-2026-XXXXXXXX` reference is stored in `application_reference` and in
   `reason`.
7. Track it with reference + registered mobile + OTP; verify details, witnesses,
   timeline, editing, version increment, and the lock after forwarding.
8. Confirm an existing `PYD-IL-2026-*` reference was backfilled and can be tracked.
9. Verify the member inbox: Section C witness data, history panel, edit button,
   and the "migration pending" message is gone.
10. Verify admin/superadmin detail, witness and history views; run one full
    coordinator → panel → decision path.

### P2 — Harden

11. Fix `vercel.json` so unknown `/api/*` returns JSON 404.
12. Harden `resolve-member-code` (data minimisation + rate limit).
13. Strengthen OTP hashing and add verify rate limiting.
14. Update `.env.example` and `docs/applicant-tracking-setup.md` with the full
    variable list and the deploy target warning.
15. Consider a CAPTCHA/throttle on public submission.

### P3 — Housekeeping

16. Repository-wide TypeScript/ESLint errors in unrelated dashboard/inventory
    files are pre-existing and out of scope for this repair.
17. Correct the placeholder commit author email
    (`your-correct-github-email@example.com`) before future commits if attribution
    matters.

---

## 9. Exact commands / snippets

### Push (after approval)

```powershell
git push origin main
```

### Apply migrations

Supabase SQL Editor:
`https://supabase.com/dashboard/project/jgxzdwbixqhkjrdbhnlc/sql/new`

Paste `docs/apply-applicant-tracking-migrations.sql`.

### Post-migration smoke checks

```sql
SELECT count(*) FROM public.loan_application_versions;
SELECT count(*) FROM public.application_status_events;
SELECT count(*) FROM public.loan_requests WHERE application_reference IS NOT NULL;
SELECT count(*) FROM public.loan_requests WHERE witnesses <> '[]'::jsonb;
SELECT proname FROM pg_proc
WHERE proname IN ('apply_loan_request_edit','apply_applicant_loan_request_edit');
```

### Post-deploy smoke checks

```powershell
curl.exe -sS -o NUL -w "%{http_code} %{content_type}\n" https://skssf-portal.vercel.app/request/MBR-0BB5
curl.exe -sS -X POST https://skssf-portal.vercel.app/api/track-application `
  -H "Content-Type: application/json" -d '{\"action\":\"send\"}'
```

Expected after deploy: landing page HTML; tracking API returns a JSON configuration
error (503) rather than HTML/405 until the env vars are set, then a generic success
message.

---

## 10. Evidence summary

| Claim | Evidence |
|---|---|
| Tracking code exists locally | `git show --stat 861ab95`; local build contains `track-application` |
| Tracking code is not on GitHub | `git ls-remote origin refs/heads/main` → `5c22b15`; local ahead 2 |
| Tracking is not deployed | production bundle lacks `track-application` / `How can we help?` |
| Production is `5c22b15` | bundle contains 5c22b15-only UI strings; deployment time matches the push |
| New routes are blank | browser + HTTP checks on `/request/.../apply` and `/track` |
| Track API missing | `GET /api/track-application` returns `index.html`; `POST` returns static 405 |
| Migrations 016–018 absent | `42703` for columns, `PGRST205` for tables, `PGRST202` for RPCs |
| Inbox history 503 cause | code path returns 503 on `PGRST205`; client shows "History migration is pending" |
| Witness blank cause | 017 absent → submit probe skips witness columns → inbox has nothing to render |
| Vercel mismatch | `vercel projects ls` / `vercel inspect skssf-portal.vercel.app` |
| Push access exists | `git push --dry-run origin main` → `5c22b15..ac519ec` |

---

*No production data was modified during this audit.*
