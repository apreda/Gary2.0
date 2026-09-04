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

Install dependencies with `npm ci` inside each package. The following checks
use fixtures and mocks; the backend values are dummy client configuration:

```sh
SUPABASE_URL=https://example.supabase.test SUPABASE_ANON_KEY=test-anon-key npm --prefix gary2.0 test
npm --prefix web test
```

Use focused regression tests during a change, then run the relevant package's
suite. Report baseline failures separately from regressions. A unit suite is
not a live provider, browser, iOS release archive, or deployment check.

Run `node scripts/production-truth.js` from the production checkout's
`gary2.0` directory when checking the live system. It reads production state.
An isolated worktree should fail the daemon-folder comparison. Report an audit
branch's changes as undeployed until they are deliberately integrated and
verified in production. The edge deployment check uses timestamps, not a
comparison of deployed source contents.
