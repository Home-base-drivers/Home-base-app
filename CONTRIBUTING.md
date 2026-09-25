# Working Together

## Normal workflow

1. Create a short branch from `main`.
2. Make and test one coherent change.
3. Open a pull request describing what changed and what was verified.
4. Request review from the other owner for material changes.
5. Merge into `main` only after review.
6. GitHub Pages deploys the merged version automatically.

## Preserve these systems

- GPS and market detection.
- Public venue, weather, and verified-event inputs.
- City-and-county demand heat independent of the route.
- Geographically anchored heat that does not drift during zoom.
- True-Interstate-only gold highway highlighting.
- Electric-cyan road-following route.
- Platform forecasts and official Go Online links.
- Earnings CSV personalization.
- Map, Earnings, Alerts, Profile, and Support tabs.
- PWA installation, icons, and offline app shell.
- Provider credentials stay in GitHub Actions secrets; never place them in
  `dist/`, logs, commits, screenshots, or client-side JavaScript.
- Uber fare/surge estimates are price proxies and must not be labeled as ride
  request volume. Booking.com lodging availability is context only, not a
  demand count.

## Never represent modeled data as verified live pay

Do not fabricate platform bonuses, surge, events, venues, or earnings. Forecast
values must remain labeled as estimates unless a verified authorized source is
integrated.
