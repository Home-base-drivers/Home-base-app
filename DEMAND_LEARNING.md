# Demand learning: evidence and operations

## What is implemented

Demand details reads the signed-in driver's own coarse neighborhood history. Existing model-improvement consent, foreground-only collection, an explicitly active shift, fresh location checks and five-minute sampling still apply. Precise coordinates are used in memory for neighborhood lookup, never stored in these records. Each snapshot stores model score and counts of nearby dated event arrival/exit windows. Existing 90-day observation retention and immediate removal on consent withdrawal apply. Missing observations are not zeros.

The public refresh adds Towson University's published in-person, explicitly timed calendar events and National Weather Service hourly precipitation forecasts. Public events receive a small context weight: calendar publication or RSVP count is not evidence of attendance or passenger requests. Unknown event end times cannot supply measured exit labels. Public sources expose freshness/failure status; private earnings and location data never enter the public snapshot or repository.

Model score change is compared within the same neighborhood using snapshots 15–90 minutes apart. It is labeled modeled, not measured demand. Foreground coverage is selective, not a representative citywide sample. Missing collection, zoom level and map color differences must not be interpreted as a demand decline.

## Actual outcome learning

Earnings already uses independent gross earnings and explicitly online hours to personalize rates after at least three recorded days and six online hours within 90 days. Forecast accuracy only compares records against forecasts saved before the outcome; past CSV imports cannot validate forecasts that never existed. Active-trip hours and payouts are not interchangeable with online gross hourly earnings. These checks are separate from model-score trend history.

Neighborhood score snapshots are NOT training labels. Automatic citywide retraining is not enabled: it requires licensed platform observations or consented, independently timestamped trip/wait outcomes, adequate geographic coverage, and chronological holdout evaluation. Demand colors are not a measured probability of receiving a ride. No Uber/Lyft/Empower sync has been added by this change.

## Screenshot review limitations

October 4, 2026 corrections: IMG_3463 was captured at 10:18 AM ET; IMG_3476 and IMG_3477 were captured at 6:15 PM ET and are one observation at two zoom levels. Both records remain qualitative Uber references. A provisional Sunday morning neighborhood prior now feeds map heat, route ranking, the demand advisory and earnings forecasts; scheduled event arrival/exit weights remain separate. This operator-supplied Sunday shape is an assumption to evaluate, not a trained or measured demand result.

Reviewed screenshots show geographically changing city and northern-suburb surge patches, including broad afternoon-looking light-map views and more localized late-night dark-map views. Date and AM/PM are missing from screenshot clocks. Dark/light rendering and zoom change apparent heat coverage; near-identical zoom variants are not independent observations. An active-hour promotion is not per-trip surge. Missing badges do not mean zero surge.

Do not attribute screenshots to named events without confirmed capture date, time zone, AM/PM and market. Screenshot bonus amounts, pricing multipliers, wait-time bands, modeled heat and gross earnings are separate units. The photos are not published and are not used as dated training labels.

October 5, 2026 additions: five Uber maps are grouped into three dated evening observations: 8:31 PM (IMG_3545), 9:48 PM (IMG_3546 + IMG_3547), and 10:00 PM (IMG_3548 + IMG_3549), America/New_York. PM is inferred from the evening sharing context and explicitly labeled. Same-time zoom variants count once; multiple captures on this Monday remain one distinct date for recurrence. Readable incentive badges and wait bands are stored separately from qualitative neighborhood shading. Unknown event markers are not attributed to a named event. No badge in a view means unobserved, not zero. Short-lived heat effects still expire after 30 minutes; historical records persist.

## Verification and future improvements

Run `npm test` and `npm run build:backend-client`. Database tests execute migrations in PostgreSQL WASM and check bounds, consent withdrawal and cross-user isolation. Public normalization tests exclude private, virtual and undated campus events and preserve unknown precipitation. Deployment uses the existing provider refresh workflow, with source failures remaining explicit.

Next independent-data milestones: approved earnings/trip provider integration; consented queue/wait outcomes; verified school dismissal calendars rather than generic school-hour assumptions; event capacity/licensing review; source-dated history across enough days; per-area holdout error and coverage reporting before promoting any trained heat model. Third-party sales and advertising use of these private observations remain disabled.

Public source documentation: https://developer.localist.com/doc/api and https://www.weather.gov/documentation/services-web-api
