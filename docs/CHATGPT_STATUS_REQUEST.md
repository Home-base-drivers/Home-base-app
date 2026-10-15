# Dashboard status request

Home Base's configuration lives in places an agent session cannot read: the
Supabase Auth dashboard, the Resend dashboard, GitHub Pages settings, and the
deployed app itself (see "What cannot be checked from a sandboxed session" in
[AGENT_ENVIRONMENT.md](AGENT_ENVIRONMENT.md)).

This is a ready-made request for a human, or for an assistant with full
connector access, to fill those gaps. Replace the three bracketed values under
"Current state" with the live numbers, then paste everything below the rule into
the assistant. Keep it read-only: it asks for facts, not changes.

Check the project's own logs first. The redirect allow list and the active mailer
can both be established from them without any dashboard access — see "Verify the
Auth redirect from logs" in [AGENT_ENVIRONMENT.md](AGENT_ENVIRONMENT.md). Sections
A, B and F below are then a cross-check rather than the only route, which matters
because an assistant without dashboard sign-in will answer most of them "could
not check".

---

You have connector access to GitHub, Supabase, Resend and the web. I need a
**read-only status report**. Another agent (Claude Code) writes the code for this
app; your job this time is to look things up and report back, not to change
anything.

## The app

- **Name:** Home Base — a rideshare driver app (PWA, vanilla JS, no framework).
- **Repo:** `Home-base-drivers/Home-base-app` (note the capital **H** in the repo name).
- **Hosting:** GitHub Pages, deployed by the `pages.yml` GitHub Actions workflow.
- **Expected live URL:** `https://home-base-drivers.github.io/Home-base-app/`
- **Supabase project ref:** `nixihmurdtfcbffgvpij`
- **Auth email:** Supabase Auth sending through Resend custom SMTP, sender
  `noreply@mail.homebasedrivers.com`, sender name "Home Base".
- **Current state:** `main` is at commit `[CURRENT-MAIN-SHA]`. Open PRs:
  `[OPEN-PRS, or "none"]`. The build version shipped on `main` is
  `[vNNN from dist/index.html]`.

## Hard rules

1. **Do not edit, commit, push, merge or close anything.** No code changes, no PR
   merges, no branch deletions, no Supabase migrations, no setting changes — even
   if you spot something broken. Report it instead.
2. **Never paste a secret value.** Not the Supabase service-role key, not a Resend
   API key, not an SMTP password, not a token. Report secrets by **name only** and
   say whether each one is set.
3. **Quote strings exactly as stored** — same capitalisation, same trailing slash
   or absence of one, same `http` vs `https`. Case and trailing slashes are the
   whole point of several of these checks, so do not tidy them up, do not
   normalise them, and do not retype from memory. Copy and paste.
4. **If you cannot check something, write "COULD NOT CHECK" and why.** Do not
   guess, do not infer from documentation, and do not fill a gap with what the
   value probably is. A clear gap is more useful to me than a confident guess.

## A. Supabase Auth — URL Configuration (most important)

Dashboard → Authentication → URL Configuration. Report:

- **Site URL** — exact value.
- **Redirect URLs** — every entry in the allow list, one per line, exactly as
  stored, including any wildcards and any leftover `localhost` or `127.0.0.1`
  entries.

Then compare against what the app code sends, which is exactly:

```
https://home-base-drivers.github.io/Home-base-app/
```

State plainly whether each is an exact match, and if not, what the difference is
(capital `H` vs lowercase `h`, missing or extra trailing slash, `http` vs `https`,
a `www.` prefix, etc.). Supabase matches these as literal strings and silently
falls back to the Site URL on a mismatch, with no error shown to the user — so a
single wrong character here sends every confirmation and password-reset link to
the wrong place while appearing to work.

## B. Supabase Auth — email settings

- Authentication → Providers → **Email**: is "Confirm email" ON? Is "Secure email
  change" ON? Is email signup enabled?
- Authentication → **Emails / SMTP Settings**: is custom SMTP enabled? Report host,
  port, sender email, sender name, and admin email. **Not the password.**
- Authentication → **Rate Limits**: the "emails per hour" value (should be 100).
- Authentication → **Email Templates**, for "Confirm signup" and "Reset password":
  does each template body use the `{{ .ConfirmationURL }}` variable, or does it
  contain a hard-coded URL? If any URL is hard-coded, quote it exactly. Also note
  whether the templates still carry default Supabase wording or have been
  customised for Home Base.
- Any **auth-related errors or warnings** shown in the dashboard, and anything in
  Logs → Auth from the last 7 days that looks like a failed send or a redirect
  rejection.

## C. Resend

- Domain `mail.homebasedrivers.com`: verification status, and the status of its
  SPF, DKIM and DMARC records.
- Last 7 days of email activity: counts of delivered, bounced, complained and
  failed. If there are bounces or failures, give the error reasons (recipient
  addresses can be redacted).
- Which API key is in use, **by name and last-4 only**, and whether it is
  sending-only or full access.
- Whether the account is on the free tier and how much of the monthly allowance
  is used.

## D. GitHub — Pages and repo settings

- Settings → Pages: **source** (GitHub Actions, or a branch + folder), any
  **custom domain**, whether **Enforce HTTPS** is on, and the live URL GitHub
  itself displays.
- The exact URL of the most recent successful Pages deployment, and its commit SHA.
- Branch protection rules on `main`, if any.
- Whether DNS for `homebasedrivers.com` currently points anywhere (we may move the
  app to a custom domain later, and that would change every redirect URL above).
- A list of open PRs and of branches with commits newer than `main`, so I know
  whose work is in flight. Do not merge or close any of them.

## E. Live app check

Open `https://home-base-drivers.github.io/Home-base-app/` in a browser and report:

- Does it load? Any console errors?
- The value of `<meta name="homebase-build" content="...">` in the page source.
  Compare it with the `[vNNN]` above: if the live page is behind, the last Pages
  deployment did not finish or did not pick up the merge.
- Does the service worker register successfully?
- On the **Profile** tab: does the "Home Base Account" section appear, and does any
  yellow or orange warning note appear anywhere on that screen? Quote any such
  note exactly. (One was removed; I want to confirm nothing like it is still live.)

## F. The decisive end-to-end test

This single test proves whether Section A is actually correct, so please do it:

1. Sign up on the live app with a **disposable email address you control**.
2. Open the confirmation email.
3. Report the **full confirmation link URL**, with the `token` /
   `confirmation_token` value replaced by `REDACTED` — but leave the
   `redirect_to=` parameter **completely intact and unredacted**.
4. Click it and report where you land, and whether you end up signed in.

The `redirect_to=` value is the answer I actually need: if it reads
`https://home-base-drivers.github.io/Home-base-app/` then the redirect wiring is
correct, and if it reads anything else, Supabase is ignoring what the app sends and
falling back to the Site URL.

Then, on that same test account, use **Forgot password** and report the same
details for the recovery email.

## G. Secrets inventory — names only

List the names of every GitHub Actions secret and repository variable, every
Supabase Edge Function secret, and every environment variable the `pages.yml` and
`live-signals.yml` workflows reference. For each, say only whether it is **set or
missing**. No values, no prefixes, no last-4 except where Section C asks for it.

## Output format

Return it as plain labelled sections, A through G, in that order, with one fact per
line in `Field: value` form. End with a short list headed **MISMATCHES AND
PROBLEMS** containing only the things that are wrong or missing, each as a single
sentence. If a section is entirely fine, say "no problems found" rather than
restating it.

Keep interpretation to a minimum — I want the raw values and the comparisons, and
I will decide what to change.
