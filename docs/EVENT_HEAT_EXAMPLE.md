# Event heat example: Bengals at Ravens, Sun Oct 25 2026

**Event:** [Cincinnati Bengals at Baltimore Ravens](https://www.baltimoreravens.com/game-day/2026/reg-week7/bengals-at-ravens), NFL Week 7, M&T Bank Stadium. Kickoff 1:00 PM EDT. Final score CIN 35, BAL 13. The final whistle was about 4:10 PM; this is an estimate, kickoff + roughly 3 h 10 min. In a blowout, many fans leave during the fourth quarter.

The Uber "Event" pin on the 2:41 PM and 5:56 PM maps sits next to the stadiums. This was the only stadium event that day.

## How Uber's map reacted (screenshot records linked with `linked_event`)

| Time | Phase | What Uber showed |
|---|---|---|
| 2:41 PM | During (Q3) | Event pin; downtown +$3.50–3.75, west side +$2–4 |
| 4:28 PM | Let-out +18 min | Purple across the west side and harbor: Edmondson +$16, Arbutus +$11, Inner Harbor +$9.50, Pigtown +$8.75 |
| 4:56 PM | +46 min | Inner Harbor +$10, Mt. Vernon +$5.25 |
| 5:08 PM | +58 min | West side +$16, Pigtown +$11 still purple |
| 5:56 PM | +106 min | All of downtown purple, Event pin still up: stadiums +$14, Westport +$10 |
| 6:07 PM | +117 min | Inner Harbor +$9.25 |
| 6:39 PM | +149 min | City fading (Inner Harbor +$4.75) |
| 8:50 PM | After | Shading only |

Before kickoff and during the game, demand was modest. The heat came after the game: it peaked 20–100 minutes after the final whistle, about 3–5 km around the stadium, and lasted about 2.5 hours.

## How Home Base now displays event heat

Calibrated from this game and applied to every market. One profile is shared by `homebase-route-policy.js` and `homebase-heat.js`:

| Venue class | Departure window | Peak | Heat footprint while leaving |
|---|---|---|---|
| Stadium (M&T, Camden Yards, MetLife, Yankee Stadium…, or ≥30,000 people) | 150 min after the end | 10–100 min | 3.5 km |
| Arena (CFG Bank Arena, MSG, Barclays…, or ≥8,000) | 90 min | 5–60 min | 2.25 km |
| Other venues | 60 min (unchanged) | whole hour | unchanged |

- Departure strength ramps from 60% to 100% as the crowd spills out, holds at the peak, then tapers to zero by the end of the window.
- Event weight in routing follows the same curve.
- The window opens only when the end time is known. That means a published end time, or a game the app saw go from live to final. An estimated end never creates a departure window.

`tests/event-letout.test.mjs` locks in this example.
