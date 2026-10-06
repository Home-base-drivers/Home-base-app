# Home Base connections

Updated October 5, 2026.

## ChatGPT plugins and Home Base account sync

ChatGPT connectors help maintain the repository and work with connected services in a conversation. Home Base drivers need connections inside the app, backed by a private account service. Installing a ChatGPT plugin does not activate Home Base earnings sync.

The Supabase plugin is connected. The **Home Base** project in the **Homebase** organization was created on October 2, 2026 in US East/Virginia. Both backend migrations are deployed, and hosted database privacy checks passed. See [BACKEND.md](BACKEND.md) for the release status. Auth/email configuration and the production account interface are still pending; browser cloud transmission is off. This does not activate Uber/Lyft/Empower earnings sync.

The current available-tool and plugin-directory checks did not identify an Uber, Lyft, Empower, Gridwise, or Argyle earnings connector. Directory results are not exhaustive: https://chatgpt.com/plugins.

## Earnings: evaluate one connection provider first

[Argyle](https://www.argyle.com/industries/gig-economy) is a candidate for a shared connection flow. Its published [DriveItAway example](https://www.argyle.com/customers/driveitaway) describes connecting Uber and Lyft accounts through Argyle Link. Verify current coverage, permitted use for a driver earnings tracker, supported fields, ongoing refresh, and commercial terms before choosing it. Empower coverage has not been confirmed.

1. Create a Home Base business account through the [Argyle Console](https://console.argyle.com/sign-up), or request a demo.
2. Confirm Uber/Lyft support and ask specifically about Empower. Confirm that earnings, online hours, trips, tips, and corrections are available for the intended tracking use.
3. Test with the provider's sandbox before requesting production access. Follow the current [Argyle documentation](https://docs.argyle.com/).
4. Prepare Home Base account login and a private backend. The app's [Supabase setup](SUPABASE_SETUP.md) requires both owners' processor/privacy approval before private data transmission is wired.
5. After provider approval, implement account linking, connection status, reconnect/revoke controls, authenticated data retrieval, background refresh/webhooks, and stable-ID deduplication. Store private records per signed-in driver. An earnings record with active-trip hours must not be treated as an online-hour record.

The intended driver flow is: choose **Connect Uber/Lyft**, complete the provider's consent flow, and let Home Base update earnings automatically. CSV is the fallback for unsupported or temporarily disconnected services. Manual entry remains the last fallback. This flow is not yet activated in the production app. The Earnings screen now provides interactive Uber, Lyft, and Empower connection options with honest availability status, a CSV fallback, and a separate manual fallback. No connection button claims to have linked an account.

For a direct Uber integration, the [Driver API](https://developer.uber.com/docs/drivers/references/api) exposes driver profiles, payments, and trips but requires limited-access approval. The existing Uber price-estimates feed does not authorize access to driver earnings. Empower requires an authorized integration or confirmed aggregator coverage; do not assume a public earnings API exists.

## Heat-map provider feeds already wired in the repository

These are separate from a driver's private earnings sync. The provider refresh runs inside [Deploy Home Base to GitHub Pages](.github/workflows/pages.yml), on pushes to `main`, a five-minute schedule target, and manual dispatch. GitHub scheduling can delay runs. Each deployment validates the app before fetching providers.

| Purpose | Provider account | Existing GitHub setting |
| --- | --- | --- |
| Verified public events | [Ticketmaster developer registration](https://developer.ticketmaster.com/products-and-docs/apis/getting-started/) and Discovery API key | Secret: TICKETMASTER_API_KEY |
| BWI scheduled flight activity | [FlightAware AeroAPI](https://www.flightaware.com/aeroapi/portal/) with the required schedule access | Secret: FLIGHTAWARE_API_KEY |
| Authorized Uber price estimates | Uber developer app with approved estimates access | Secrets: UBER_CLIENT_ID and UBER_CLIENT_SECRET; variable: UBER_ESTIMATES_SCOPE. UBER_ACCESS_TOKEN is the workflow's alternative token mode. |

Booking.com travel context additionally requires secrets `BOOKING_API_KEY` and `BOOKING_AFFILIATE_ID` from an approved [Booking.com Demand API account](https://developers.booking.com/demand/docs/getting-started). Lodging availability does not enter the rideshare-demand score.

Open [repository Actions secrets](https://github.com/Home-base-drivers/Home-base-app/settings/secrets/actions) for private provider values, and [Actions variables](https://github.com/Home-base-drivers/Home-base-app/settings/variables/actions) for the approved non-secret Uber scope. Enter values directly in GitHub; never send them in chat. Saved secret names alone do not prove API access: confirm fresh provider statuses after deployment.

An owner enters provider-issued values directly in the repository's **Settings → Secrets and variables → Actions**. Use the exact setting names above. Do not send credential values in chat or commit them to source. After saving them, run **Actions → Deploy Home Base to GitHub Pages → Run workflow**, and verify successful provider calls and fresh statuses in Home Base's **Demand details** panel. Missing or rejected access stays labeled unavailable.

Provider data has different meanings: Uber estimates are a price proxy; flight schedules are airport activity context; events are dated event context. None is a count of confirmed ride requests. Open-Meteo weather, OpenStreetMap venue data, and OSRM road routes already have public refresh paths and do not require a driver to connect an account.

## Map controls to preserve

All workspace tabs offer minimize and close controls. Driving view hides navigation tabs by default; **Show tabs** restores them. The pickup card has **Hide** and **Show pickup** controls. **Map only** hides the panels, header, and navigation; **Show controls** restores the chosen view. These display preferences persist on the device. Shared detail dialogs must stay in the visible viewport and support closing with **Done**, the backdrop, or Escape.

## Recorded earnings view

The Earnings screen separates recorded gross income from planning forecasts and payouts. Week (Monday start), month, year, and all-history views can be filtered by platform. Precise timestamps use the current market timezone. Undated rows are included only in all history; future-dated rows are excluded from recorded totals. Gross hourly rates use only gross records with explicitly online hours. Active-trip duration does not count as online time. Forecast learning, costs, backup, and manual entry are collapsed until needed. Earnings-period and platform choices are saved on the device and included in backups.
