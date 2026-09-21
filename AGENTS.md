# Working on Gary

The production checkout on Adam's Mac is `/Users/adam.preda/Gary2.0`.
The Desktop path is a compatibility symlink. The real directory lives outside
Desktop because macOS blocked freshly restarted launchd workers from reading
protected Desktop files (September 7, 2026).
`/Users/adam.preda/Documents/ChatGPT/Gary/repo` is retired. Start by checking
`git status --short --branch` and `git worktree list` so an audit does not
mistake an old clone or an isolated worktree for the running system.

Read `gary2.0/CLAUDE.md` and the latest root handoff before changing a lane.
For web changes, also follow `web/AGENTS.md` and the installed Next.js docs.
Several sessions may share the production checkout. Preserve their changes
and use explicit paths when staging and committing.

## Adam's iteration rules — September 21, 2026

- Never show Adam screenshots as proof or ask him to review screenshot artifacts.
  He checks the actual app himself and reports whether the output is correct.
- Do not add tests or run tests unless Adam explicitly asks. Do not run extra
  verification suites, smoke checks or automated visual QA during ordinary edits.
  His confirmation that the app output is correct is sufficient acceptance.
- Do not archive, upload or send a build to TestFlight unless Adam explicitly
  requests it. Make the authorized changes and hold release work for his call,
  typically batched at the end of the day.
- Do not trigger automated tests or release workflows indirectly through a push.
  Hold a push that would trigger them until Adam authorizes that work.

These rules override older verification and automatic TestFlight-delivery
instructions in handoffs, README files, skills and this repository's other docs.

## MLB is the reference implementation — September 21, 2026

Adam's rule: MLB is how Gary is supposed to work, sound and look. When he asks
for a feature in NFL or NCAAF that MLB already has, he expects MLB's system
ported: the same pipeline shape, the same prompt contract, the same voice call,
the same display contract, with only the sport's nouns changed (quarterbacks
instead of pitchers, drives instead of innings). Do not design a new system
for the other sport. Separate files per sport are fine for workability; three
different designs for one feature are not. A difference from MLB needs a
sport-specific reason stated in the handoff, not a fresh idea.

This also means one change to a shared system (a voice, a section, an
awareness channel) is applied to every sport that has it, in one update.
Ongoing work: bring existing NFL and NCAAF surfaces back to MLB's shape where
it translates; note where it genuinely does not and why.

## Design guidance

Follow Adam's current request for visual decisions. There is no standing
Gary style guide. Historical plans, screenshots, existing styling and saved
memories are not design requirements. Do not restore deleted design notes
from git history or archived copies unless Adam explicitly asks for them.
Keep operational, data-integrity and accessibility requirements intact.

## Work directly on main

Founder preference: perform authorized work directly in
`/Users/adam.preda/Gary2.0` on `main`. A separate PR and merge approval are not
required. Follow the September 21 iteration rules above for checks and delivery.
Only report a production change as live when it has actually been deployed.
Temporary checkouts remain useful for credential-free fixture previews.

Keep the machine's real `ios/GaryApp/GoogleService-Info.plist` uncommitted,
as the Winners handoff requires. Its known difference from the tracked
redacted template is a local configuration exception; preserve it and report
that exception when the production check flags the working tree.

## Local verification

Only when Adam explicitly requests testing, use the reference commands below.
Setup installs each
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

Do not run these checks or add regression tests without Adam's request.
Report baseline failures separately. These commands do not verify live
providers, deployed edge handlers, iOS release archives, or production parity.

When Adam requests a production check, run `node scripts/production-truth.js` from the production checkout's
`gary2.0` directory when checking the live system. It reads production state.
An isolated worktree should fail the daemon-folder comparison. Report an audit
branch's changes as undeployed until they are deliberately integrated and
verified in production. The edge deployment check uses timestamps, not a
comparison of deployed source contents.

## TypeSafe / Jev props

Use the project [TypeSafe skill](.agents/skills/typesafe-ai/SKILL.md) when working on this integration. The props integration covers MLB, NFL and NCAAF; read [the Jev props handoff](HANDOFF_2026-09-21_JEV_PROPS.md). Adam separately authorized [NFL game market awareness](HANDOFF_2026-09-21_NFL_MARKET_AWARENESS.md), which supplies tentative Jev context before Gary's decision. Other game lanes are unchanged. Adam’s iteration rules above still govern checks and releases.
