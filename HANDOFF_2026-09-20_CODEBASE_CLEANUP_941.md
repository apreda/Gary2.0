# Codebase cleanup and TestFlight 2.26 (941)

The implementation and local verification phases of Adam's September 19 cleanup
plan are complete. Final integration CI and production parity are being checked.
The checklist and per-batch receipts are in `docs/maintenance/CLEANUP.md`.
This supersedes the remaining-work section of the build 940 handoff.

## Ownership changes

| Entry or feature | Starting lines | Current lines |
| --- | ---: | ---: |
| BDL provider facade | 6,183 | 753 |
| Results executable | 1,896 | 46 |
| Pick executable | 2,716 | 1,253 |
| Scheduler | 1,948 | 1,563 |
| Native Models.swift | 2,979 | 33 protected injury types |
| Native HubView | 4,785 | 1,627 |
| Native HomeView | 3,661 | 1,925 |
| Native UserBookView | 3,618 | 843 |
| Native PicksTab | 3,089 | 1,824 |
| Native HomeFrontPage catalog | 2,428 | Split into feature components |

The provider has one facade and shared transport/cache ownership, with endpoint
families in `bdl/`. The retired duplicate entry aliases that implementation;
1,149 lines of unused alternate implementation were removed. Protected legacy
injury modules remain inactive and unchanged.

Results now separates provider caching, grading, storage, enrichment and run
coordination. Picks separates date/discovery, market/stat shaping, storage,
June adaptation, college prop recovery and confirmed-ticket publication.
Factories let tests exercise these shipping paths without starting live runners.
Scheduler discovery, clock and process-tree deadlines have focused modules.

Native feature/domain folders replace the original monolithic catalogs. Home
also drops 29 unused state fields and reduces its initial request wave from 20
tasks to 10. Live board accounting uses the selected sport and date; the daily
popup retains its separate prior-day receipt. Whole-app Simulator compilation
and source-membership checks now run in CI. The request-ownership cases also
run explicitly on macOS.

## Defects found during cleanup

- Explicit NCAAF date selection used the calendar day while ordinary discovery
  used the established 6 a.m. Eastern playing date. Discovery, duplicate lookup
  and publication now delegate to the same policy. Midnight/DST cases reproduced
  the original failure and pass after repair.
- Home's delayed Winners response could change badges after a newer load, and a
  cancelled rolling response could change the error banner before its guard.
  Both writes now respect the existing request/account/slate owner. Controlled
  stale-response fixtures reproduced both failures before repair.
- A Winners database test's 20-minute lead crossed into tomorrow after 23:40 ET.
  The isolated fixture now remains inside its date or waits through the final
  seconds. Production SQL and selection policy were unchanged.
- CI's isolated web build exposed a static test-data import outside its root.
  The shared examples now load when Vitest executes; the independent production
  build and database-outage/sitemap recovery checks pass.

## Contracts and verification

Four real JavaScript boundaries now have strict TypeScript checks for dates,
tickets, market values and provider envelopes. Invalid-call compile examples
exercise date/instant separation, readonly ticket fields, ID types, missing
numbers and unvalidated rows. `contracts/README.md` explains the runtime and
historical-compatibility limits. The old unused type catalog was removed.
This establishes checked boundaries without claiming full JavaScript coverage.

Shared backend/web/native examples cover midnight, DST, year rollover, leap day,
provider identity, measured zero and malformed envelopes. Behavioral tests
replace VM/source slicing wherever the extracted public APIs now exist.

Final local verification passed 4,540 backend tests in 423 files, 243 edge tests,
950 web tests in 89 files, lint and backend/web type checks. The independent web
production-build check covers database downtime, recovery and preservation of
last-good sitemaps. The full native Simulator build passed; actual card renders
retain the small raised college rankings and existing dark research containers.
Token receipts for moved code and the size inventory are in maintenance evidence.

## Native delivery

Build 2.26 (941) source: `de6bfbaa2dcf537d83c180ef63ebef5c7c2b2c15`.
The signed archive and upload succeeded September 20; upload completed at
00:56:44 ET. Apple confirmed availability at 00:59:14 ET and processing two
seconds later. No public App Store submission was made.

- [TestFlight](https://testflight.apple.com/v1/app/6751238914)
- Availability receipt: `1a0bd2ec6eafde90`.
- Processing receipt: `1a0bd2ed15f7da63`.
- Archive: `/Volumes/KINGSTON/Gary-2.26-941-home-cleanup.xcarchive`.
- Native CI passed: https://github.com/apreda/Gary2.0/actions/runs/35490209248.
- Local evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/codebase-cleanup-2026-09-19/`.

KINGSTON reconnected and supported the archive/upload. Compilation used internal
storage after the interruption. No files were deleted or the drive reformatted.

## Preserved boundaries and ongoing maintenance

The frozen June tree, NBA prompt sources, original tickets/prices and protected
injury handling remain unchanged. Engine hashes remain June/game `9d3d2be7e50e`
and props `f5843ba2d3f8`. Active runners were restarted after shared backend
boundary changes, in the canonical `/Users/adam.preda/Gary2.0/gary2.0` checkout.
No cloud handler or migration changed in these final extraction batches.

The codebase still has large cohesive feature coordinators, provider/stat
catalogs and protected decision surfaces. Their size alone is not a reason to
scatter request state or rewrite approved decisions. Future feature work should
extend existing module ownership and checked boundaries, add behavior fixtures
at changed seams, and replace remaining legacy test slicing when its real API
becomes independently testable. Full type coverage and removal of protected
injury code are not claims of this cleanup.

Three pre-existing local exceptions remain intentionally unstaged:
`gary2.0/deno.lock`, private `ios/GaryApp/GoogleService-Info.plist`, and
`audit-evidence/nfl-70pct-snapshot-6f78c693/`. They cause the production audit's
working-tree flag even when process/deployment checks pass. Edge deployment
checks compare timestamps, not deployed source bytes.
