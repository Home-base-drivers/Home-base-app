# Home Base backend

The backend release provides Supabase Auth integration, a private earnings
ledger, saved progress with version conflict detection, and server-managed
platform connection status. The hosted project was provisioned on October 2,
2026 in the Homebase organization, in US East/Virginia (`us-east-1`).
The live app continues to store records on the device; the new client bundle
is not loaded by `index.html` and does not transmit anything automatically.

## Database and API

Apply the existing account migration followed by
`supabase/migrations/20261001212925_earnings_backend.sql`.

| Component | Behavior |
| --- | --- |
| `profiles` | Private driver profile; community benchmark consent defaults off |
| `user_state` | Private preferences, manual shifts, and planning history; versioned |
| `earnings_records` | Stable IDs per driver; gross and payouts separate; online, active, and unknown time separate |
| `account_connections` | Private connection status; connected status can only be written by a server adapter |
| `trip_uploads`, `trip_rows` | Legacy structured trip storage; upload ownership is enforced by a composite foreign key |
| `progress_events` | Private progress history |
| `save_home_base_state` | Compare the expected version before saving; stale requests fail with `40001` |
| `upsert_home_base_earnings` | Atomic batches of at most 500 records; repeated IDs update or skip; provider records are protected |
| `get_market_hourly_benchmark` | Baltimore rideshare online-hour aggregate; five consenting users and twenty trips required |
| `delete_my_home_base_data` | Clear this driver's Home Base records after disconnecting platforms; Auth identity remains |

Every exposed table has Row Level Security. Anonymous clients have no private
table or mutation access. API grants are explicit. Only the aggregate helper
uses privileged execution, in the unexposed `private` schema, with an explicit
authentication check. It returns no individual rows. Benchmarks are summaries
of consenting drivers' reported records, not independently verified live pay.

No provider passwords or tokens are stored in public tables. A production
adapter needs approved access and server-side secret storage before activation.

## App integration

`src/backend-client.mjs` implements the existing earnings CSV/ledger contract.
`npm run build:backend-client` bundles the pinned Supabase SDK into
`dist/homebase-backend.js`. Packages and transitive dependencies are locked.

The future account screen initializes `HomeBaseCloud.connectHomeBase` with a
project URL and **publishable** key, after the cloud/privacy approval described
in `SUPABASE_SETUP.md`. Secret and service-role keys are rejected by the client.

The API supports email-link sign-in, password sign-in/signup, sign-out, profile
creation, benchmark consent, earnings save/read, connection status, saved
progress, and cloud-record deletion. Account deletion, provider linking,
provider reconnect/revoke, and automatic provider retrieval still need their
separate approved server implementations; none is presented as activated.

Only explicitly selected earnings rows and an allowlist of progress keys are
eligible for upload. Sessions, precise GPS, diagnostic logs, and duplicate
copies of the earnings ledger are excluded from progress snapshots.

The interface must obtain the driver's cloud-save choice before transmitting
device history. It must load the current progress version before saving and
offer a visible conflict choice. It must never silently merge another driver's
records on account changes or overwrite local records on sign-out.

Batch uploads are atomic per request. Imports over 500 rows use multiple
requests; if a later request fails, retry the complete import with the same IDs.
Earlier successful requests will be skipped rather than duplicated. Earnings
reads are paginated; the interface must read all pages when restoring history.

## Provisioning

### Hosted release status — October 2, 2026

- Project: **Home Base**, reference `nixihmurdtfcbffgvpij`.
- Dashboard: https://supabase.com/dashboard/project/nixihmurdtfcbffgvpij
- API URL: https://nixihmurdtfcbffgvpij.supabase.co
- Supabase quoted and confirmed **$0/month** at creation; this is not a
  guarantee of future plan or usage charges.
- Both migrations applied successfully: hosted versions `20261002181517`
  (`home_base_accounts`) and `20261002181527` (`earnings_backend`). The platform
  assigned these hosted timestamps; source migration filenames are unchanged.
- Hosted SQL checks passed: anonymous denial, owner isolation, cross-owner
  write rejection, repeat-import deduplication, stale-save rejection,
  server-only connection writes, and deletion scoped to the signed-in driver.
  Synthetic users and rows existed only inside a rolled-back transaction.
- All seven public tables have RLS enabled. The security advisor returned no
  findings. Performance findings were informational unused indexes on the new,
  empty database; retain these ownership/filter indexes pending real workloads.
  Reference: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
- No driver earnings were imported. Browser cloud transmission remains off.
- Pending: Auth URL/email configuration, end-to-end Auth/REST verification with
  a consenting account, both-owner privacy approval, and browser integration.
  Provider earnings adapters remain separate and inactive.

1. Confirm the organization for project creation. Proposed: **Homebase**.
2. Obtain that organization's project cost through Supabase and complete its
   required cost confirmation. Do not assume the cost from the plan name.
3. Create **Home Base** in `us-east-1` (Virginia), then wait for healthy status.
4. Apply the two migrations in order and run security/performance advisors.
5. Verify anonymous denial, driver ownership, duplicate handling, stale-version
   rejection, and deletion against the hosted project before wiring the app.
6. Configure Auth Site URL and allowed redirects to
   `https://home-base-drivers.github.io/Home-base-app/`. Confirm email delivery;
   the default SMTP service is not the production mailing setup.
7. Retrieve the public project URL and publishable key. Keep service keys and
   provider credentials server-side. Complete the browser integration in a
   separate release under `SUPABASE_SETUP.md`.
8. Verify sign-in and cloud save/restore using a consenting test account; retain
   the existing on-device fallback and all hideable panels.

## Validation

Run `npm ci --ignore-scripts`, `npm run build:backend-client`, and `npm test`.
Backend tests execute the migrations on PostgreSQL through PGlite with emulated
Supabase Auth roles and claims. They verify real database grants, policies,
constraints, transactions, and functions. They do not substitute for hosted
Auth/email/REST verification after project creation.

## Provider activation

Supabase account login is separate from Uber/Lyft/Empower login. The project
cannot authorize access to platform earnings by itself. Evaluate Argyle or a
direct authorized integration, confirm current coverage and permitted earnings
tracking use, then implement linking, token handling, refresh/webhooks,
reconciliation, reconnect, and revocation. Connection rows stay absent or
`not_configured` until a real adapter verifies a connection.

Ticketmaster, FlightAware, Uber estimates, and optional Booking.com heat-map
inputs retain their existing separate GitHub Actions credential setup in
`CONNECTIONS.md`. They are not private driver earnings synchronization.
