# Home Base account database setup

The application code supports secure email-link login, cross-device progress,
protected trip uploads, and a privacy-thresholded local hourly-rate benchmark.
The database is not active until the owners create and configure a Supabase
project.

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
6. Run **Refresh live provider signals** from the repository Actions tab, or
   wait for the next scheduled run. The deployment writes those public values
   into `runtime-config.js`.

The publishable key is intended for browser use. Row Level Security in the SQL
migration limits every private table to the signed-in user. Do not add a
Supabase secret key or service-role key to `dist/`, source control, or chat.

Community hourly-rate results appear only after a market/day/hour group contains
at least five consenting users and twenty trips. The function returns only the
aggregate, never another driver's individual rows.
