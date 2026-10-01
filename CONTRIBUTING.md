# Working Together

## Publish workflow

1. Make one coherent change and run the repository checks.
2. Contributors with write access may commit or push directly to `main`.
3. Pull requests are available for discussion, but review is not required to publish.
4. GitHub Pages deploys changes from `main` automatically.

## Preserve these systems

- GPS and market detection.
- Public venue, weather, and verified-event inputs.
- Ticketmaster, Uber, and FlightAware are required ride-signal connectors; keep
  their refresh paths enabled. Their provider-issued credentials belong in
  GitHub Actions secrets and unavailable feeds must be labeled honestly.
- City-and-county demand heat independent of the route.
- Geographically anchored heat that does not drift during zoom.
- True-Interstate-only gold highway highlighting.
- Electric-cyan road-following route.
- Platform forecasts and official Go Online links.
- Earnings CSV personalization.
- Map, Earnings, Alerts, Profile, and Support tabs.
- Every panel and tab remains hideable. Driving view hides navigation tabs by
  default; Map only clears the interface with a visible Show controls recovery
  button. Demand detail dialogs must stay inside the visible viewport.
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
