# Living map: event store, service areas and surge pattern table (v291)

## Event store (fewer rechecks)
- **Server (`scripts/public-records.mjs`, `storedOrFreshRecords`).** Venue, campus and school calendars are checked once per market day for the next **three days** (`EVENT_HORIZON` = 72 h). Later refreshes that day reuse the stored records; only past events drop off. Hourly weather still refreshes on every run, and Ticketmaster (when keyed) looks 72 h ahead.
- **Phone (`fetchScoreboardGames`).** Every league's schedule is fetched once per market day for today plus two days and saved as `homeBaseEventStore`. Later full refreshes that day use the stored games with no network. Only today's scoreboards for leagues with a nearby game live or about to start are re-polled, which catches score, final and cancellation, and those updates are written back to the store.

## Service areas (`dist/baltimore-market.js`)
Events, route stops and heat count only where the driver can take trips:

| Driver in | Counts | Excluded |
|---|---|---|
| Baltimore or DC | Maryland, DC and Northern Virginia (DMV) | Pennsylvania, Delaware, West Virginia |
| Miami | Florida | — |
| Other markets | distance limit only | — |

- Distance limit: 68 mi (110 km) for big venues, 50 mi (80 km) for others.
- Distances read in miles in the US (and UK) and in km elsewhere.
- The server applies the same filter to published events.

## Surge pattern table (`dist/homebase-demand-history.js`)
- **Known values.** A place's surge value for each weekday and 5-minute slot is computed once, then applied. It is saved on the phone (`homeBasePatternTable`) keyed to the stored history, and recalculated only when new surge data changes the history. Ages run from the newest stored observation, not the clock, so values don't drift between uploads.
- **Residual, near-permanent.** Each date fades slowly (e^-age/90 days). Once surge has repeated on 3+ different dates at a place and time, every date keeps at least 35% weight, so an established hot spot always shows at that time.
- **More data = hotter.**
  - Bigger dollar amounts weigh up to 1.6×.
  - Distinct recurring-pattern locations stack on the heat map, while per-place copies of the same pattern take the strongest value.
  - Established patterns read orange-red on their own (`composePixel`).

## Living map
- The heat advances to the current time every 2 minutes from stored patterns and dated events, with no network needed (free/offline).
- Data refreshes every 5 minutes.
- Heavy street-zoom draws use an adaptive coarser grid with the same on-screen blur, so a draw takes ~0.7 s instead of ~5 s.
