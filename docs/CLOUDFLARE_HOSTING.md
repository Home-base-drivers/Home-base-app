# Moving Home Base to homebasedrivers.com (Cloudflare)

GitHub stays the source of truth. Cloudflare Pages watches this repository and publishes
`dist/` on every merge to `main`, the same way GitHub Pages does today. The update rules in
AGENTS.md (guard READY, PR, merge) do not change.

## What v279 already did
- Edge Functions (billing, dispatch, school-events, delete-account) accept browser calls from
  `https://homebasedrivers.com`, `https://www.homebasedrivers.com` and
  `https://home-base-drivers.github.io` (shared `cors.mjs` in each function folder).
  Deployed now: billing v4, delete-account v3. **dispatch and school-events are updated in the
  repo but not yet redeployed**; deploy them once the Cloudflare address works (they still
  serve GitHub Pages correctly until then).
- Sign-in links return to whichever site the driver is using.
- Stripe Checkout/portal return to the site the driver came from; Stripe pages link to
  `https://homebasedrivers.com/legal.html`.
- `dist/_headers` sets no-cache on the page, service worker and manifest (Cloudflare only).
- All app paths are relative, so the app runs at `/` on the new domain.

## Owner steps (Cloudflare dashboard, about 15 minutes)
1. Workers & Pages → Create → Pages → **Connect to Git** → authorize GitHub for the
   `Home-base-drivers` organization → choose `Home-base-app`.
2. Build settings: Framework preset **None**; Build command **(leave empty)**; Build output
   directory **`dist`**; Production branch **`main`**. Save and deploy.
3. Open the `*.pages.dev` address it gives you and confirm the app loads.
4. Custom domains → add **`homebasedrivers.com`** and **`www.homebasedrivers.com`**. Cloudflare
   creates the DNS records because the domain is already on Cloudflare. Leave the existing
   `mail.homebasedrivers.com` (Resend) records alone.
5. Supabase → Authentication → URL Configuration: set Site URL to
   `https://homebasedrivers.com` and add Redirect URLs `https://homebasedrivers.com/**` and
   `https://www.homebasedrivers.com/**`. Keep the GitHub Pages URL in the list until the move
   is finished.

## After it works
- Sign in on the new domain once on iPhone and Android, and reinstall the home-screen app
  from the new address. Installed apps and browser storage are tied to the address, so
  drivers who used the GitHub address sign in once on the new one; their cloud data follows.
- Then point GitHub Pages visitors to the new address (a redirect release), and update the
  flyers' QR codes.
- Keep `home-base-drivers.github.io` in the allowed list until no driver uses it.
