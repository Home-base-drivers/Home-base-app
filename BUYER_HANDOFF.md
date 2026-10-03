# Home Base — developer acquisition handoff

Prepared October 2, 2026. This is a delivery inventory and completion plan,
not a valuation, revenue claim, or representation that integrations are live.

## Product position

Home Base is a Baltimore metro rideshare planning PWA combining a geographic
demand model, event destinations, route suggestions, and recorded earnings.
Christopher Brouard and Elizabeth Garcia are the recorded equal owners; see
OWNERSHIP.md. A proposed sale needs both owners' agreement on assets and terms.

Current status: functional planning prototype with a deployed private database,
account interface, opt-in learning and private cloud save/restore. Public signup
email delivery and automatic Uber/Lyft/Empower earnings synchronization remain
activation dependencies. GROWTH_READINESS.md records the October 3 additions
and the remaining subscription, sponsorship and commercial-data release gates.

## Asset inventory

| Asset | Location | Current state |
| --- | --- | --- |
| Production source and history | Home-base-drivers/Home-base-app on GitHub | main is the source of truth |
| Installed app interface | dist/index.html, dist/manifest.webmanifest, dist/sw.js | PWA app shell; map, tabs, earnings and planning |
| Demand rendering | dist/homebase-heat.js, dist/baltimore-demand-areas.geojson | Geographic modeled surface and metro boundaries |
| Route and earnings helpers | dist/homebase-planner.js, dist/homebase-earnings.js | Tested calculation and destination logic |
| Brand assets | dist/homebase-logo.png, dist/icon-192.png, dist/icon-512.png | Inventory origin and permitted use before transfer |
| Provider pipeline | scripts/refresh-provider-signals.mjs, .github/workflows/provider-signals.yml | Adapters and freshness handling; live availability depends on provider access |
| Private database | Supabase Home Base, nixihmurdtfcbffgvpij | RLS-protected earnings, consent and learning tables; growth migrations added |
| Account client | src/backend-client.mjs, dist/homebase-backend.js, dist/homebase-growth.js | Account/cloud interface loaded; external email delivery remains pending |
| Setup and contracts | BACKEND.md, SUPABASE_SETUP.md, CONNECTIONS.md | Database behavior and outstanding integration steps |
| Automated checks | scripts/*.test.mjs, tests/*.test.mjs | 82 checks passed on this release; rerun on each release |

## Minimum-investment finish sequence

| Priority | Deliverable | Spending decision | Acceptance condition |
| --- | --- | --- | --- |
| 1 | Reliable existing demo and provider-refresh workflow | No new service purchase | CI passes; scheduled job publishes fresh status even when providers are unavailable |
| 2 | One owned sending domain | Buy one standard domain only after confirming checkout and renewal | Ownership and DNS access recorded under shared company control |
| 3 | Resend SMTP and verified sender | Start with the free transactional allowance; no paid upgrade by default | DNS verified; confirmation and reset emails arrive for an external test address |
| 4 | Account interface and consented cloud saves | Use deployed Supabase backend | Sign-up, sign-in, sign-out, save, restore and conflict choice work across two devices |
| 5 | Buyer demo and onboarding | No new provider subscription | A new developer can build and deploy from the pinned source and documented setup |
| 6 | Authorized platform earnings sync | Defer commercial contracts to buyer unless a free permitted sandbox is available | Real linking, retrieval, refresh, reconciliation and revocation verified; otherwise labeled unavailable |

CSV and manual fallbacks remain working. Automatic connection remains the
target UX; CSV does not substitute for a completed platform integration.
Do not buy paid flight data, earnings aggregators, advertising, app-store
memberships or extra hosting merely to make screenshots appear complete.

## Domain decision recorded October 2

Official Spaceship promotions advertised .shop at $0.70 and .xyz at $0.75 for
the first year. The .com promotion COM67 advertised $3.60 plus the stated
$0.20 ICANN fee: $3.80 before any applicable tax. Its .com page listed renewal
at $9.98 plus $0.20: $10.18 before tax. Promotions are limited, exclude premium
names and must be verified in checkout.

Recommendation: homebasedrivers.com if a registrar confirms standard pricing
and availability. Registry RDAP lookups for homebasedrivers.com,
homebasedrivers.xyz and homebasedrivers.click returned 404 on October 2. That
means no registration record was returned; it is not a registrar availability,
premium-price or purchase guarantee. Browser checkout at Spaceship was blocked
by its security verification. No domain has been purchased.

Sources:
- https://www.spaceship.com/promos/
- https://www.spaceship.com/domains/gtld/com/
- https://resend.com/pricing
- https://resend.com/docs/send-with-supabase-smtp

Resend Free was advertised at $0/month with 3,000 messages/month and
100/day. It connects owned domains; it does not buy one. The recommended
sender is no-reply@auth.<owned-domain>, named Home Base. Exact DNS record
values must come from the provider, never from a guessed template.

## Developer start

1. Clone the repository and use Node 22 or newer.
2. Run npm ci --ignore-scripts, npm run build:backend-client, npm test and
   node scripts/check-index-syntax.mjs.
3. Read BACKEND.md and SUPABASE_SETUP.md. Hosted migrations are already applied;
   create a separate test project to replay them. Never reset production.
4. Review CONNECTIONS.md and the provider workflow for required credential names.
5. Browser configuration uses only a Supabase publishable key. Provider tokens,
   SMTP credentials and server keys belong in server-side secret stores.
6. Use synthetic fixtures for demonstrations. Do not include driver records,
   precise GPS, sessions, API keys or private earnings in a sale data room.

## End-to-end release checklist

- [ ] Driver can install/open the PWA and recover from offline/network errors.
- [ ] All tabs/panels hide and restore in driving/map-only views.
- [ ] Heat surface and route remain geographically aligned through pan/zoom.
- [ ] Destination icons open event details and sit at route destinations.
- [ ] Current verified events and modeled patterns are visually distinguished.
- [ ] Missing/expired provider data never lights the live-feed indicator.
- [ ] CSV import preserves corrections without duplicate earnings.
- [ ] Online hours, active hours, gross and payouts remain separate.
- [ ] External email confirmation and password reset work.
- [ ] Two drivers cannot access each other's records.
- [ ] Two-device cloud conflicts are visible and cannot silently overwrite.
- [ ] Account changes never silently upload or merge another driver's device history.
- [ ] Cloud record deletion is described separately from Auth identity deletion
      and provider revocation; complete those server flows before claiming full deletion.

## What to give a buyer

A tagged source release, reproducible build/test instructions, a short demo
recording, this inventory, current defects, provider activation requirements,
cost/renewal sheet, and the ownership/asset-transfer agreement approved by both
owners. Include a third-party package/map/brand license inventory and separately
record any real adoption, retention or revenue with supporting evidence.

Transfer GitHub, Supabase, domain, DNS and Resend control through each service's
supported ownership/member process. Rotate credentials after the agreed
handover; never send existing keys in the pitch or committed files. Neither
access transfer nor an asset sale has been performed by this document.

## Known gaps a buyer should see

- SMTP/sending domain and account UI remain pending.
- Automatic platform earnings sync needs authorized adapters and commercial access.
- Auth identity deletion and provider revocation are not implemented.
- Forecast/heat accuracy against independent rideshare outcomes is not yet validated.
- No customer count, retention, revenue, acquisition value or guaranteed return
  is established by this repository inventory.

Sell the working product and documented path to completion. Do not describe it
as a finished live-pay integration or assign a sale price without buyer and
market evidence.
