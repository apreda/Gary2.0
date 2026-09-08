# Native responsiveness verification — September 8, 2026 UTC

This implements the five findings in the September 7 responsiveness audit.
The Hub and Fantasy presentation approved in build 907 is retained. Version
2.25 (908) uploaded successfully at 2026-09-08 03:52:58 UTC. Apple accepted the
package for processing. Processing completion and internal TestFlight
availability are pending verification because the browser session signed out;
the root handoff records the open sign-in request and exact final archive.

## Changed behavior

| Audit finding | Implementation | Executed evidence |
| --- | --- | --- |
| Home repeats game selection and board calculations | Select the marquee hero once per render, reuse its rail and derived board rows, and find the featured pick without sorting the whole collection | Actual Swift selection fixtures cover ties, live/final transitions, sport and doubleheader identity; timestamp parsing stays bounded linearly across 12, 18, 45 and 150 rows |
| Hub hides today's content behind supporting requests | Publish the current board and connections before player details, individual league tables and history finish; preserve independent pending/error states | Controlled Swift requests keep all five support requests suspended while today's content is visible, then release each independently |
| Picks waits behind slower requests | Publish the slate independently of game picks, and today's props independently of history | Actual store fixtures hold slower requests while asserting the completed slate and current props have already published |
| Unchanged refreshes rebuild data | Compare complete accepted content before publication; preserve signal IDs and skip unchanged grouping/index work | Actual store, memo and Codable graph fixtures cover identical responses, equal-count edits, nested metadata changes, grades, failure retention and Eastern date rollover |
| Scrolling publishes after background motion stops | Assign the clamped background offset only when it changes | 1,530 deterministic scroll samples produce five actual Combine publications, including movement back through the active range |

These are measured work counts and controlled loading-order assertions. They
are not physical-iPhone frame-time, battery or load-time measurements. A
simulator Instruments attachment did not produce a usable baseline; no speed
percentage is claimed.

## Release-only regression caught before upload

The optimized simulator exposed an async tuple problem in the new Hub task
group: forming a tuple around an inline `await` misassigned completed rows to
the MLB dictionary key. The feed itself and the row mapper were correct.
Awaiting into a local first, then forming the scoped result, restores the
correct league mapping. Returned rows are also validated against their
requested league and slate date before acceptance.

A standalone reproduction using the actual model graph failed 200/200 runs
for the inline variant under `-O`; the sequential form passed 200/200. Both
forms passed without optimization. Lifecycle fixtures now compile optimized
and test that incorrect date/league responses retain last-good current data
and surface a source failure. A dedicated optimized regression extracts the
shipping task closure, league mapper and full model graph. It passes 200 task
groups / 800 scoped outcomes, with real suspensions, rotating completion order,
failures, cancellation and incorrect response scope. The same test fails at
runtime against the original broken shipping closure, proving its negative
control.

Corrected diagnostic Release loading accepted MLB 106, NFL 8, NCAAF 10 and
NBA 0 connections for September 7. NFL's next-slate card appeared again.
Temporary diagnostic prints were removed before the final archive.

## Missing MLB cards restored

Live verification also found 14 MLB starter-team-record cards discarded by
the existing decoder: `meta.starts` is a numeric sample count for those cards,
but an array of posted turns for Fantasy two-start cards. `InsightStarts` now
represents both shapes and preserves them when encoded. The sole Fantasy
consumer reads the schedule case explicitly. Unsupported types still fail
decoding instead of creating fabricated data.

Using the actual Connection model, all 264 sampled public MLB rows now decode,
up from 250 before this fix. The optimized regression checks counts, schedules,
missing/null fields, invalid types and cache round-trips. This bounded fix is
committed as `a7cd5702` and is included in the final native build.

## Automated checks

The final frozen source at `a7cd5702` passed 275 backend suites / 2,676 tests,
using Node 22.23.2 and local PostgreSQL 17 in an isolated checkout. An initial
invocation used the wrong working folder for relative-path fixtures and also
discovered an ExFAT AppleDouble metadata file; rerunning from `gary2.0` with
`--exclude '**/._*'` passed. No application source changed for that correction.
Focused tests also rechecked the
optimized Hub lifecycle and invalid-scope handling (9), Picks responsiveness
and football wiring (53), player/pulse/next-slate readers (9), and executable
Fantasy evidence/copy/date assertions.

At commit `291f735d`, an isolated credential-free checkout passed 216 native
edge-helper tests, 385 web tests in 54 suites, Next/TypeScript checks, and the
real Next fixture smoke flow. The dedicated optimized Hub routing regression
passed, and its old-code negative control failed as expected. Final model and
archive verification is recorded in the root handoff.

The source tests live in `gary2.0/tests/scripts/iosHomeRenderingPerformance.test.js`,
`iosPicksResponsiveness.test.js`, `iosHubLifecycle.test.js`,
`iosHubOptimizedLeagueRouting.test.js`, `iosHubHistoryStatus.test.js`,
`iosHubPlayerPagination.test.js`, `iosHubLeaguePulseConcurrency.test.js`,
`iosNextSlatePreview.test.js` and `iosFootballWiring.test.js`.

## Native visual evidence

The screenshots are from optimized iPhone 17 simulator builds on iOS 26.4.
They use live read-only data; scores and evidence timestamps naturally change.

- `home-mlb.jpg`, `home-ncaaf.jpg`: Home board width, scores and game states.
- `hub-mlb.jpg`: approved masthead, games strip and solid lead panel.
- `hub-nfl.jpg`: restored next-slate schedule card.
- `hub-ncaaf.jpg`: college lead, live games strip and supporting reads.
- `hub-player-evidence.jpg`: full MLB player read and detailed evidence.
- `hub-restored-mlb-record.jpg`: the previously discarded starter-record card
  opens its full read with the matching live game and team details.
- `fantasy-mlb.jpg`: an explicit quiet/expired late-evening action window.
- `fantasy-nfl.jpg`, `fantasy-nfl-full-case.jpg`: scoring fit, current decision,
  counterargument, next checks, playing window and dated sources.
- `picks-mlb.jpg`, `picks-ncaaf.jpg`: league-specific games, picks and grades.

The final source passed optimized simulator and signed device archive builds.
Three final optimized cold launches rendered without a new GaryApp diagnostic
crash report at 03:51 UTC. MLB record cards were visible and opened their full
reads; NFL's next-slate card remained correct. No lossy MLB row-drop messages
appeared in the final runtime logs.

This pass does not change hosting, model selection, paid generation or push
notifications. The existing Mac setup remains. Only this task's completed
temporary build/module caches were removed, recovering approximately 851 MB.
The preliminary 908 archive was discarded after the corrected archive
uploaded, recovering another approximately 146 MB on the external drive.
Active build products are on the external drive.
