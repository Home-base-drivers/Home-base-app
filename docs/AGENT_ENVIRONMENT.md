# Working on Home Base from an agent session

Read `AGENTS.md` and `CONTRIBUTING.md` first — they are the rules. This file is
the practical companion: the things that have actually cost time, and the state
that cannot be checked from inside a sandboxed session.

## The pre-submit guard fails with HTTP 401 behind a proxy

`scripts/check-update-ready.mjs` calls GitHub with Node's global `fetch`
(undici), which **ignores `HTTPS_PROXY`**. In a sandboxed session whose only
egress is an HTTPS proxy, the request never reaches GitHub and the guard reports:

```
GitHub status unavailable (HTTP 401). Submission blocked.
```

`curl` and `git` honour the proxy and work fine, so the token and the repo state
are not the problem. `.githooks/pre-push` execs the same script, so `git push`
fails the same way.

Make the guard proxy-aware instead of working around it:

```sh
NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=<path-to-proxy-ca-bundle> \
  npm run check:update -- --expected-head <current-main-SHA>
```

Prefix `git push` with the same two variables. In a Claude Code cloud session the
CA bundle is at `/root/.ccr/ca-bundle.crt`; on a normal machine neither variable
is needed. **Do not** pass `--no-verify`, and do not edit the guard to skip the
check — rule 7 of `AGENTS.md` forbids bypassing hooks, and the guard exists to
stop one owner publishing over the other's work. A 401 is a transport failure to
fix, not a reason to push unverified.

## A single-branch clone hides the other owner's work

Some clones of this repo arrive with a narrow fetch refspec:

```
+refs/heads/main:refs/remotes/origin/main
```

`git fetch` then creates a remote-tracking ref for `main` and nothing else. Two
consequences: a branch you have genuinely pushed still has no `origin/<branch>`
ref locally, so tooling reports it as unpushed and missing from the remote; and
you cannot see any other branch, which matters in a repo whose first rule is to
preserve both owners' changes. Restore the standard refspec:

```sh
git config --replace-all remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
git fetch origin
```

Check `git status -sb` really does print `## <branch>...origin/<branch>` before
believing any report that a push did not land.

## Release version lives in four places and must stay aligned

`tests/release-integrity.test.mjs` fails unless all four of these carry the same
number:

| Where | Looks like |
| --- | --- |
| `dist/index.html` meta | `<meta name="homebase-build" content="v261">` |
| `dist/index.html` SW registration | `serviceWorker.register('sw.js?v=261'` |
| `dist/index.html` reload key | `hb-release-reload-v261` |
| `dist/sw.js` cache name | `const CACHE='home-base-v261'` |

Bump all four when shipping a change under `dist/`, and name the commit
`vNNN: <summary>` to match the existing history.

The service worker is network-first for every same-origin GET, with
`cache: 'no-store'`, falling back to the cache only when the network fails. New
asset contents therefore reach users without a version bump; the bump exists to
drop the old cache cleanly and to keep the release legible. Do not claim a change
cannot reach users without one.

## Generated versus hand-written files under `dist/`

- `dist/homebase-backend.js` is **generated**. Edit `src/backend-client.mjs`, then
  run `npm run build:backend-client`, then commit both. Never hand-edit the bundle.
- `npm run build:backend-client` **silently does nothing when `node_modules` is
  absent**. Run `npm install` first and confirm the bundle actually changed before
  trusting it.
- `dist/homebase-growth.js`, `dist/homebase-copilot.js` and their siblings are
  hand-written and committed as-is. There is no build step for them.

## Account-screen copy is assembled from two files

`dist/homebase-growth.js` wraps `renderProfile` from `dist/index.html`: it calls
the original, then prepends the account section and appends the privacy section.
Copy in `index.html` therefore renders **above** copy in the growth module, and
the two can contradict each other — `index.html` once told drivers "Home Base
does not currently create a cloud account" directly above the section that
creates one. When changing anything on the Profile screen, grep both files.

## The live app URL

The redirect sent to Supabase Auth is a single constant in
`dist/homebase-growth.js`:

```
https://home-base-drivers.github.io/Home-base-app/
```

The repository's canonical name is `Home-base-app` with a **capital H**
(`full_name` from the GitHub API confirms it; the lowercase git remote is a
redirect). GitHub Pages paths are case-sensitive, and Supabase compares redirect
URLs as literal strings and **silently falls back to the Site URL** on a
mismatch, with no error shown to the driver. Capitalisation and the trailing
slash are load-bearing. The same URL also appears in `BACKEND.md` and, as an
origin without a path, in the Edge Function CORS allow-lists.

## What cannot be checked from a sandboxed session

Do not guess at any of these, and do not report them as verified:

- **Supabase Auth → URL Configuration** (Site URL, Redirect URLs) is not exposed
  through the Supabase MCP tools. Tables, advisors, logs and migrations are.
- **`https://home-base-drivers.github.io/`** and **`homebasedrivers.com`** are
  blocked by the session's egress proxy, so the deployed app cannot be loaded.
- The **GitHub Pages REST endpoint** (`/repos/{owner}/{repo}/pages`) returns 403
  through the session's GitHub proxy. Workflow runs, branches, PRs and repo
  metadata are all reachable.

`docs/CHATGPT_STATUS_REQUEST.md` is a ready-made request for a human or an
assistant with full dashboard access to fill these gaps.

## Checks before submitting

```sh
npm install                      # once per session
npm test                         # 356 checks
npm run test:release             # 6 checks + inline script validation
npm run build:backend-client     # only if src/backend-client.mjs changed
```

`Refresh live demand signals` runs on the machine-owned `signals` branch and is
excluded from the guard's blocking set, so it does not hold up a release.
