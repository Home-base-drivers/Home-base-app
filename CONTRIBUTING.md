# Working Together

## Publish workflow

Christopher and Elizabeth are equal owners/developers. Preserve both owners'
updates, and submit one update at a time.

1. Fetch the latest remote branch and integrate all existing changes. Make one
   coherent change and run the repository checks.
2. Run `npm run setup:hooks` once in every developer checkout. Before every
   submission, run `npm run check:update -- --expected-head <current-main-SHA>`.
3. Wait until **all** repository workflows have finished processing, regardless
   of which owner or agent started them. Queued, requested, pending, waiting,
   and running updates block new submissions. API errors block submission too.
   Do not cancel somebody else's update. After waiting, fetch and check again.
   An obsolete waiting/pending run whose commit is already included in a later
   successful release may be cancelled and reported. Cancel obsolete pending
   runs before releasing their queue; never deploy old code over the current app.
4. If main changes while you work, integrate the newer update and rerun your
   checks. A new commit awaiting deployment registration/completion is busy.
   A completed failure must be reported; a corrective update may follow once idle.
5. Contributors may publish directly to `main` after the guard passes. Use normal
   fast-forward pushes; connector/API updates must use the checked `expected_sha`
   and `force: false`. Never force-push or overwrite files from a stale checkout.
6. Pull requests remain available; review is not required. Apply the same guard
   immediately before merging or making any connector/GitHub web change.
7. GitHub Pages deploys automatically. Wait for your update to finish and verify it
   before submitting another update.

The local hook protects Git pushes from checkouts where it is enabled. It cannot
intercept GitHub web edits, API calls, or unpublished work on another computer;
those require the shared rules in `AGENTS.md` and coordination between owners.

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
