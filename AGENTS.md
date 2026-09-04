# Working on Gary

The production checkout on Adam's Mac is `/Users/adam.preda/Desktop/Gary2.0`.
`/Users/adam.preda/Documents/ChatGPT/Gary/repo` is retired. Start by checking
`git status --short --branch` and `git worktree list` so an audit does not
mistake an old clone or an isolated worktree for the running system.

Read `gary2.0/CLAUDE.md` and the latest root handoff before changing a lane.
For web changes, also follow `web/AGENTS.md` and the installed Next.js docs.
Several sessions may share the production checkout. Preserve their changes
and use explicit paths when staging and committing.

## Work directly on main

Founder preference, September 4, 2026: perform authorized work directly in
`/Users/adam.preda/Desktop/Gary2.0` on `main`, verify it, and push completed
changes to `origin/main`. A separate PR and another merge approval are not
required. Check the resulting production deployment before reporting it live.
Temporary checkouts remain useful for credential-free fixture previews.

Keep the machine's real `ios/GaryApp/GoogleService-Info.plist` uncommitted,
as the Winners handoff requires. Its known difference from the tracked
redacted template is a local configuration exception; preserve it and report
that exception when the production check flags the working tree.

## Local verification

From a fresh worktree, use the root commands below. Setup installs each
package from its own lockfile. Test configuration supplies dummy client values:

```sh
npm run setup
npm run verify
npm run smoke:web
```

`verify` runs backend Vitest, the native Node edge-helper suites, web Vitest,
and Next/TypeScript checks. `smoke:web` runs the real Next app against a local
read-only fixture API, verifies Home/Picks/Results and the results export,
then stops both servers. It also checks Leaderboard rendering and its public
read RPC fixture. It tests server rendering, not browser interactions.
The Winners database cases create an isolated temporary PostgreSQL instance.
Install PostgreSQL with `pg_config` on PATH, or set `GARY_TEST_PG_BIN` to its
binary directory. CI requires those cases; local runs explicitly report a skip
when PostgreSQL is unavailable.

For browser QA, use `npm run preview` (default `http://127.0.0.1:3100/picks`;
override with `-- --port=3101`). Open the full Cubs card, check its fixture
rationale and live score, then follow Results and verify the 1–1 record.
On `/leaderboard`, choose each window and sort, then click the selected control
again: standings must remain visible rather than getting stuck loading.
Stop with Ctrl+C. Fixtures cover Home, Picks, Results, and the public leaderboard;
authentication, purchases, and production services are not simulated.
The launcher refuses web environment files, strips inherited app credentials,
and guards server fetches to the local origins plus Google font downloads.
This is a development tool, not an operating-system network sandbox.

Use focused regression tests during changes, then the relevant full checks.
Report baseline failures separately. These commands do not verify live
providers, deployed edge handlers, iOS release archives, or production parity.

Run `node scripts/production-truth.js` from the production checkout's
`gary2.0` directory when checking the live system. It reads production state.
An isolated worktree should fail the daemon-folder comparison. Report an audit
branch's changes as undeployed until they are deliberately integrated and
verified in production. The edge deployment check uses timestamps, not a
comparison of deployed source contents.
