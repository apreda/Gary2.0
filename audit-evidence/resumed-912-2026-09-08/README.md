# Resumed native acceptance — September 8, 2026

At 11:49–11:58 UTC, the Mac was accessible through Computer Use. The running iPhone 17 / iOS 26.4 simulator still had build 909 installed. Installed and launched the existing optimized 912 simulator product from `/Volumes/KINGSTON/gary-mac-repair-release-dd/Build/Products/Release-iphonesimulator/GaryApp.app`. No rebuild, archive or upload was performed. Installed version 2.25 (912) and executable equality with that Release product are recorded in [receipt.json](receipt.json).

## Observed on build 912

- **NFL Hub:** the next-slate card renders under NFL with New England at Seattle, September 9 at 8:20 PM ET. Schedule details expand and collapse. The simulator was left on this screen. [Card](nfl-next-slate.png), [expanded details](nfl-schedule-details.png), [accessibility text](nfl-next-slate.txt).
- **MLB starter-record cards:** The Arms expands to 19 entries including the restored record-card type. The Guardians / Tanner Bibee record opens its full explanation and the associated Cleveland team sheet. [Expanded record](mlb-starter-record-expanded.png), [team detail](mlb-starter-team-detail.png).
- **Pitcher stats:** opening Foster Griffin from the Cleveland team sheet and expanding More Stats visibly shows `OPP AVG VS XBA`; Less collapses it again. This closes the earlier visual check of that label and expansion on this sample. [Expanded stats](pitcher-more-stats.png).
- **Next-opponent context:** expanded Streak watch visibly labels upcoming opponents `NEXT GAME`, including Cal Raleigh versus the Rangers. This establishes current-row label rendering; it does not recreate the earlier Schwarber historical example or verify every Team streaks surface. [Visible labels](mlb-streak-context.png), [accessibility text](mlb-next-game-labels.txt).

## Interrupted source work reconciled

Independent read-only inspection confirmed that the permanent optimized regression is the committed 108-line file from `291f735d`, without an uncommitted follow-up. Its shipping-code extraction and 200-group fixture remain unchanged. Earlier raw evidence records 200/200 failures for the old optimized inline tuple and zero for the corrected sequential form; both unoptimized forms pass. The permanent test's passing run and failing negative control remain in [the original verification receipt](../responsiveness-2026-09-08/verification.txt).

The scalar/array Codable repair is committed as `a7cd5702`; the retained real 264-row MLB sample includes exactly 14 scalar-start rows, and its dated decode receipt records 250/264 improving to 264/264. That repair, routing fix `c6cf4c64`, and test `291f735d` are ancestors of uploaded 912 source `7745aada` and origin/main. Current relevant source matches the 912 source receipt and final test snapshot. No unchanged source tests were rerun in this continuation.

## Still open

The simulator's accessibility actions opened and collapsed the sampled controls. A scroll attempt on expanded Hub content and a drag on the player sheet produced no visible movement through Computer Use; reliable long-reading gestures and VoiceOver remain unverified. These observations do not establish an app touch defect.

Private-preference saves, historical NFL score display, the exact earlier Team streaks ambiguity, physical-device testing, authentication/recovery, live push, billing and disposable account CRUD/deletion were not accepted in this pass. Existing receipts and remaining boundaries still apply.

Chrome tab discovery found the existing App Store Connect TestFlight tab still pointing to a login URL with `authResult=FAILED`. Claim/read attempts timed out, including the documented alternate DOM read. No fresh dashboard state, review selection, tester membership or approval was established. No browser sign-in or external write occurred. The prior official-email processing/TestFlight receipt remains the latest verified Apple evidence.

Only evidence and handoff documentation changed. The private Firebase plist and application source were preserved. No production grading, pick generation, customer notification, new release submission or launch approval occurred.
