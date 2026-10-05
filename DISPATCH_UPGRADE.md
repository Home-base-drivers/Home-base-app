# Home Base dispatch upgrade — October 5, 2026

The existing GitHub Pages PWA now has a foreground voice Copilot and a modular dispatch calculation engine. The existing map, route, heat renderer, market detection, earnings ledger, cloud account system and provider refresh pipeline remain in use. This is an advisory release, not a claim of private driver-app control.

## Completed features

- A compact, hideable Copilot card on the existing map with objective, recorded daily earnings, net estimate when costs/mileage are sufficient, online hourly rate, target progress, explanations, voice commands and feed freshness.
- Eight objective modes: Max Profit, Diamond, Get Me Home, End Shift, Airport, Event, Short Trip and Custom Target.
- Trip scoring that includes pickup/passenger distance and time, operating costs, destination demand when supplied, paid repositioning, home progress, next-trip/deadhead inputs when supplied, minimum return preferences, goal progress and positioning consequences. Missing vehicle or pickup inputs produce an unavailable score rather than invented net returns.
- Separate passenger/active-hour, online-hour, shift-hour, net-hour, passenger-mile and total-mile metrics. Booked earnings never populate online-hour comparisons.
- A normalized platform-independent trip record; provenance, confidence and completeness tags; explicit completed-trip recording; reviewed JSON imports; duplicate handling by platform, timestamp, fare and normalized locations. Missing timestamps/routes remain uncertain and do not auto-match unrelated trips.
- Existing `trip_rows` table extended, rather than a second cloud trip ledger. Private trip ingestion is transactional and blocks client claims of provider authority.
- Driver preferences, private destination, vehicle fuel/service logs, operating-cost reserves, replacement operating-cost comparisons, daily revenue/net goals, home deadline, shift/radius/minimum-return preferences.
- Foreground GPS watch, moving-vehicle simplified UI, recognition/speech where browser-supported, optional radio cue, pause/resume/quiet/repeat/why commands. Voice requests can change objectives, set an additional earnings target, set a home deadline and ask about airport information.
- Recommendation explanations and actual outcome recording. Five qualifying personal outcomes enable a bounded profitability-weight adjustment; this is observational calibration, not proof of causality or a trained fleet model.
- A small capped demand-history adjustment for completed-trip recurrence on three independent matching weekday/time dates. Existing screenshot recurrence, signal decay, weather, schools, commute, events and map anchoring remain intact. Recurrence calculations are cached to avoid repeatedly scanning trip history during rendering.
- Effective-dated Empower expansion entry covering Baltimore, Washington DC and Northern Virginia from October 1, 2026, tagged **USER-REPORTED**. No unverified official service polygon is invented.
- Server-side authenticated scoring/recommendation endpoint. Optional OpenAI Responses language-intent parser behind server credentials; structured intents cannot directly execute driver-app actions. The local dispatcher remains available without an AI provider.

## Files changed

| Files | Purpose |
|---|---|
| `dist/homebase-dispatch.js` | Shared scoring, goals, opportunity economics, recommendation/state logic, provenance, service areas, adapters and personal calibration |
| `dist/homebase-copilot.js`, `dist/homebase-copilot.css` | Map card, voice controls, driving UI, preferences, trip inputs, vehicle logs, explanations, feedback and private imports |
| `dist/index.html` | Loads upgrade, observes successful existing GPS fixes, adds Northern Virginia locale names and includes dispatch data in device reset |
| `dist/homebase-planner.js` | Exposes the existing combined ledger to the Copilot and extends existing backup fields |
| `src/backend-client.mjs`, `dist/homebase-backend.js` | Private dispatch state/trips/recommendations, account evaluation and data export |
| `dist/sw.js` | Versioned offline app-shell assets for the upgrade |
| `supabase/migrations/20261005193156_driver_dispatch.sql` | Additive trip metadata, private dispatch state/outcomes, capability/service-area registry, ingestion and deletion integration |
| `supabase/functions/dispatch/index.ts`, `handler.mjs`, `language.mjs` | Authenticated server engine and optional constrained language understanding |
| `scripts/build-dispatch-function.mjs`, `package.json`, `.gitignore` | Generates server engine from the single shared source; generated file is ignored |
| `tests/dispatch.test.mjs`, `tests/backend-database.test.mjs` | Calculation, provenance, duplicate, authorization, deletion and language-provider tests |
| `DISPATCH_UPGRADE.md` | Release details and disclosed limitations |

## Database migration and endpoint

Migration `driver_dispatch` is applied to the existing Home Base Supabase project. It adds four registry/state/outcome tables, extends `trip_rows`, applies RLS and grants, adds atomic `ingest_dispatch_trips`, and extends the existing account-data deletion flow. No existing earnings table or demand-history table is replaced.

The `dispatch` Edge Function is deployed. It validates the bearer session with Supabase Auth `getUser` before reading private data. Platform actions remain advisory. Gateway JWT checking is disabled because custom verification is performed in the function; unauthenticated live requests return 401. No service-role or provider secret is included in browser code.

For reproducible deployment, run `npm run build:dispatch-function` before deploying the function. `engine.js` is generated from `dist/homebase-dispatch.js` and must not be edited separately.

## Integrations used and execution limits

| Integration | Behavior in this release |
|---|---|
| Supabase Auth/Postgres/Edge Functions | Private dispatch records and authenticated calculations; deployed |
| Browser SpeechRecognition and speechSynthesis | Foreground voice commands and OS-selected speaker/Bluetooth output; browser-dependent |
| OpenAI Responses | Optional server-side intent understanding; requires `OPENAI_API_KEY` and `OPENAI_COPILOT_MODEL` in Supabase secrets; not activated or tested against a billed provider |
| Existing public/provider pipeline | Reuses Open-Meteo, OSM/Overpass, OSRM, sports/calendar feeds and existing Ticketmaster/Uber-price/FlightAware inputs; no new private driver credentials or permissions were provisioned |
| Uber, Empower, Lyft request controls | Read-trips/read-earnings/status/pause/resume/accept/decline all unverified/unavailable in the registry; advisor instructions only |

Ticketmaster, Uber estimates and FlightAware continue to use the existing GitHub Actions configuration. Provider credential values and approval status were not verified in this run. Airport schedules are activity proxies; queue length, passenger counts and rideshare offers are unavailable unless explicitly supplied through an approved future integration. Traffic/destination-next-trip economics use supplied inputs and the existing forecast; a live traffic or private trip-offer feed was not added.

## Driver evidence and privacy

A separate private `Home-Base-Driver-Evidence.json` import contains the supplied weekly summaries, approximate Intercity examples, geographic patterns and reported vehicle/strategy preferences. It is deliberately excluded from the public repository and public app assets. The figures come from the user's request, not an independent re-extraction of the images. Inferred years and incomplete coverage are identified. Weekly summaries remain comparison evidence and are excluded from trip/day totals to prevent overlap with later CSV/API records.

Import the pack in **Earnings → Trip intelligence → Import reviewed trip/evidence JSON**. This also sets Chris's Diamond/paid-repositioning preferences and 2016 Acura RDX model. Enter real fuel and reserve costs in Profile; an unusually long-day gasoline observation is not automatically treated as a full cost model.

Home, Work and custom base coordinates stay on-device. Private cloud trip storage is explicit, linked to the signed-in driver and protected by RLS. Dispatch learning is per-driver; public aggregation remains the existing consent-controlled benchmark system. The new release does not sell or share exact home coordinates.

## Verification results

- `npm test`: **115 passed, 0 failed**, including actual PostgreSQL execution through PGlite, RLS isolation, duplicate ingestion, source protection, deletion, missing-input handling, Diamond rules, paid repositioning, hour-type separation, wait economics, recurrence and optional language parsing.
- Inline application syntax check passed; new JavaScript syntax checks passed.
- Browser checks passed at widths **320, 390, 768 and 1440**: objective changes, simulated voice command, profile costs, offer scoring, completed-trip persistence, all tabs, minimize/restore and no horizontal document overflow. No page errors.
- Browser scoring example after vehicle-cost configuration: a $24 offer, 2 pickup miles, 17 passenger miles, 5 pickup minutes and 30 trip minutes returned an estimated $29.09 per pickup-plus-trip hour; it was not represented as online hourly earnings.
- Existing heatmap geometry/anchoring tests passed. The upgrade does not replace the heat renderer or create a second overlay. Actual mobile frame-rate measurements and real-device field performance remain unverified.
- Live database schema and effective-dated expansion entry verified. Supabase security advisors reported **zero findings**. Live unauthenticated endpoint request returned **401**.
- Actual phone microphone, background behavior, Bluetooth speaker routing, Siri and a live authenticated user journey were not tested. Speech recognition was simulated in browser QA.

## Remaining blockers and next priority

1. Official platform approvals and credentials are needed before private offer/trip streams or request actions can be enabled. No action is claimed executed without an affirmative supported adapter receipt.
2. Optional broad AI language understanding requires server-side model/key configuration; deterministic commands and advice already work.
3. A native iOS/Android shell is required for App Intents/Shortcuts, reliable hands-free activation and approved background audio/location behavior. The PWA has no background wake word.
4. Automatic screenshot OCR, a private live traffic feed, airport queue integration and automatic account-trip synchronization remain unconnected. Reviewed records can be imported now.
5. More fully timed shifts, pickup/dead mileage, actual vehicle costs and recommendation outcomes are needed for reliable net comparisons, calibrated probabilities and causal improvement claims. Remaining vehicle life and acquisition/financing/resale comparisons require owner inputs and a fuller model.
6. Exact Empower polygons and eligibility rules need official verification. The effective-dated reported expansion removes the outdated Baltimore-only assumption without inventing coverage guarantees.

**Recommended next priority:** real iPhone field testing of foreground voice, GPS and Bluetooth with complete shift/odometer records; then an approved provider adapter and native voice shell. This supplies trustworthy outcomes before expanding automation.
