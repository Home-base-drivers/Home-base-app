# Production verification

GitHub Pages publishes `dist/` only. A green Pages deployment does **not** deploy
Supabase Edge Functions or prove an authenticated AI request succeeded.

## Release checks

1. Follow AGENTS.md and the shared update guard. Preserve both owners' work.
2. Run `npm test`, `npm run test:release`, and all three build scripts. Generated
   backend and calendar files must match the committed versions.
3. Deploy the complete current function directories to the existing project
   `nixihmurdtfcbffgvpij`. Preserve authentication behavior and all dispatch ops.
   Include generated `engine.js` and all imported modules (including `errors.mjs`).
4. Retrieve each deployed function and compare every file to the release source.
5. Verify live HTML/build, service-worker/cache, runtime assets, and recent logs.

## AI verification

- Test as a real confirmed account, using secure sign-in. Never obtain credentials
  or session tokens from logs, SQL, browser storage, or chat.
- Confirm `live-session` returns SDP; then require `session.started`, an open data
  channel, and WebRTC `connected` before claiming connection success.
- Verify actual audio, English/Spanish switching, current-information research,
  follow-up context and interruption on a microphone-equipped device.
- On failure, correlate the response's `request_id` with the structured
  `homebase_dispatch_failure` log. Logs preserve operation and provider status/code,
  not provider response messages, keys, transcripts or driver context.
- Model/quota/auth errors require the actual provider status/code before choosing
  a fix. Do not substitute an older model or phone speech to hide a Live failure.
- An app-control click confirms only a request. GPS/navigation completion requires
  an actual result. Toggle confirmation requires an observed state change.

## Provider configuration

Credentials stay in GitHub Actions secrets. Required names:
`TICKETMASTER_API_KEY`, `FLIGHTAWARE_API_KEY`, and either `UBER_ACCESS_TOKEN` or
`UBER_CLIENT_ID` + `UBER_CLIENT_SECRET` + approved variable `UBER_ESTIMATES_SCOPE`.
An owner must enter any missing credentials directly; never use placeholders.
Check the newest `signals/provider-signals.json`, not only the Pages copy.
An honest `not_configured` status and a green refresh job do not mean a provider
is connected. Verify a real successful provider response after configuration.
