# Home Base account database setup

This is an approval and deployment checklist for secure email-link login,
cross-device progress, protected trip uploads, and a privacy-thresholded local
hourly-rate benchmark. Both owners' approval of Supabase as the data processor
was confirmed by Christopher on October 2, 2026. The October 3 account interface
supports explicit device linking and private cloud save/restore. Complete email
delivery and real multi-device pilot verification before public onboarding.

The Home Base project has been created in the Homebase organization:
https://supabase.com/dashboard/project/nixihmurdtfcbffgvpij.
The account and earnings migrations below are already applied; October 3 growth
migrations add consent, optional learning and retention. Do not reapply them
manually. Public email delivery is still pending; see [BACKEND.md](BACKEND.md).

1. Create a Supabase project owned by the Home Base organization (completed).
2. Open **SQL Editor**, paste the complete contents of
   `supabase/migrations/20260927_home_base_accounts.sql`, and choose **Run**.
   Then apply `supabase/migrations/20261001212925_earnings_backend.sql`.
   The follow-up adds the private earnings ledger, connection status, versioned
   progress, explicit API grants, and additional ownership checks. See
   [BACKEND.md](BACKEND.md) for the API contract and hosted verification steps.
3. In **Authentication → URL configuration**, set the Site URL to the GitHub
   Pages URL and add the same URL as an allowed redirect URL.
4. In the Supabase **Connect** dialog, copy the Project URL and the publishable
   key. Never use the secret/service-role key in the browser.
5. In the GitHub repository, open **Settings → Secrets and variables → Actions →
   Variables** and add:
   - `SUPABASE_URL` — the project URL
   - `SUPABASE_PUBLISHABLE_KEY` — the publishable browser key
6. Both-owner data-processor approval is confirmed. Keep the privacy notice,
   retention period, breach-response process, and deletion workflow aligned
   with the shipped account functionality; data deletion is not Auth-account
   deletion or provider revocation.
7. After approval, wire the reviewed account client in a separate pull request,
   then run **Refresh live provider signals** from the repository Actions tab.

The publishable key is intended for browser use. Row Level Security in the SQL
migration limits every private table to the signed-in user. Do not add a
Supabase secret key or service-role key to `dist/`, source control, or chat.

Community hourly-rate results appear only after a market/day/hour group contains
at least five consenting users and twenty trips with explicit online hours.
Consent defaults off. Active-trip hours, payouts, delivery records, and future
or undated records do not enter this rideshare benchmark. The function returns
only the aggregate, never another driver's individual rows.

The account client is loaded by the live app. Signing in alone does not upload
device history. Automatic saves require explicitly linking this device first;
Uber/Lyft/Empower account synchronization remains unactivated.
