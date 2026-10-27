# Public calendars: what reaches the model (Oct 27, 2026)

Run **Diagnose public calendars** (Actions → workflow_dispatch) to re-check every
configured source from a runner. It writes `calendar-diagnostics.md/json` to the
machine-owned `diagnostics` branch: HTTP status as Home Base and as a browser,
block pages, JSON-LD, feeds found, and what the real reader stores (with drop
reasons such as "beyond horizon" or "no location").

## How a venue calendar is read (scripts/venue-calendars.mjs)
1. schema.org JSON-LD on the listing page (plus the Soundstage/Peninsula/Tribe adapters).
2. If none: the page's own feeds — Next.js page data, iCalendar links, The Events
   Calendar REST API, Localist API.
3. If still none and the source follows events: each listed event's own page
   (WordPress venue plugins such as Rockhouse publish Event data there).
Listings within 7 days are kept (venue calendars are small); the app still uses the
next 12 hours for heat and routes. A single-venue (or single-complex) calendar places
its listings at that venue.

## Daily calendar check and saved results (calendar-archive)
`.github/workflows/calendar-archive.yml` runs at ~5 AM Eastern (and a 5 PM retry
pass). It reads every configured calendar — venue calendars in every market and the
Towson/Morgan campus calendars — two weeks ahead (`scripts/calendar-archive.mjs`) and
saves each calendar's events, last success, failures in a row and reason to
`calendar-archive.json` on the machine-owned `calendar-archive` branch, with
`calendar-health.md` (also shown on the run's summary page).
- **Same day is not re-read.** A calendar read successfully on the market's current
  day is skipped by later passes and served from the archive by the live refresh
  (method `archive:…`). Manual run with `force=1` re-reads everything.
- **Site down or silent.** If a calendar fails, or answers with an empty list while
  saved events are still upcoming, its saved events are kept; the live refresh marks
  that calendar `archived` (with `archivedAt`) and still sends its events to the app.
- Saved past events are kept 14 days; calendars removed from config drop out.
`tests/calendar-archive.test.mjs` enforces these rules.

## Baltimore status after this change (14-day check)
| Source | Result |
|---|---|
| Ticketmaster Discovery API | Working (the main source for CFG Bank Arena, Hippodrome, Rams Head, Nevermore Hall) |
| Ottobar | Fixed: read through event pages (24 listings) — the AXS page always returned 403 |
| Power Plant Live! | Fixed: event pages placed at the complex (20 listings) |
| Baltimore Soundstage, M&T Bank Stadium, Maryland State Fairgrounds | Working |
| Morgan State, Towson University | Working (Localist API) |
| CFG Bank Arena, Lake Roland | Intermittent: AWS WAF challenge (HTTP 202) blocks automated reads; CFG is covered by the Ticketmaster API |
| Baltimore Convention Center | Connected (v299): read from the site's public Saffire events service (`GetEventDays` → `GetEventDaysByList`). Shows that list only a date are placed at the center with modeled 9 AM–5 PM hours and marked "est. hours" |
| Visit Baltimore | Listing and event pages carry no Event data (Algolia search only) |
| Baltimore City / County Recreation & Parks, bcrpsports | No machine-readable event data (program catalogs) |
| Orioles (mlb.com) | No data on the page; games come from the MLB Stats API instead |
| Pier Six Pavilion | Working; season over (only past listings) |

Removed: Ticketmaster web listing pages (all markets) and AXS venue pages — they
return 403 to every automated request; the Ticketmaster Discovery API covers them.
London gains Premier League stadiums (ESPN scoreboard) as its keyless event source.
