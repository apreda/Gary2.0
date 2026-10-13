# Working on Gary

The production checkout is `/Users/adam.preda/Gary2.0` on `main` (the Desktop path is a symlink; the old
`Documents/ChatGPT/Gary/repo` clone is retired). Start with `git status --short --branch` and
`git worktree list` so an old clone or worktree is never mistaken for the running system.

**Read `gary2.0/CLAUDE.md` before changing anything.** It holds the rules (how we work with Adam, the rules for
Gary's prompts, testing, deploys) and how each system works now. For web changes also follow `web/AGENTS.md`.

Several sessions may share this checkout: preserve their changes and commit with explicit paths. Keep the
machine's real `ios/GaryApp/GoogleService-Info.plist` uncommitted (a known local exception).

## When Adam asks for verification

Run only what he asks for. Reference commands (each package installs from its own lockfile):

```sh
npm run setup
npm run verify      # backend Vitest, edge-helper suites, web Vitest, Next/TypeScript
npm run smoke:web   # the Next app against a local read-only fixture API
npm run preview     # browser QA at http://127.0.0.1:3100/picks
```

The Winners database tests create a temporary PostgreSQL (`pg_config` on PATH or `GARY_TEST_PG_BIN`). For the
live system, `node scripts/production-truth.js` from `gary2.0` reads production state (daemon folder, era
hashes, edge deploy timestamps).

## TypeSafe / Jev props

Use the [TypeSafe skill](.agents/skills/typesafe-ai/SKILL.md) for the Jev integration (MLB and NFL props).
