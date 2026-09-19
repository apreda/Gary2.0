# Native design fixes — September 19, 2026

Source `fc04553ba261113b79f33e4f47b44da33f64c7ff`, version **2.26 (935)**.
The final Simulator Release build and signed device archive passed. Upload
succeeded at 4:16:47 PM ET. Apple confirmed processing at 4:19:14 PM ET and
TestFlight availability at 4:19:15 PM ET on September 19, 2026.

Adam supplied a broken NFL Pulse layout and authorized fixing clear design
flaws throughout the app. This follows the broader two-pass review in
`HANDOFF_2026-09-19_NATIVE_REVIEW_934.md`.

## Shipped source changes

- Solid bottom navigation prevents cards and numbers showing through the tabs.
  Inactive tabs have clearer contrast and side tabs retain 44-point targets.
- One shared heading per expanded Hub module, with a collapse button.
- Pulse retains complete numeric rows and now adapts its field grid to narrow
  widths/accessibility sizes; kickoff and away/home moneyline labels are clear.
- Hub tiles open and scroll to their reports; the floating section menu uses
  the current anchors, including direct Quick scan / Next Slate targets.
- Last Night shows full names, team and stat lines without fixed narrow cells.
  Its unused duplicate view was removed; active player/team routes remain.
- Home recap cards grow to fit complete text while staying aligned. No blank
  reverse: cards without extra stat lines open Billfold instead.
- Losing gold ticket text remains readable. Result colors and fracture remain.
- Pick-incoming explanations and footer actions have room to wrap.
- Settings suppresses the repeated email when it is also the display name.

No prediction, price, provider routing, injury classification, account or
publication logic changed. No new automation, AI reviewer or production gate.
Ten source files changed: 149 additions / 270 removals.

## Verification

Simulator visual checks covered Home, Winners games/props, MLB/NFL/NCAAF Hub,
NFL/NCAAF Picks, Billfold Gary/You/Board, profile and settings. The preceding
934 handoff covers the original two passes, including MLB Picks, Tomorrow and
Fantasy. NBA remains excluded.

Directly confirmed the reported Pulse layout, equal Hub tile dimensions,
tile-to-report scrolling, floating Quick scan navigation, full Last Night
names/stat lines, no-empty-recap routing, loss contrast and single Settings
email. Existing focused checks: 61 passed. No new test suite was added.
[Release CI](https://github.com/apreda/Gary2.0/actions/runs/35466537486) is green
for backend, Apple and web jobs.

Final archive: `/Volumes/KINGSTON/Gary-2.26-935-final-Sep19.xcarchive`.
The earlier candidate archive without `-final-` is not the delivery artifact.
Evidence and full report:
`/Users/adam.preda/Documents/ChatGPT/Gary/design-review-2026-09-19/`.
Start with `review.md`; delivery receipts belong in `apple-delivery-935.json`.

The production check read 58 stored picks and zero started MLB games missing a
pick. Canonical scheduler/Winners processes and edge timestamps match; no
unpushed source remains. The only local exceptions are the preexisting
`gary2.0/deno.lock`, private `ios/GaryApp/GoogleService-Info.plist`, and
`audit-evidence/nfl-70pct-snapshot-6f78c693/`; preserve them and never commit the
real plist.

No physical-iPhone scrolling benchmark is claimed. Simulator drag/wheel
automation remained unreliable; button/category navigation and scroll-to-top
were exercised. The earlier intermittent database restart/API issue remains
unresolved by this native-only change.
