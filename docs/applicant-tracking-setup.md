# Applicant tracking deployment notes

Apply these migrations in order in the Supabase SQL Editor:

1. `015_member_inbox_status_and_rls_repair.sql`
2. `016_application_versions_and_member_editing.sql`
3. `017_complete_applicant_details.sql`
4. `018_applicant_tracking_and_status_events.sql`

Configure these Vercel server environment variables before enabling applicant OTP tracking:

- `APPLICANT_TRACKING_SECRET`: long random secret used to hash phone numbers, OTPs and sessions.
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TWILIO_DEFAULT_COUNTRY_CODE` (optional; defaults to `91`)

The tracking endpoint intentionally returns a configuration error when the secret or SMS provider is absent. It never returns an OTP or logs one. The service-role key remains server-only.
