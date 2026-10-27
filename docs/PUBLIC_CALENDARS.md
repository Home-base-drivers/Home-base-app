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

## Baltimore status after this change (14-day check)
| Source | Result |
|---|---|
| Ticketmaster Discovery API | Working (the main source for CFG Bank Arena, Hippodrome, Rams Head, Nevermore Hall) |
| Ottobar | Fixed: read through event pages (24 listings) — the AXS page always returned 403 |
| Power Plant Live! | Fixed: event pages placed at the complex (20 listings) |
| Baltimore Soundstage, M&T Bank Stadium, Maryland State Fairgrounds | Working |
| Morgan State, Towson University | Working (Localist API) |
| CFG Bank Arena, Lake Roland | Intermittent: AWS WAF challenge (HTTP 202) blocks automated reads; CFG is covered by the Ticketmaster API |
| Baltimore Convention Center | No machine-readable data (Saffire JavaScript calendar) |
| Visit Baltimore | Listing and event pages carry no Event data (Algolia search only) |
| Baltimore City / County Recreation & Parks, bcrpsports | No machine-readable event data (program catalogs) |
| Orioles (mlb.com) | No data on the page; games come from the MLB Stats API instead |
| Pier Six Pavilion | Working; season over (only past listings) |

Removed: Ticketmaster web listing pages (all markets) and AXS venue pages — they
return 403 to every automated request; the Ticketmaster Discovery API covers them.
London gains Premier League stadiums (ESPN scoreboard) as its keyless event source.
