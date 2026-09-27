# Home Base account database setup

This is an approval and deployment checklist for secure email-link login,
cross-device progress, protected trip uploads, and a privacy-thresholded local
hourly-rate benchmark. Cloud transmission is not wired into the live app. It
must remain off until both owners approve Supabase as the data processor and
complete the steps below.

1. Create a Supabase project owned by the Home Base organization.
2. Open **SQL Editor**, paste the complete contents of
   `supabase/migrations/20260927_home_base_accounts.sql`, and choose **Run**.
3. In **Authentication → URL configuration**, set the Site URL to the GitHub
   Pages URL and add the same URL as an allowed redirect URL.
4. In the Supabase **Connect** dialog, copy the Project URL and the publishable
   key. Never use the secret/service-role key in the browser.
5. In the GitHub repository, open **Settings → Secrets and variables → Actions →
   Variables** and add:
   - `SUPABASE_URL` — the project URL
   - `SUPABASE_PUBLISHABLE_KEY` — the publishable browser key
6. Review the privacy notice, retention period, breach-response process, and
   deletion workflow with both owners before wiring the browser client.
7. After approval, wire the reviewed account client in a separate pull request,
   then run **Refresh live provider signals** from the repository Actions tab.

The publishable key is intended for browser use. Row Level Security in the SQL
migration limits every private table to the signed-in user. Do not add a
Supabase secret key or service-role key to `dist/`, source control, or chat.

Community hourly-rate results appear only after a market/day/hour group contains
at least five consenting users and twenty trips. The function returns only the
aggregate, never another driver's individual rows.
