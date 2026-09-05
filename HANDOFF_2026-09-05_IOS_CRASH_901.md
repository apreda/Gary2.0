# TestFlight crash and individual Picks sports — September 5, 2026

The founder reported a launch crash in TestFlight 2.25 (899), incident
70BFB4E7-65B2-4B42-87E5-916A75F221C8, and asked to remove the All sport section.
The screenshot shows EXC_BREAKPOINT/SIGTRAP about eight seconds after launch.
It does not include the crashing thread's stack. The paired phone was unavailable
and App Store Connect's Chrome session required sign-in.

## Reproduction and repair

Launching the existing simulator app on Picks against September 5's live feeds
terminated with `Swift/NativeDictionary.swift:792: Fatal error: Duplicate values
for key: 'cubs|marlins|993688'`. This is a directly reproduced native crash,
not a symbolicated attribution of the screenshot's incomplete phone report.

The public feed contains Cubs–Marlins provider game 5059897 at 20:10 UTC.
Its home-run prop uses `sport: MLB HR`; the two ordinary props use `MLB`.
Picks groups those separately but renders them on one MLB desk. The merge used
league/provider identities without normalizing that HR alias, producing two
entries with the same matchup/time key. The next refresh built a dictionary
requiring unique keys and trapped.

- Normalize MLB HR to MLB for the provider game identity.
- Index both provider and legacy matchup/time identities, including newly
  resolved timestamps. Merge a legacy row only when exactly one compatible
  entry exists; preserve conflicting known IDs and doubleheader starts.
- Build refresh ordering with an explicit first-position collision policy so
  an existing duplicate memo cannot terminate the app.
- Remove the Picks All feature flag and its mixed-sport display/filter paths.
  Start on MLB while requests load or fail. Select the first active league
  after a successful load until the user explicitly chooses a sport. Keep
  MLB/NFL/NCAAF reachable and reject All even in the debug navigation harness.
- Scope every Picks record, showcase, game, prop and edge to its selected sport.

No backend pick, prop, injury handling, billing, database row or model was changed.
The intentionally local real Firebase plist remains uncommitted and untouched.

## Verification

The Debug simulator build succeeded. The repaired app survived repeated feed
refreshes and navigation through MLB, NCAAF, NFL, Yesterday and Today.
The Cubs–Marlins strip contains one entry after the HR normalization. Screenshots:
`/tmp/gary-crash-901-picks-fixed.png`, `...-ncaaf.png`, `...-nfl.png`,
and `...-yesterday.png`. Runtime log: `/tmp/gary-crash-901-simulator-runtime.log`.
The tested device is the iPhone 17 simulator on iOS 26.4, not the founder's phone.

`npx vitest run tests/scripts/ios` initially passed all 96 tests in 16 files.
After final league-filter/comment cleanup, 95 passed and an unchanged results
reader fixture failed a precondition; that fixture and the new crash regressions
both passed unchanged in an isolated rerun. The affected merge regression executes
the actual shipping Swift functions against HR aliases, both provider/legacy
arrival orders, timestamp hydration, doubleheaders, conflicting IDs, duplicate
memos, source failures, and manual sport selection.

Logs: `/tmp/gary-crash-901-all-ios-tests.log`,
`/tmp/gary-crash-901-all-ios-tests-final.log`,
`/tmp/gary-crash-901-regression-recheck.log`.

## Delivery

Version **2.25 (901)** was signed, archived and uploaded successfully. The exact
archive is `/tmp/GaryApp-CrashFix-2.25-901.xcarchive`; its bundled version and
strict code signature were verified. Final archive log:
`/tmp/gary-crash-901-archive-final.log`.

At **2:23:44 PM Eastern**, Apple reported `Uploaded package is processing`, then
`Upload succeeded`; Xcode completed `EXPORT SUCCEEDED` with exit 0. Upload log:
`/tmp/gary-crash-901-upload.log`. This confirms Apple accepted the new binary;
processing completion and TestFlight availability are not independently verified.

Implementation commit **9a63c15c** is pushed to `origin/main`. Both GitHub CI jobs
passed: https://github.com/apreda/Gary2.0/actions/runs/33983806186.
Final production-parity output: `/tmp/gary-crash-901-production-final.log`.
The local Firebase plist is the intentional configuration exception.
Existing build 900 was already uploaded earlier today and does not contain this
repair. Do not describe 900 as the crash fix or upload it again.

The founder must install the replacement TestFlight build to update the phone.
App Store release timing and the existing review submission remain unchanged.
