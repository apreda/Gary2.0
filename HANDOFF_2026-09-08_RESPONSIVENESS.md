# Home, Hub and Picks responsiveness — September 8, 2026 UTC

Adam authorized implementation of all five findings in the September 7 native
responsiveness audit after the Hub/Fantasy redesign. Keep the Mac hosting
setup, preserve the approved build-907 presentation, and exclude notification
work from this lane.

## Source and release candidate

All implementation is committed and pushed on canonical main:

- `8ac4a271`: Home calculation reuse, staged Hub/Picks loading, complete-content
  equality and redundant-scroll-publication suppression; version 2.25 (908).
- `c6cf4c64`: correct optimized async league routing, response scope validation
  and optimized lifecycle fixtures.
- `291f735d`: production-code optimized regression with a verified failing
  negative control against the old implementation.
- `a7cd5702`: restore MLB starter-record cards while preserving Fantasy's
  posted-start schedule and full Codable content equality.

Release status: final optimized simulator build and signed device archive
passed. Version 2.25 (908) uploaded successfully at 2026-09-08 03:52:58 UTC;
Xcode reports `Uploaded package is processing` and `EXPORT SUCCEEDED`.
Final archive:
`/Volumes/KINGSTON/Gary-2.25-908-Responsiveness-final.xcarchive`.
Upload receipt: `/tmp/gary-908-final-upload.log`.
The earlier incomplete 908 archive was discarded to prevent accidental reuse.

Apple processing completion and internal TestFlight availability remain
unverified. The App Store Connect browser session expired; Adam has an open
request to sign back in. Once signed in, verify the 908 row is Complete and
included in the internal Beta group, then update this receipt. Do not upload
908 again. No change was made to the existing App Store submission 2.25 (901).

## Delivered behavior

Home reuses its hero, rail and board calculations; candidate selection avoids
sorting the entire collection. Hub publishes today's content before player
details, league tables and history finish, with independent pending/error
states. Picks publishes the slate and current props before slower related
requests. Complete accepted-content comparisons preserve unchanged rows and
signal identities. Background scrolling publishes only changed offsets.

Preserved semantics include exact sport/game identity, doubleheaders, Eastern
slate rollover, last-good same-date content on failure, authoritative empty
responses, cancellation ownership, grade changes and same-count data edits.
Ready information never borrows a failed source's date or league label.

Release QA caught a Swift optimization issue in an inline awaited tuple that
collapsed league result keys. Awaiting the rows before constructing the tuple
fixes it; actual-code optimized tests reproduce the old failure. Live row
checks also found `meta.starts` was a count for MLB starter records but an
array for Fantasy schedules. A small Codable sum type restores 14 missing
cards in a 264-row sample and retains both JSON shapes.

## Verification

Final frozen `a7cd5702`: 275 backend suites / 2,676 tests pass under Node
22.23.2 with PostgreSQL 17. At `291f735d`, 216 native edge-helper tests,
385 web tests in 54 suites, Next/TypeScript checks and the isolated real-Next
fixture smoke pass. Later changes are limited to native models, one Fantasy
schedule consumer and the associated regression. The final backend run
includes both optimized regressions and all lifecycle/store tests.

Actual Combine measurements show 1,530 deterministic scroll samples yielding
five offset publications. Actual Swift selection fixtures verify bounded
linear timestamp parsing, and controlled request fixtures prove completed
content publishes while slower requests remain suspended. These establish
reduced work and correct loading order, not measured physical-iPhone speed.
Simulator Instruments did not produce a usable before/after baseline; no
frame-time, battery or percentage improvement is claimed.

See `audit-evidence/responsiveness-2026-09-08/README.md` for screenshots,
behavioral evidence and the release-only regression record. Native optimized
QA covers Home MLB/NCAAF, Hub MLB/NFL/NCAAF, MLB player details, NFL full
Fantasy reasoning, late-evening MLB Fantasy state, MLB/NCAAF Picks and exact
college game routing. Guest Billfold and sign-in/recovery entry also render;
no account, purchase or recovery email was created during QA.

The final build passed three cold launches. No new GaryApp crash diagnostic
was present at 03:51 UTC, and the final runtime logs contain no MLB row-drop
warnings. Restored record cards were visible and opened their complete reads;
the final NFL next-slate card displayed correctly. The simulator and native
source freeze were released after upload for the separate launch task.

## Shared production checkout

Other launch work is active in the same checkout and is owned by the launch
review task. Its earlier native `768e288a` changes are included in 908. Later
backend/security/web edits are separate from this native release lane. The
final 03:53 UTC production-truth read showed canonical scheduler PID 79083 and
Winners PID 89023, with 11/11 MLB games published and none started without a
pick. All 20 edge timestamp checks passed, and no commits were unpushed. Its
exit 1 reflects the other task's active uncommitted work plus this lane's
then-uncommitted evidence and the preserved private configuration exception.
Do not describe the entire shared checkout as globally clean or fully finished.

Preserve the private `ios/GaryApp/GoogleService-Info.plist` local exception;
it was not read, edited, staged or committed. Use explicit staging paths.
No hosting, provider/model configuration, paid generation or notification
changes were made by this performance lane. Approximately 851 MB of only this
task's completed temporary build/module caches were removed. The discarded
preliminary 908 archive recovered another approximately 146 MB on the external
drive. Final build products and the previous release archives are retained.
