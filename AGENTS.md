# Home Base shared update rules

Christopher Brouard and Elizabeth Garcia are both owners and developers. Their
work has equal priority. Preserve both owners' changes.

## Before submitting any change to GitHub

1. Read `CONTRIBUTING.md`. Fetch the current remote branch and integrate its
   changes into your work; do not replace newer files with an older checkout.
2. Run the checks appropriate to the change.
3. Run `npm run check:update -- --expected-head <current-main-SHA>` immediately
   before any GitHub write, including API/connector commits, pushes, and merges.
   It must report READY. This applies to both owners, all agents, and all branches.
4. If any workflow is queued, requested, pending, waiting, or running, wait for
   it to finish. Do not cancel another owner's update to make room for yours.
   Keep the user informed while waiting. Fetch, integrate, and repeat the checks
   if the remote branch changes. An API error or unknown state blocks submission.
   Obsolete waiting/pending runs may be cancelled only after verifying their
   commits are included in a later successfully deployed main revision. Report
   this cleanup, preserve the commits, and cancel obsolete pending runs before
   the run holding the queue so old code cannot start deploying.
5. A new main commit whose deployment has not registered/completed also blocks
   submission. A finished failed run is no longer processing; report its failure
   and preserve its code while preparing a corrective update.
6. Recheck the remote branch immediately before publication. Use a normal
   fast-forward push, or a connector ref update with `expected_sha` equal to the
   checked head and `force: false`. A rejected update means somebody else published:
   wait for their processing to finish, sync their changes, and test again.
7. Never force-push, bypass hooks, or retry a rejected update with stale file
   contents. Wait for your own validation/deployment to finish and verify the result.

## Demand data contract (heat, events, route)

Design work on the heat map (palette, blur, footprint, layout, controls) changes
how data is drawn, never what data exists. Do not delete, reorder or rewrite
stored records in `dist/homebase-demand-history.js`, remove sources from
`config/provider-markets.json`, or change the data-module script tags in
`dist/index.html` as part of a design change. History is append-only: corrections
are added as patches that keep the original record id.

`tests/demand-data-integrity.test.mjs` enforces this. It fails when a stored
surge record disappears, when history stops feeding heat or route evidence, when
the published snapshot stops yielding events, places or bells, when a market has
no keyless event source, or when the app stops re-checking sources on open. After
adding records, run `npm run history:manifest` and commit the updated manifest.

## Confirmed schedules draw thick

Schools with published bell times (inside drop-off/pickup windows) and verified
shift sites (Amazon, hospitals at shift change) draw as confirmed demand, like a
dated event: strong orange/red over the surrounding streets, not faint background.
Every published-bell school is placed on the map even when no mapped school point
matches it. Routine schools without bell times stay faint. `tests/scheduled-heat.test.mjs`
enforces this.

## Saved calendars contract

Public calendars are read by the daily calendar check and saved per calendar on the
`calendar-archive` branch (`scripts/calendar-archive-core.mjs`). Never make the live
refresh re-read a calendar that was read successfully today, and never let a failed
or suddenly empty read erase saved upcoming events; fall back to the archive. New
calendar sources go in `config/provider-markets.json` and are picked up by the
check automatically. `tests/calendar-archive.test.mjs` enforces this.

## Speed and placement contract (map must never freeze)

Surge history only grows, so anything that loops over it runs on every place and
every hour of the 12-hour route. Keep `recurrenceForPlatform` working from the
cached per-record facts (`rowFacts`) and the `recurrence` memo; never convert
times through `Intl`/`toLocaleDateString` inside a per-record or per-cell loop.
Heat drawing keeps per-cell work allocation-free and coarsens pixel cells as the
map zooms in. Games without coordinates are placed on a local venue only by a
distinctive name word and a matching city; generic words (Center, Arena, Garden)
never place a game.

`tests/freeze-and-venues.test.mjs` enforces this with time budgets (including
four times today's history) and with the Oct 26 out-of-state games (Paycom
Center, Toyota Center, Madison Square Garden, Rocket Arena). Every one of those
tests fails on the v293 code that froze. Do not raise a budget to make a change
pass; make the change faster.

## Before you start

Read [docs/AGENT_ENVIRONMENT.md](docs/AGENT_ENVIRONMENT.md). It covers the
release-version files that must stay aligned, which files under `dist/` are
generated, the guard's proxy failure and the clone refspec that hides the other
owner's branches — each of which has already cost a session's time. It also lists
what a sandboxed session cannot verify, so nothing in that list gets reported as
checked when it was not.

Configuration that lives only in a dashboard is requested with
[docs/CHATGPT_STATUS_REQUEST.md](docs/CHATGPT_STATUS_REQUEST.md).

Enable the local guard in each checkout with `npm run setup:hooks`. Local hooks
cannot intercept GitHub web edits or connector calls; those must follow the same
pre-submit check above. GitHub does not expose work still being edited locally:
both owners should communicate unfinished local work before publishing conflicting
changes. Do not claim that queued deployments alone prevent code overwrites.
