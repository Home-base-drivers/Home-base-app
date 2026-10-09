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

`.github/workflows/live-signals.yml` refreshes the demand snapshot about every
10 minutes and publishes only sanitized results to the machine-owned `signals`
branch. The app loads that file directly (falling back to the copy bundled with
each release), so drivers are not limited by the hourly Pages release in
`.github/workflows/pages.yml`. The live refresh never changes `main` or the
deployed app, and the update guard does not wait on it.

Free public sources refreshed for every market, with no key required:

- **Public scoreboards** (ESPN for NFL, NBA, WNBA, NHL, MLS, NWSL and NCAA
  football/basketball; MLB Stats API). A game's departure window opens only
  after a scoreboard is observed live and then final; the end time is the
  midpoint of those two observations and both bounds are stored. A game in its
  final period is flagged as a closing-stretch cue for the current hour only.
- **National Weather Service active alerts** for each US market. Winter, flood
  and storm advisories raise the modeled weather score; life-safety warnings
  (tornado, flash flood, blizzard, ice storm) are shown to drivers but never
  boost a destination.
- Published venue, campus and school calendars, OpenStreetMap places and the
  NWS hourly forecast, as before.

- **Published school bell times.** Each Baltimore City public school's opening
  and closing bell is read weekly from its district profile page
  (`baltimorecityschools.org/page/<school number>`) and placed with the U.S.
  Census Bureau geocoder. Mapped schools that match by location and name use
  their real dismissal time instead of the 8 AM / 2:30 PM default.
- **Washington, DC market** (Capital One Arena, Audi Field, Nationals Park,
  Northwest Stadium). Baltimore drivers see these large events; the route ranks
  them by drive time and keeps Baltimore City/County first.
- **Watch areas** (`config/watch-areas.json`): neighborhoods drivers reported as
  busy. Each refresh records the published dismissals, events and alerts near
  them under `watchAreas` in the snapshot. They are reference only and never
  add heat or destinations.

Route ranking uses estimated drive minutes (street, arterial and interstate
speeds), prefers options within 30 minutes, adds a size bonus for large events
(published attendance, professional leagues, stadiums and arenas), allows
large events up to 90 minutes away, and ranks destinations outside Baltimore
City/County lower.

On the device, the app also reads Open-Meteo hourly precipitation amount,
snowfall and temperature plus NWS alerts for the driver's exact location, and
re-polls only the scoreboards with a nearby game that is live or starting
within the hour on its five-minute cycle.
Public sources and the Ticketmaster, Uber, and FlightAware connectors are core data inputs and stay enabled in the pipeline; provider feeds return unavailable status until their owner-authorized credentials are saved in GitHub Actions secrets.
GitHub can delay scheduled workflows during high load, so the app displays the
source timestamp, checks for a new deployed snapshot every two minutes, treats
Uber samples as live for 12 minutes, and removes them after 25 minutes. Configure these
GitHub Actions repository secrets for the required provider feeds:

- `TICKETMASTER_API_KEY`
- `UBER_CLIENT_ID` and `UBER_CLIENT_SECRET` (or `UBER_ACCESS_TOKEN`)
- `FLIGHTAWARE_API_KEY` — AeroAPI access for BWI scheduled airline arrivals and departures

Booking.com credentials can be added separately for travel context; they do not
feed the rideshare-demand score.

The FlightAware workflow publishes only hourly aggregate arrival/departure counts
and source freshness; it does not publish flight identifiers or tracks. Each
provider refresh makes one scheduled-arrivals query and one
scheduled-departures query for KBWI when the FlightAware secret is configured.
The FlightAware score is an airport activity proxy, not passenger counts or
confirmed rideshare requests.

Uber client credentials also require the non-secret repository variable
`UBER_ESTIMATES_SCOPE`, set to the estimates scope approved for the Uber app.
Provider access must be approved by the provider. The app never receives API
credentials. The public map inputs are Open-Meteo weather forecasts,
OpenStreetMap venue/neighborhood features queried through Overpass, current MLB
and ESPN event schedules, and OSRM road routes. They refresh from their public
endpoints when the app refreshes; provider availability and rate limits can vary.
Ticketmaster adds dated event locations when its secret is configured. FlightAware
adds BWI scheduled-flight counts by hour when its secret is configured. Uber
surge multipliers contribute only when an authorized sampled trip estimate shows
meaningful surge; this is a price proxy, not a count of ride requests.
Booking.com availability is shown as travel context only; it is not used as a
rideshare-demand score. Missing credentials or provider outages do not fabricate
signals, and the app discards expired provider data rather than presenting it as live.

## Accounts and community hourly rate

The private Supabase database and both account/earnings migrations are deployed.
Both owners' data-processor approval is recorded, and the Home Base Auth Site
URL and allowed redirect are configured. The account interface supports explicit
device linking and optional private cloud saves. Public SMTP delivery and
automatic provider connections remain pending. See BACKEND.md, SUPABASE_SETUP.md
and GROWTH_READINESS.md for release status and activation gates. Device CSVs and
manual shifts remain available without an account; cloud and optional learning
contributions require the corresponding user action or consent.

When approved and wired, Row Level Security will isolate private records and the
community benchmark function will return results only for a market/day/hour
group with at least five consenting users and twenty trips.

## Developer acquisition handoff

See [BUYER_HANDOFF.md](BUYER_HANDOFF.md) for the asset inventory, minimal-spend
completion sequence, developer setup, acceptance checks and disclosed gaps.

## Development rule

Contributors may publish directly to `main` without waiting for a pull-request
review. Run the repository checks before publishing; pull requests remain
available for discussion, and GitHub Pages deploys changes from `main`.

## Data honesty

Forecast earnings and heat zones are modeled planning estimates. Home Base does
not claim access to private driver-platform pay or surge feeds unless a verified,
authorized integration is added.
