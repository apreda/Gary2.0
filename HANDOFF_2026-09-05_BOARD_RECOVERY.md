# Morning board recovery — September 5, 2026

The 7 AM health check correctly reported a stale `tomorrow_board` snapshot for
September 5. It did not establish that the scheduler had stopped. The scheduler
ran its 5 AM plan and published a fresh 45-game `daily_slate` at 5:03 AM ET.

## Cause

The September 5 board failed at 5:06 AM and September 6 at 5:08 AM. Optional
MLB pitcher commentary was an all-or-nothing prerequisite to publishing the
fresh factual schedule, lines, starters, and other board data. Codex reported
an exhausted usage allowance at that time; both Anthropic fallback rungs
reported insufficient credit. Every missing commentary therefore prevented
the complete snapshot from being written.

A separate college-football kickoff refresh used an unsupported `game_ids[]`
filter. The provider ignored it and returned historical games beginning in
2004. The old refresh followed 100 pages before failing, consuming shared
provider request slots for approximately 40 minutes, then 76 minutes on its
next attempt. These refreshes started after the board failures and did not
cause the initial 5 AM publication failure.

Live recovery testing also exposed unbounded waits in the shared football
request gate. A five-page cap bounds response volume but does not bound the
time spent competing with other processes for a request slot. A corrected
two-page schedule probe took approximately ten minutes under that contention.

## Board repair

- Fresh factual board data publishes when optional commentary is unavailable.
  Missing commentary is explicit: `arms_take: null`, status `unavailable`.
- Previously generated commentary is reused only for the same exact game and
  matching pitcher facts, IDs, start time, and voice contract fingerprint.
  Old text without that fingerprint is regenerated or omitted.
- Commentary has one three-minute optional budget. Aborting it stops model
  work; exhausted provider accounts are skipped for the remainder of that
  board build rather than retried for every game.
- Actual source failures retain the existing preservation and failure rules.
  Missing factual data is not relabeled as a healthy refresh.
- The CLI reports commentary completeness alongside publication results.

The date-bounded football refresh uses supported ET-day/next-UTC-day filters,
then matches exact requested IDs locally. NFL season types remain included.
Pagination fails closed after five pages; missing or date-only starts remain
retryable. No injury handling or model selection changed.

Every scheduler schedule lookup now has a two-minute total deadline covering
the initial request gate, later-page gates, transport, and retry delays. The
deadline reaches native HTTP cancellation; a bounded call owns its transport
instead of joining an unrelated unbounded in-flight request. Cancellation
releases gate locks, prevents later retries, and does not cache partial data.
Ordinary callers retain their existing behavior. This does not redesign the
shared provider queue or bound unrelated board/insight data requests.

## Verified recovery

At **7:43:32 AM ET**, the live September 5 `tomorrow_board` was updated with
**45 games: 15 MLB and 30 NCAAF**. All 15 MLB rows have newly generated
commentary and the new exact-input fingerprint. The ordinary production CLI
completed successfully; this was not a test-table write or timestamp-only
update. Recovery log: `/tmp/gary-board-recovery-2026-09-05.log`.

At **7:51:29 AM ET**, the previously missing September 6 board was also
published: **18 games: 15 MLB and 3 NCAAF**. Its 10 paired-starter games have
generated commentary; five have an explicit partial read because one starter
is not yet announced. Recovery log:
`/tmp/gary-board-tomorrow-recovery-2026-09-05.log`.

A real corrected provider query returned 113 rows across September 5–6 and
the requested NCAAF game 457178 at `2026-09-05T16:00:00.000Z`.

Both Sol and Astra returned `READY` through the actual production bridge at
approximately 7:27 AM. Read-only account checks showed capacity then. No
account switch, credit purchase, or usage reset was performed. The reason
capacity differed from the 5 AM error is not established by these checks.

The first scheduler restart completed at **7:40:32 AM ET**, PID **59020**, from
`/Users/adam.preda/Desktop/Gary2.0/gary2.0`, with game era `fbee57bc41bd` and
props era `aa5fa0ab453b`. No active pick children were interrupted. That restart
loaded the board and date-filter fixes. It precedes the additional request
deadline patch; final runtime verification is recorded below when completed.

At this intermediate stage the full backend suite passed **1,808 tests in
201 files**. An earlier full run had one unrelated five-second MLB desk test
timeout; its focused rerun and the next full suite both passed unchanged.

## Final runtime and checks

The complete repair is committed as **`867097c0`**. The final scheduler started
at **7:56:12 AM ET**, PID **67883**, from the canonical production backend.
Its startup log names that commit and the unchanged game/props eras above.
Pre-spawn source hashes are recorded in
`/tmp/gary-board-final-runtime-2026-09-05.json`.

By 7:56:15 AM the restarted process had built all 45 games' trigger plans,
armed the college kickoff guard, and queued six college games for 8 AM. MLB's
first game-pick window is 2:40 PM. The imminent pick window correctly deferred
redundant board enrichment. No active pick children were interrupted.

The final focused run passed **92 tests in six suites**, including real-gate
aborts, HTTP/retry cancellation, independent signaled NFL team requests, and
ordinary football batching. The final full backend run exercised **1,822 tests
in 203 files**: 1,820 passed; two unchanged `codexProcessCleanup` tests failed
because their local subprocess fixture did not create its startup file within
the three-second wait under concurrent machine load. Both passed unchanged in
an isolated rerun (4.39 seconds total). All changed suites passed in the full
run. This is full-run-plus-rerun evidence, not a claim of a single all-green
full run. Syntax and diff checks passed.

`production-truth.js` confirms PID 67883, the canonical folder and era hashes,
and healthy edge deployment timestamps. At its pre-push read, no MLB games had
started; all 15 were pending their later pick windows. It still flagged the
coordinated uncommitted docs and unpushed commits, which the separate commit
task is finishing. That task owns the final push to `main` and final parity
read; no further scheduler restart is needed for documentation-only commits.

The private local Firebase plist remains an intentional configuration
exception. Preserve it and never stage it. Separate active tasks own
engagement-sheet cloud changes and web/grading changes; their deployment
status must not be inferred from this local scheduler repair.

The existing Claude 7 AM routine was not edited. Its eight-hour freshness
check identified a real stale row; unconditional restart advice is not a
diagnosis of the failing dependency.
