# Built-in Home Base AI (free plan)

`dist/homebase-internal-ai.js` (`window.HomeBaseInternalAI`) runs on the phone with no
API cost. GPT stays the engine for Home Base AI Plus (voice + open conversation).

## Routing
- Plan lives in `homeBaseProductPrefs.aiPlan` (`builtin` default, `plus`), synced with the account.
  The chat composer has a **Built-in · Free / GPT · Plus** switch.
- Typed chat: built-in plan answers locally; Plus calls GPT and falls back to the built-in
  answer (labelled) if GPT is unavailable.
- Voice: driving commands (modes, pause, minimums) go to the existing parser first, then the
  built-in AI, then the local prediction fallback. Built-in plan never calls GPT, including
  the translate step in `say()`.
- Billing is not enforced yet: the switch is a client setting. Enforce Plus on the server
  (`dispatch` agent operation) before charging.

## What it answers (from the driver's own records and live app data)
Earnings by day/week/month/date, goal pace ($ per N hours), trip offers ($/mile, $/hour with
the driver's learned unpaid minutes per trip, $1.50/mile round-trip rule for far drop-offs),
Uber vs Empower (incl. Empower Flex fee), gas cost share, best hours/days, busiest areas and
upcoming events, CSV export. Anything else returns `handled:false` with a pointer to Plus —
never a made-up answer.

## Screenshot → trips
- Tesseract.js 5.1.1 is loaded from jsDelivr only when a screenshot is read; the page image is
  grayscaled, dark mode inverted and thresholded, then read in page-segmentation mode 4.
- Rows start at a ride-type label or a clock time; pay, `N min N sec` and `N mi` in the row
  belong to it. Colon misreads (`9112 AM`) are repaired. Impossible speeds are flagged.
- Several screenshots of one day are combined into one review (date carries forward,
  overlapping rows once). Nothing is saved until the driver taps **Save trips**.
- IDs: `screenshot-<app>-<yyyymmdd>-<hhmm>` (same scheme as recovered history), so re-reading
  updates instead of duplicating. If the ledger already has a day total for that app/date,
  trips are saved as detail only (no double count).
- Earnings → **Trips from screenshots** card: read screenshots, **Export trips CSV**.

## Verified
Synthetic Uber-style screenshots (dark and light, 34-trip day over 4 screenshots, Empower)
read 34/34 rows exactly in headless Chromium. Real Uber screenshots still need a phone test.

## Plans and GPT Live minutes (v275)
- Server tables `ai_plan_limits` (free 0 s, plus 7200 s = 120 min at $19.99, pro 15600 s = 260 min at $39.99),
  `ai_entitlements` (written only by `set_ai_plan`, service role), `voice_sessions` (metered from server time).
- `dispatch` refuses GPT chat, GPT voice, translate and GPT Live for free plans (402 `plan_required`) and opens
  GPT Live only through `start_voice_session` (402 `voice_minutes_used_up` when the month is used).
- Phone: Talk is hybrid by default (phone speech + built-in AI / GPT text, no Live minutes). GPT Live opens in
  Live mode or on "let's talk"/"go live"; it closes after 20 s of quiet, at the cap, or in the background, sends a
  heartbeat every 60 s and reports its end. A crashed phone stops counting 45 s after its last heartbeat.
- Deploy order: apply migration → set owner plans with `set_ai_plan` → deploy `dispatch` → release the app.

## v276 additions
- "Brief me" (today so far, goal pace, best hours still ahead from the driver's own trips on this
  weekday, busy areas, events in 12 h, per-trip pay needed for a 12-minute ride), "How was my week?"
  (vs same days last week, best day, pace, gas share), "Should I keep driving?" (next hours vs usual,
  events in 3 h, shift limit). Chat suggestions point to these. Payments: see docs/PAYMENTS.md.
