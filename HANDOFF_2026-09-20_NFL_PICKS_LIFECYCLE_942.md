# NFL weekly grades and rolling game order — build 942

Adam's Sunday screenshot showed Thursday's Detroit +5.5 -108 ticket first in
NFL Picks, still displaying its kickoff instead of its result. The backend had
already correctly graded exact game 1392232 as lost: Detroit 31, Buffalo 41.
The result was created September 17 at 11:32 PM Eastern. No ticket, score or
backend grade required a rewrite.

Implementation: `879db80d3ac043c0f15c10602d90a4622b578197`, pushed to main.

## Correction

The weekly store requested the full week's results, but `gamePickResult` rejected
any pick older than yesterday. `PicksSettledGames` now retains durable outcomes
and final-score labels by league, Eastern game date, provider ID and original
ticket. Weekly NFL cards read that identity; the matchup strip also recognizes
these finals after they leave today's live-score cache. Failed reads retain
accepted grades; successful corrected or empty reads replace the exact index.

The carousel previously sorted only its first snapshot and then froze every
existing position. Its small live-status snapshot now orders live games,
upcoming games, and confirmed finals by kickoff within each group. Thursday
moves behind Sunday's and Monday's unfinished games. Each 1 PM final moves
behind remaining games as it finishes, allowing the afternoon and evening
windows to lead in turn. A past kickoff alone never establishes completion.
Yesterday remains chronological.

Reordering preserves the selected game's identity. It waits for a page drag
and its transition to settle, then replaces the underlying page controller
without animation, avoiding retained adjacent controllers at stale indexes.
Pick/prop grouping and edge indexing still run only when accepted content changes.

## Verification

Focused Swift fixtures cover Thursday's result on Sunday, exact game/date/league/
ticket separation, changed prices, live-to-final transitions, simultaneous
kickoffs, selection remapping, duplicate legacy keys, historical order, failed
refreshes, accepted empty results and unchanged refreshes. The existing native
historical-score fixture now carries the actual exact-result collaborator and
checks the Thursday final label.

The whole iOS Simulator app compiles. Using production read-only data, the app
shows CAR @ ATL Sunday 1 PM first and DET @ BUF last after NYG @ LAR Monday.
The original Lions +5.5 -108 card reads `LOST · DET 31 · BUF 41`.
Evidence is in `/Users/adam.preda/Documents/ChatGPT/Gary/nfl-picks-lifecycle-2026-09-20/`:
`nfl-first-game.png`, `nfl-thursday-final.png`, and `thursday-grade.json`.

The first broad pass exposed an outdated native fixture plus an NFL team-field
test reaching live player endpoints. The coordination task fixed the latter in
73a961de, retaining field checks with bounded roster/player fixtures and an HTTP
guard. A subsequent pass had one intermittent existing process-cancellation
fixture timeout under the concurrent archive workload. The complete backend
rerun with two workers passed all 4,569 tests in 428 files, including that case.
All 243 edge tests, 953 web tests in 89 files, backend lint, both type checks,
and native source membership also passed. Full Simulator compilation and the
signed Release archive succeeded; codesign verification passed.

## Delivery

Build 2.26 (942) was successfully archived at
`/Volumes/KINGSTON/Gary-2.26-942-nfl-picks-lifecycle.xcarchive`.
Upload succeeded September 20 at 11:13:00 ET. Apple confirmed processing and
TestFlight availability at 11:15:36 ET.

- [TestFlight 2.26 (942)](https://testflight.apple.com/v1/app/6751238914)
- Availability receipt: `1a0bf631651770c7`.
- Processing receipt: `1a0bf63164e3e0bf`.
- Source: `879db80d3ac043c0f15c10602d90a4622b578197`.
- Upload receipt: `nfl-picks-lifecycle-2026-09-20/upload.log`.
- [Implementation verification](https://github.com/apreda/Gary2.0/actions/runs/35518758812): all four jobs passed, including the full iOS Simulator compile.

Production-truth confirms canonical scheduler PID 41418, the running Winners
worker, unchanged frozen/game/prop hashes, current edge deployment timestamps,
and no unpushed commits. The final working-tree flag is limited to the three
preserved local exceptions below. No public App Store
submission was made.

No cloud handler or backend shipping source changed in this correction. NFL
research, prompt/history policy, the frozen June and NBA sources, injury handling,
and the original published tickets are preserved. The local deno.lock, private
Firebase plist, and audit-snapshot exceptions remain intentionally unstaged.
