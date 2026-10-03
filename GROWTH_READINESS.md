# Home Base growth readiness

Updated October 3, 2026. This is an implementation checklist, not a claim of production provider connectivity, legal approval, revenue, or valuation.

## Available in this release

- Public map and existing forecast/heat-map tools remain available without an account.
- Account sign-in, password recovery UI, private earnings/settings cloud storage, explicit first-device linking, version conflict protection, cloud restore and export.
- Existing CSV earnings imports and manual shifts remain available. Manual entry is a fallback, not a substitute for a supported automatic connection.
- Separate opt-in switches for limited feature usage, neighborhood-level model evaluation records, and community earnings benchmarks. All default off for new users.
- User-scoped database permissions, consent receipts, optional-history removal on withdrawal, cloud clearing, and verified account deletion with session revocation. Active provider connections block deletion until disconnected.
- Foreground shift observations store district names, not precise GPS. Current displayed earnings-rate estimates can be logged before future 15/30/60-minute horizons. These are evaluation snapshots, not independently trained horizon models.
- Approved sponsorship display in Earnings/Support, hidden in driving view, with server-managed campaigns. There are no seeded paid campaigns and sponsorship never changes demand scores/routes.
- Server-managed subscription records and a blocked-by-default commercial release registry. Neither grants a working checkout nor permits selling driver records.

## Activation steps, in order

| Step | Required work | Release gate |
| --- | --- | --- |
| 1. Public accounts | Set up an owned sending domain and authenticated SMTP, confirm email delivery/recovery and run a real multi-device pilot | Default Supabase email is not a public signup delivery service; do not bypass confirmation |
| 2. Provider earnings | Obtain approved Uber/Lyft/Empower or authorized aggregator access, verify actual coverage, add server-held credentials, connection callbacks, background sync, stable trip IDs and disconnect/revocation | No platform password collection, scraping, fake connected status, or paid provider commitment without approval |
| 3. Reliable tracking | Verify completed-shift reconciliation, mileage consent and native/background requirements; support offline queues and explicit sync error recovery | Foreground neighborhood observations are not background mileage tracking |
| 4. Forecast evidence | Join independently verified outcomes to earlier immutable predictions, evaluate by area/platform/horizon against simple baselines, track sample size and error, then validate holdout performance | Current estimates and screenshots are not measured accuracy or live surge data |
| 5. Paid Plus | Configure a billing provider, server webhooks, entitlement checks, cancellation/refunds and a reviewed feature split | No payment form or purchasable subscription is active |
| 6. Sponsorship revenue | Secure advertiser agreements, review campaigns, add compliant impression reporting and billing; keep driving view ad-free | Campaign approval is server-side, not user-editable; no revenue is assumed |
| 7. Commercial analytics | Review applicable privacy law and provider/data licenses, re-identification risks, consent/withdrawal and minimum-group rules; approve specific releases | No raw location/earnings sale, public bulk export, or commercial release endpoint is enabled |
| 8. Buyer-ready proof | Run a small consented pilot, document support burden and costs, measure retention and outcomes, record actual revenue and assemble the handoff | A $1M valuation is a business outcome, not something code or data collection guarantees |

## Retention and data boundaries

Daily retention cleanup was explicitly approved and activated October 3, 2026 at 04:20 UTC. It permanently deletes usage events and neighborhood observations older than 90 days and prediction records older than 180 days. The first manual verification succeeded with no expired records present. The separate operations script must not be run during ordinary migration replay. This job does not delete earnings, account details, subscriptions or consent receipts; clearing cloud data is separate from deleting the login identity.

Cloud saving does not silently bind a shared device to whichever account signs in. First upload is explicit; an existing cloud history must be restored before linking an unbound device. Cloud restore replaces supported local earnings/settings after confirmation. Download a backup first. Deleting a local imported row does not delete its cloud copy; use cloud clearing or account deletion for cloud removal. In-progress shifts are not included in the backup format.

App usage uploads contain only whitelisted feature names/surfaces and server timestamps, not arbitrary metadata. Model contributions are optional, foreground-only, and use precise coordinates only in memory to identify an area. Current forecast snapshots must not be marketed as validated predictive performance. Exact locations and platform credentials must not be added to telemetry.

## Verification and handoff

Run `npm ci`, `npm run build:backend-client`, `npm test`, `node scripts/check-index-syntax.mjs` and `node --check dist/homebase-growth.js`. Database tests use isolated synthetic users and verify RLS, consent, server timestamps, immutable future snapshots and withdrawal. Account deletion tests verify identity and revoke-before-delete ordering. Hosted deployment must additionally verify migration/function status, security advisors and public app assets.

Frontend `dist/homebase-config.js` contains only the project URL and a publishable key. Supabase server credentials are confined to Edge Function environment variables. This repository is public: never commit provider keys, service-role secrets, personal trip exports, or private driver data.
