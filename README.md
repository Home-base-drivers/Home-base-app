# Home Base

Home Base is a premium real-time rideshare driver demand map with local events,
a 12-hour driving route, platform forecasts, and personalized earnings analysis.

## Equal ownership

Home Base is jointly owned **50/50** by:

- Christopher Brouard (`@chrisbrouard`)
- Elizabeth Garcia (`@ellyg1625`)

This organization repository is the shared source of truth for both owners.
Business ownership is equal regardless of which GitHub account created the
organization or performs an individual commit.

See [OWNERSHIP.md](OWNERSHIP.md) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Website

The collaborative GitHub Pages website deploys automatically from `dist/` when
changes are merged into `main`.

The original ChatGPT-hosted reference remains separate and unchanged:

https://home-base-driver-live.chrisbrouard7.chatgpt.site

## Application source

- `dist/index.html` — complete interface, map, heatmap, routing, event, platform,
  earnings, alerts, profile, and support logic.
- `dist/sw.js` — offline app-shell service worker.
- `dist/manifest.webmanifest` — installable PWA configuration.
- `dist/homebase-logo.png` — Home Base brand logo.
- `dist/icon-192.png` and `dist/icon-512.png` — installed-app icons.
- `dist/favicon.svg` — browser icon.

## Provider data feeds

`.github/workflows/provider-signals.yml` targets a five-minute refresh for the
optional Baltimore provider feed and deploys only sanitized public results.
GitHub can delay scheduled workflows during high load, so the app displays the
source timestamp, checks for a new deployed snapshot every two minutes, treats
Uber samples as live for 12 minutes, and removes them after 25 minutes. Configure these
GitHub Actions repository secrets to enable the corresponding provider:

- `TICKETMASTER_API_KEY`
- `UBER_CLIENT_ID` and `UBER_CLIENT_SECRET` (or `UBER_ACCESS_TOKEN`)
- `BOOKING_API_KEY` and `BOOKING_AFFILIATE_ID`
- `FLIGHTAWARE_API_KEY` — AeroAPI access for BWI scheduled airline arrivals and departures

The FlightAware workflow publishes only hourly aggregate arrival/departure counts
and source freshness; it does not publish flight identifiers or tracks. Each
five-minute provider refresh makes one scheduled-arrivals query and one
scheduled-departures query for KBWI when the FlightAware secret is configured.
The FlightAware score is an airport activity proxy, not passenger counts or
confirmed rideshare requests.

Uber client credentials also require the non-secret repository variable
`UBER_ESTIMATES_SCOPE`, set to the estimates scope approved for the Uber app.
Provider access must be approved by the provider. The app never receives API
credentials. Ticketmaster events add verified event locations to the existing
event feed. Uber surge multipliers contribute only when a sampled trip estimate
shows meaningful surge and are a price proxy, not a count of ride requests.
Booking.com availability is shown as travel context only; it is not used as a
rideshare-demand score. Missing credentials or provider outages do not fabricate
signals, and the app discards expired provider data rather than presenting it as live.

## Accounts and community hourly rate

The production database schema is scaffolded in
`supabase/migrations/20260927_home_base_accounts.sql`, but cloud transmission is
deliberately disabled until both owners approve Supabase as the data processor
and complete the privacy setup in `SUPABASE_SETUP.md`. The current app records a
separate Home Base user gross-hourly rate and profit comparisons from imported
trip rows on the driver's device. No trip row is uploaded.

When approved and wired, Row Level Security will isolate private records and the
community benchmark function will return results only for a market/day/hour
group with at least five consenting users and twenty trips.

## Development rule

Create a branch, open a pull request, and have the other owner review material
feature, data, branding, or design changes before merging into `main`.

## Data honesty

Forecast earnings and heat zones are modeled planning estimates. Home Base does
not claim access to private driver-platform pay or surge feeds unless a verified,
authorized integration is added.
