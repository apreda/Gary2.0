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

## Expanded QA and replacement submission — 3:13 PM update

This section supersedes the earlier upload-only delivery status. Adam explicitly
authorized withdrawing the affected submission, testing beyond the crash, fixing
findings and resubmitting. The restored App Store Connect session confirmed that
the queued version was **2.25 (896)**, submission
`811f54df-7cff-458f-8b66-bc64105a9b99`. Cancel Submission completed and the version
became Developer Rejected before replacement.
The final App Review history confirms that old submission is **Removed**.

Apple accepted **2.25 (901)** for review on **September 5, 2026 at 3:13 PM Eastern**.
The receipt shows **Waiting for Review**, submission
`df3e7f2c-8447-4cfb-988d-041905b3a220`:
https://appstoreconnect.apple.com/apps/6751238914/distribution/reviewsubmissions/details/df3e7f2c-8447-4cfb-988d-041905b3a220.
This is a submission receipt, not approval. Live release configuration was
**automatic after approval**, with immediate updates, and was preserved; earlier
documents that assumed manual release were not used as evidence. Availability
is United States and Canada. The Apple Silicon Mac availability setting was
preserved; Vision Pro distribution is off.

TestFlight marks binary `c50016b0-f316-4920-b376-b52a067089e2` Validated, with symbols
and no non-exempt encryption. Its existing internal Beta group contains Adam;
Apple reports **Installed 2.25 (901)** on his iPhone 17 Pro / iOS 26.6.1. Updated
What to Test instructions cover the repair and broader flows. The latest visible
crash feedback remains the September 5 2:06 PM **899** report. This is not proof
that future crash telemetry will remain empty.

The complete `npm run verify` passed **2,482 tests**: 1,981 backend, 168 edge-helper
and 333 web tests, plus Next/TypeScript checks. The isolated real-Next fixture smoke
passed Home, Picks, Results, Leaderboard, game details, archives, sitemaps, feed and
results export. The native Swift privacy/storefront executable passed. Logs:
`/tmp/gary-review-full-verification.log`, `/tmp/gary-review-web-smoke.log`.

The previously intermittent results-reader fixture had shared mutable counters
and cache state accessed by async-let requests. Its fixture types are now
MainActor-isolated; the actual production cache was already an actor. Both focused
Swift execution regressions passed, followed by **96/96 native checks in 16 files**.
No assertions were removed. Logs: `/tmp/gary-review-native-regressions.log`,
`/tmp/gary-review-native-suite-final.log`. Commit **551b8494** and its GitHub CI
passed: https://github.com/apreda/Gary2.0/actions/runs/33986244701.

Interactive native QA used the build-901 iPhone 17 simulator on iOS 26.4:

- Home Today/Tomorrow; Winners game and prop reveal/analysis; Hub player detail,
  recent statistics and expanded statistics; Billfold totals and candle chart;
  public leaderboard and truthful empty state.
- Email sign-in, private profile, avatar/sports/unit preferences, founding access,
  cold-launch session restoration, analytics default-off and on/off persistence.
- Manual entry creation, correction from $50/+125 to $25/+150, grading as won,
  correct +$37.50 net, native CSV share sheet and actual CSV data, and deletion.
  CSV retained 1 unit / +1.5 net units, with the $25 display conversion correct.
- Native Settings account deletion reached Account Deleted, cleared identity,
  unit preferences and optional analytics, and returned to signed-out UI.
- The dedicated App Review credentials signed in successfully and showed real
  founding access. The session was signed out after verification; the reviewer
  account was not deleted, and its profile/book were not changed.

Live service checks used two explicitly disposable accounts. Password rejection,
session refresh, profile persistence, public/private separation, cross-account
read/write isolation, invalid odds rejection, manual CRUD and server-controlled
win/loss/push/reopen calculations passed. Sign-out revoked the tested refresh
token. The normal deletion endpoint and native deletion path both passed; admin
readback confirmed both accounts and all their bets/profiles/preferences removed.
No live purchase or customer subscription was created. The temporary preview
worktree and credential files were removed. Account log:
`/tmp/gary-review-account-qa.log`.

The App Store privacy label was still Data Not Collected and the old review notes
omitted the tracking and future subscription features. Published disclosures now
cover the application's and SDKs' 13 declared potential data types, with no
advertising tracking; diagnostics are unlinked. The current release description,
What's New, review notes, and privacy rationale are in
`GaryMarketing/APP_REVIEW_2_25_901.md`. Existing Gambling=Yes was retained; public
profiles, simulated tracking and leaderboard contests are declared. The resulting
age is 18+. No data collection behavior changed during this metadata update.

The signed archive still contains 21 privacy manifests. Executable SHA-256:
`f71cb609efb7f9cf99659c6ad04b83d648e42fd0f1a88a53d408977838d567e7`.
Privacy, Terms, support and marketing URLs returned HTTP 200. This pass did not
interactively retest Apple/Google provider authentication, APNs, paid checkout,
or Apple Silicon Mac behavior on physical hardware. Those limits are separate
from the native simulator, live-account, archive and automated checks above.

Production audit `/tmp/gary-review-production-check.log` verified the canonical
scheduler and Winners worker, deployed edge timestamps and no unpushed changes.
Its sole flag is the intentional uncommitted real Firebase plist. Preserve it.
