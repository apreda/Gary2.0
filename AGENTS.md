# Working on Gary

The production checkout on Adam's Mac is `/Users/adam.preda/Desktop/Gary2.0`.
`/Users/adam.preda/Documents/ChatGPT/Gary/repo` is retired. Start by checking
`git status --short --branch` and `git worktree list` so an audit does not
mistake an old clone or an isolated worktree for the running system.

Read `gary2.0/CLAUDE.md` and the latest root handoff before changing a lane.
For web changes, also follow `web/AGENTS.md` and the installed Next.js docs.
Several sessions may share the production checkout. Preserve their changes
and use explicit paths when staging and committing.

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
then stops both servers. It tests server rendering, not browser interactions.

For browser QA, use `npm run preview` (default `http://127.0.0.1:3100/picks`;
override with `-- --port=3101`). Open the full Cubs card, check its fixture
rationale and live score, then follow Results and verify the 1–1 record.
Stop with Ctrl+C. The supported fixtures cover Home, Picks, and Results;
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
