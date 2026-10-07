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

Enable the local guard in each checkout with `npm run setup:hooks`. Local hooks
cannot intercept GitHub web edits or connector calls; those must follow the same
pre-submit check above. GitHub does not expose work still being edited locally:
both owners should communicate unfinished local work before publishing conflicting
changes. Do not claim that queued deployments alone prevent code overwrites.
