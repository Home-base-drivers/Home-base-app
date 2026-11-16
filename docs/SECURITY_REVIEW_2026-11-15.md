# Security review, 2026-11-15

ChatGPT's read-only audit (ArcHive document "Security audit P0/P1 handoff to Claude",
2026-11-14) was checked against the live Home Base project (`nixihmurdtfcbffgvpij`) and
`main` at 21346e2. Every finding was verified with read-only queries; nothing was probed
or changed live.

| # | Finding | Verdict | Evidence | Fix in this change |
|---|---------|---------|----------|--------------------|
| P0 | TRUNCATE, TRIGGER, REFERENCES granted to client roles on 11 tables (anon on 4) | **Confirmed** | `information_schema.role_table_grants` matches the report row for row. Cause: Supabase's default privileges give `anon`/`authenticated` every privilege on new public tables (`pg_default_acl`), and these tables' migrations never revoked them. Replaying the repo's migrations with that default reproduces the live grants exactly (`tests/security-grants.test.mjs`). No REST/RPC path to run TRUNCATE was found; it is a least-privilege gap, not a known exploit. | `20261116000000_least_privilege_grants.sql` revokes the three privileges from both client roles on every public table and in the defaults for new tables; platform tables become read-only grants. Rollback in `supabase/rollbacks/`. |
| P1 | Public billing health check runs Stripe setup | **Confirmed** | Deployed `billing` v7 imports `handler.mjs` from commit fb4d33d, byte-identical to `main`. `GET ?health=1` and `{operation:'health'}` call `ensureSetup()`, which can create products/prices, a webhook endpoint, a portal configuration and re-enable a disabled webhook. Signed-in driver requests and webhooks also called it. Whether a live Stripe key is set was not probed. | Health only looks things up and returns yes/no plus a `missing` list, no ids. Creation moved to `{operation:'setup'}`, signed-in owners only. Driver requests and webhooks look up only; checkout answers `billing_not_set_up` until setup. |
| P1 | `market-activity` lets anyone start a GitHub Actions run | **Confirmed** | Deployed v2 equals the repo. Any POST with a known market id could reach `workflow_dispatch` with the server's GitHub token; the Origin check is not authentication. Database rate limits (30 min per market, 10 min overall) cap it at about 6 runs an hour. | Recording a market stays open (it is only a market id). Starting a refresh now needs a verified, non-anonymous Supabase sign-in; the app sends the driver's sign-in with the ping when there is one. |
| P1/P2 | Drivers can edit their own AI memory and turn roles | **Confirmed** | `homebase_agent_memory`/`homebase_agent_turns`: policy `FOR ALL TO public` on own rows plus full grants to `authenticated` and `anon`. The dispatch function wrote both with the driver's own token, so the grants were in use; the phone itself never touches these tables. These tables were created by live migration `20261006194607 add_homebase_agent_memory`, which was never committed. | Migration recorded in the repo as it stands live. Writes now go through the service role in `dispatch/index.ts`, for the user id the handler verified. Drivers keep read access to their own rows only; insert/update/delete revoked. |
| P2 | Leaked-password protection off | **Confirmed** (security advisor) | Auth setting, not code. | Not changed: an owner turns it on in Supabase Auth settings. |
| P2 | 5 of 6 Edge Functions have `verify_jwt=false` | **Confirmed, intended** | `billing` (Stripe webhooks carry no JWT), `delete-account` and `dispatch` verify the token in the handler, `school-events` checks the client key and the user token, `market-activity` serves signed-out pings and now verifies sign-in before dispatch. | No change needed. |
| P2 | Runtime imports from raw.githubusercontent.com | **Confirmed for `billing`** | The deployed `billing` entry imports pinned files from GitHub at run time; the repo's own `index.ts` uses local files. | Next deploy should upload the local files (as `market-activity` already does), not the GitHub import. |
| — | `billing_events` RLS on with no policies | Intended | Server-only table; service role bypasses RLS. | None. |
| — | Live migration `sync_last_active_cron` not in the repo | Drift (new) | Listed in `supabase_migrations.schema_migrations`. | Not touched here; worth committing separately. |

## Not done here (needs an owner's yes)
- Apply the migration to the live database and deploy `billing`, `market-activity` and `dispatch`
  (the AI memory change must deploy together with, or before, the migration, or memory saving
  fails until it does).
- Turn on leaked-password protection.
- Review the GitHub token's scope (should be Actions: write on this repo only).
