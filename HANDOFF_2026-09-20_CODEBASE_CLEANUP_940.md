# Codebase cleanup — native batch, TestFlight 2.26 (940)

The explicit cleanup goal remains active. This is a delivered batch, not a
claim that the whole plan is complete. The completion checklist and batch
ledger are in `docs/maintenance/CLEANUP.md`.

Source commit `e27def794896b702bf0bd82415c132995e62f056` is pushed to main.
The earlier provider and scheduler batches are `0ced192e` and `6bf5cc18`.

## Native ownership

Domain models live under `ios/GaryApp/Models/`; original injury types remain
byte-identical in `Models.swift`. Book API/components, Hub sections/sheets,
Picks matching/grading/caches and Home boards/accounting/cards have feature
directories. Home callbacks keep state changes in the coordinator.

| File | Before | After |
| --- | ---: | ---: |
| Models.swift | 2,979 | 33 |
| UserBookView.swift | 3,618 | 843 |
| HubView.swift | 4,785 | 1,627 |
| PicksTab.swift | 3,089 | 1,824 |
| HomeView.swift | 3,661 | 2,403 |
| HomeFrontPage.swift | 2,428 | Split into components, maximum 451 |

Eleven private Home helpers/sections had no callers and were removed. Home,
Picks and Hub coordination still warrant further focused work. Fixture/team
catalogs and frozen decision engines remain deliberate exceptions.

The XcodeGen spec now gives each source folder one group, excludes development
files and configuration templates from the app bundle, and names the same
GoogleSignIn 9.2.0 dependency already present in the resolved lockfile. There
was no dependency upgrade. `ios/README.md` documents native ownership and the
private configuration rules.

## Verification and delivery

Full verification passed: 4,480 backend tests in 418 files, 243 edge tests,
937 web tests in 88 files, lint and web typecheck. Simulator build 940, signed
release archive and upload passed. Fifteen actual native renders were saved;
the college rank and headline/card samples were inspected.

Three native behavior contracts compile complete shipping files rather than
extracting declaration strings: prop game identity, Home sport records/order,
and live verdicts. Older harnesses have transitional readers. CI now checks
all 149 Swift source memberships and compiles the complete Simulator app.

The first full suite found a pre-existing test date defect after 23:40 ET:
the isolated Winners fixture's 20-minute lead landed on tomorrow's calendar
date. The fixture now remains inside the current ET window or waits through
its final seconds. Production selection rules, SQL and clocks did not change.
All 42 isolated judgment-ledger database cases then passed, as did the full suite.

Upload succeeded September 19 at 23:57:22 ET. Apple confirmed TestFlight
availability September 20 at 00:00:07 ET, and processing at 00:00:09 ET.
No public App Store submission was made.

- TestFlight receipt: `1a0bcf8aa3d6782c`.
- Processing receipt: `1a0bcf8afe5eaa48`.
- Archive: `/Volumes/KINGSTON/Gary-2.26-940-cleanup.xcarchive`.
- CI passed all four jobs, including the full Simulator compile:
  https://github.com/apreda/Gary2.0/actions/runs/35487817222.
- Evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/codebase-cleanup-2026-09-19/`.

The production audit confirms scheduler PID 46785 in the canonical checkout,
Winners PID 66729, June/game hash `9d3d2be7e50e`, props hash `f5843ba2d3f8`,
15/15 September 19 MLB games published and current edge deployment timestamps.
Its exit status still flags the three preserved local exceptions:
`gary2.0/deno.lock`, private `ios/GaryApp/GoogleService-Info.plist`, and
`audit-evidence/nfl-70pct-snapshot-6f78c693/`.

## Drive interruption

KINGSTON disconnected during native compilation. macOS repaired its filesystem
and mounted it at 23:30 ET; the build continued on internal storage. The signed
archive/export used the reconnected drive successfully. It had only 9 GB free
before the archive. No user files were deleted or drive reformat attempted.
This establishes current access, not a hardware-health diagnosis.

## Remaining goal work

Extract the results and pick runners into coordinator/provider/storage/evidence
modules; establish checked boundary contracts and shared client fixtures;
continue replacing fragile tests and removing verified dead implementations;
finish the native state-ownership work where justified; then run the completion
audit and all required delivery checks. Preserve the June/NBA and injury locks.
