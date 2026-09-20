# Codebase cleanup — completed September 20, 2026

Approved by Adam September 19, 2026. Work directly on main in verified batches.
This checklist is the completion contract, not a proposal for a rewrite.
Completed delivery and verification are recorded in
[the build 941 handoff](../../HANDOFF_2026-09-20_CODEBASE_CLEANUP_941.md).

## Delivery checklist

- [x] Map production entry points, data ownership, compatibility paths and frozen code.
- [x] Consolidate the sports provider around one implementation and shared transport.
- [x] Remove verified unused implementations; record protected exceptions explicitly.
- [x] Define and check date, identity, ticket and missing-data contracts at boundaries.
- [x] Extract runner scheduling, evidence and publication responsibilities into testable modules.
- [x] Extract native Hub/Home/Picks/Book components and domain models.
- [x] Replace fragile source-slicing tests where the extracted public API can be tested.
- [x] Refresh current operations docs, index history, clarify private configuration.
- [x] Add incremental mechanical lint/type/import checks to existing verification.
- [x] Complete full checks, native archive/TestFlight delivery, and production parity review (three preserved baseline local exceptions).

## Constraints

Preserve published tickets, provider prices, settlement behavior, caches,
cancellation, April NBA prompts and June MLB engine. Injury handling stays
untouched under the explicit lock in `gary2.0/CLAUDE.md`. No new opinion
reviewers, production test picks, model reruns or recurring repair automation.
Keep applied migrations and historical receipts. Favor cohesive ownership over
an arbitrary file-size limit; fixture catalogs and frozen engines are exceptions.

The production checkout is live. Create extracted dependencies before atomically
switching imports. Restart the scheduler only if its loaded implementation
changes. Each completed batch must be verified, committed, pushed and checked
against the running system. Native work is delivered after Apple confirms
TestFlight availability.

## Starting baseline

At `104dd36a`, active provider: 6,183 lines; unused alternate provider directory:
4,815 lines. Backend source: 316 JS/TS files / 110,294 lines; 25 over 1,000.
Runner scripts: 101 files / 19,588 lines; largest pick runner 2,716, scheduler
1,948, results runner 1,896. Native: 65 Swift files / 64,499 lines; largest
executable views Hub 4,785, Home 3,661, Book 3,618, Picks 3,089; models 2,979.
The 8,735-line mock fixture and 2,481-line team catalog are data, not priority
refactoring targets. Web: 303 TS/TSX files / 31,037 lines; none over 1,000.

Existing verification last passed 4,442 backend, 243 edge and 937 web tests,
plus web typecheck. Native 2.26 (939) is available in TestFlight. Local baseline
exceptions are `gary2.0/deno.lock`, private `ios/GaryApp/GoogleService-Info.plist`
and untracked `audit-evidence/nfl-70pct-snapshot-6f78c693/`; preserve them.

## Batch ledger

### 1 — Provider ownership (pushed; CI verified)

Audit confirms runtime consumers import `ballDontLieService.js`. The alternate
`ballDontLie/index.js` has only a test consumer; its internal injury modules
remain protected by the injury lock. Extract non-injury endpoint families and
shared transport without changing method behavior. Retain the public service
object so existing callers and mocks continue to work. Verify the complete
service method set, cache sharing, cancellation and provider behavior.

Evidence directory (local):
`/Users/adam.preda/Documents/ChatGPT/Gary/codebase-cleanup-2026-09-19/`.

Implemented: active facade 6,183 → 753 lines; 20 cohesive provider modules;
all 109 method bodies preserved (SHA-256 receipt in `evidence/provider-extraction.json`).
The legacy entry now aliases the same object; 1,149 lines of unused alternate
implementation were removed. Protected legacy injury sources and their core
remain unchanged and documented. Existing provider pagination, pacing and
shared-cache helpers remain canonical. Incremental lint and a legacy-import
boundary are in the existing Verify workflow. New tests cover composition,
cache sharing and a real Node ESM import.

Local verification passed: 4,466 backend tests in 416 files, 243 edge tests,
937 web tests and web typecheck. Current docs now have an ownership map and
an index of historical handoffs without breaking their existing paths.
Copied method bodies deliberately retain original whitespace, including in
locked injury methods; no formatter was applied to them.

### 2 — Scheduler boundaries (pushed; CI and running process verified)

Scheduler entry reduced from 1,948 to 1,563 lines. Provider discovery, clock
conversion and process-tree deadline ownership now have independent modules;
bounded iteration has a small shared utility. Date arithmetic reuses the
canonical calendar helper. The football refresh tests call the real exported
lookup; malformed MLB-clock tests now exercise behavior instead of checking
source strings. New tests cover DST/year rollover, worker concurrency, child
output, zero budgets, early exits and delayed descendant cleanup.

Full backend check: 4,480 tests / 418 files passed. Provider CI is green at
https://github.com/apreda/Gary2.0/actions/runs/35485711628.
The props era fingerprint now includes the extracted provider files: the era
changes mechanically with source ownership, while prompts and all provider
method bodies remain unchanged. June engine hash remains `9d3d2be7e50e`.

Scheduler CI passed at
https://github.com/apreda/Gary2.0/actions/runs/35486017778.
The scheduler was restarted into the canonical checkout (PID 46785); a clean
production audit confirmed the process, June hash, 15/15 MLB publications and
current edge deployment timestamps. It flagged only the three baseline local
exceptions. The props source fingerprint is now `f5843ba2d3f8`.

### 3 — Native ownership and compile verification (pushed; TestFlight delivered)

The domain model catalog now lives in 15 files under `Models/`. The original
`Models.swift` retains its locked injury types. Hub sections/sheets, Book API
and components, Picks caches/matching/grading, and Home boards/accounting/cards
now live under their feature directories. Inputs and callbacks keep extracted
Home board components independent of private coordinator state.

Main files: Models 2,979 → 33; Book 3,618 → 843; Hub 4,785 → 1,627;
Picks 3,089 → 1,824; Home 3,661 → 2,403. The separate 2,428-line HomeFrontPage
catalog is now cohesive components, at most 451 lines each. Eleven private
Home helpers/sections with no callers were removed. Coordination remains
substantial in Home/Picks/Hub; further work should target request/state ownership,
not scatter that state across extensions just to reduce a line count.

Three critical native contracts now compile entire shipping Swift modules:
prop game identity, per-sport/daily Home records and live ticket verdicts.
Older slicing harnesses use a transitional reader while preserving their
existing behavior checks. XcodeGen now includes each folder once, aligns the
GoogleSignIn specification to the already-resolved 9.2.0 dependency, and excludes
configuration templates/development folders from the application bundle.
The existing Verify workflow now compiles the whole Simulator app and checks
source membership. `ios/README.md` documents owners, configuration and delivery.

The full backend run exposed a pre-existing midnight fixture defect: a fixed
20-minute game lead crossed into tomorrow after 23:40 ET, while Winners correctly
accepts the current ET date. The isolated database fixture now stays within that
window (or waits through its final seconds); all 42 database cases passed.
Production selection functions and timestamps were not changed.

Simulator build 2.26 (940) passed; native card renders retain the small raised
college rankings. Full verification passed: 4,480 backend tests / 418 files, 243 edge tests,
937 web tests / 88 files, and web typecheck. Signed archive/upload passed.
Apple confirmed TestFlight 2.26 (940) at September 20, 00:00:07 ET.
Receipt: `HANDOFF_2026-09-20_CODEBASE_CLEANUP_940.md`.
All four CI jobs passed, including the full Simulator compile:
https://github.com/apreda/Gary2.0/actions/runs/35487817222.

### 4 — Results runner boundaries (pushed; CI and production location verified)

Results entry: 1,896 → 46 lines, with ten modules for transport, provider caches,
grading, storage, grounding, enrichment, game/prop settlement, coordination and
composition. Largest module: 400 lines. Cache/schema state belongs to one run;
the CLI retains credential loading and fatal-error reporting.

All 27 grading/provider/storage/enrichment functions retain identical JavaScript
tokens. Five search/coordinator functions only rename the retired grounding
helper or replace dynamic imports with explicit injectable loaders. Receipt:
`evidence/results-extraction.json`. No settlement rules or prompts changed.

Seven behavioral test suites now import the shipping modules directly instead
of slicing declarations into a VM or Function constructor. The assembled-engine
fixture uses real Supabase request construction against fixture HTTP, verifies
exact football identities, measured zero, write/readback, idempotent reruns and
DST date windows. Full backend verification passed 4,484 tests in 419 files;
incremental lint and a real Node ESM import passed. No production grading was
invoked for validation. Results jobs load fresh disk code at each invocation.
CI passed all four jobs:
https://github.com/apreda/Gary2.0/actions/runs/35488777248.
Production audit confirmed the canonical scheduler/Winners processes, unchanged
June/game and props hashes, current edge deployment timestamps, and only the
three baseline local exceptions.

### 5 — Pick discovery and an overnight date repair (pushed; CI verified)

Pick entry: 2,716 → 2,082 lines. Five modules now own discovery, date windows,
calendar policy delegation, exact-slate recovery and sportsbook formatting.
Five moved helper bodies are token-identical. Unreachable NCAAB bracket and
conference discovery was removed: the CLI already rejects that retired sport
before provider initialization. Unused flags/state/helpers and one overwritten
stat-label entry were removed. Protected injury blocks remain byte-identical.

The extraction exposed a real date inconsistency: explicit NCAAF `--date`
selection used the wall-calendar day while normal selection used the established
6 a.m. Eastern slate. Four midnight/DST/cutoff cases reproduced the failure.
Discovery, duplicate checks and Winners publication now share the league's
existing playing-date policy; all 12 new fixture cases pass. No generated or
published picks were rewritten. The June engine and NBA prompts are unchanged.

Receipts: `evidence/pick-discovery-extraction.json` and the local
`pick-discovery-before-fix.log` / `pick-discovery-fixed.log`.
Full backend verification passed 4,496 tests in 420 files, including the frozen
June-engine checks. Lint now covers the pick entry and extracted modules too;
the explicit import smoke check passed. An obsolete source-location assertion
was updated to the new owner after the first full suite identified it.
CI passed all four jobs:
https://github.com/apreda/Gary2.0/actions/runs/35489374389.
The production audit confirmed the canonical processes, unchanged engine hashes
and current edge timestamps; only the three baseline local exceptions remain.

### 6 — Pick card shaping and durable storage (pushed; CI verified)

Pick entry: 2,082 → 1,607 lines. `picks/stats.js` owns card stat flattening,
aliases and display filtering; `picks/storage.js` owns test isolation, pregame
write checks, weekly/daily routing and durable spool confirmation. Stat shaping
and the shared key map are token-identical. Storage changes only replace dynamic
imports with injectable loaders whose defaults point to the same modules.
Verified tape and protected injury blocks remain with the decision coordinator.
Receipt: `evidence/pick-shaping-extraction.json`.

Storage tests now import the shipping factory. New fixtures use a real temporary
outbox to verify spool-before-write, mixed weekly/daily failures, removal only
after confirmation, and kickoff checks on retries. Stat fixtures cover aliases,
unavailable/nested data, measured zero and the retained football display policy.
Full backend verification passed 4,500 tests in 421 files; lint passed.
CI passed all four jobs:
https://github.com/apreda/Gary2.0/actions/runs/35489753550.
Production location, engine hashes and edge timestamps passed; the three
documented local exceptions remain.

### 7 — Home request and state cleanup (pushed; CI and TestFlight verified)

Home's initial request wave shrank from 20 tasks to 10. Twenty-nine unused state
fields, obsolete free-pick/prop requests, edges, streaks, market pulse, duplicate
record calculations, and two unrendered components were removed. The rolling
refresh also stops requesting the retired free-prop slot. The active board uses
`HomeBoardRecord` for per-sport accounting; the recap remains a separate receipt.
The empty-page gate now recognizes an actual schedule before its picks arrive.

The asynchronous ownership fixture executes the shipping full/rolling/book
methods with suspended responses. Extending it to Winners badges and source
failures reproduced two existing bugs: late Winners responses overwrote newer
state, and cancelled rolling responses changed the failure banner before the
ownership guard. Both commits now happen under the existing captured request,
account and slate checks. The fixture also asserts retired requests are absent.
It now runs explicitly in the macOS CI job.

Focused native verification passed 64 tests, plus the two affected follow-up
suites. The full Simulator build 941 passed and native card renders retain
small raised rankings. One full run hit a Hub Swift compile timeout while the
Simulator build was competing for resources; that unchanged suite passed alone.
An obsolete HR free-slot source assertion was updated to the current Home
contract. The complete backend suite passed 4,500 tests in 421 files without
the competing build. HomeView is 1,925 lines, down from 2,403 before this batch.
CI passed all four jobs:
https://github.com/apreda/Gary2.0/actions/runs/35490209248.
TestFlight 2.26 (941) became available September 20 at 00:59:14 ET, two seconds
before the processing confirmation. Upload completed at 00:56:44 ET.
Availability receipt: `1a0bd2ec6eafde90`; processing: `1a0bd2ed15f7da63`.
Archive: `/Volumes/KINGSTON/Gary-2.26-941-home-cleanup.xcarchive`.

### 8 — Checked boundary contracts (pushed; CI follow-up in batch 9)

Four shipping JavaScript boundaries are checked under strict TypeScript: pick
calendar policy, BDL response decoding, market values and ticket identity.
`contracts/README.md` explains their limits. Negative compile examples prove
dates cannot become kickoff instants, ticket fields are readonly, provider IDs
cannot be booleans, rows still need schema validation, and missing numbers need
handling. This runs in root verification and backend CI. The unused historical
`src/types/picks.ts` was removed; it had no consumers and described a different
payload. No broad JavaScript-to-TypeScript migration was introduced.

Ticket identity helpers retain identical JavaScript tokens after moved helper
names are normalized. Existing exports remain available from `winnersBook.js`.
Date/parser/market changes are type annotations and equivalent property/null/key
checks. Original ticket/price, missing-data and historical compatibility rules
remain intact. Receipt: `evidence/boundary-contracts.json`.

Shared JSON examples cover midnight, both DST transitions, 6 a.m., year rollover,
leap day, strict native provider IDs, measured zero and malformed envelopes.
Backend/web tests import real modules; native tests compile the complete
`ProviderIdentity.swift` file. Focused checks passed 83 backend tests and 13 web
date cases; both type checks passed. Full root verification passed: 4,529
backend tests in 422 files, 243 edge tests, 950 web tests in 89 files, lint
and both backend/web type checks.
CI passed backend, native compilation and Apple framework tests. Its isolated
web-build check found that the new test's static JSON import required repository
data outside a standalone web root. Batch 9 loads that fixture only when Vitest
executes, preserving shared cases without adding a web build dependency.

### 9 — Sport adapters and confirmed publication (pushed; CI and production verified)

Pick entry: 1,607 → 1,253 lines. The June engine adapter, college prop recovery
and confirmed publication now have explicit factories. Their largest module is
175 lines. Six moved functions and the publication block retain identical tokens
after normalizing dependency loader paths. The frozen June tree, April prompts,
original ticket fields and protected injury blocks remain unchanged. Receipt:
`evidence/pick-lanes-extraction.json`.

MLB provenance/cancellation/cascade tests now import the actual adapter instead
of running a sliced function in a VM. Eleven new behavior cases cover college
overnight recovery, no rerun after kickoff or an existing prop, test-table
isolation, confirmed-ticket ordering, original evidence/briefing, failed readback,
failed publication receipts and bilateral paths. A source-location assertion for
the briefing moved to the actual publication test. Focused checks passed.
Final root verification passed 4,540 backend tests in 423 files, 243 edge tests,
950 web tests in 89 files, lint and both type checks. The production sitemap
build/outage/recovery check passed after fixing the test-only import boundary.
The fixture web smoke check passed from an isolated checkout: the production
checkout correctly refuses fixture mode while its real `.env.local` is present.
No credentials were removed or changed. Documentation links and all 147 native
compile-source memberships passed their mechanical checks.

Final implementation commit: `7f4808ff26c2aa90b67f8a20df7c8e0dbeb92733`.
All four integration CI jobs passed, including the independent web build,
backend/edge checks, Apple framework tests and full Simulator compile:
https://github.com/apreda/Gary2.0/actions/runs/35491317787.
The production audit confirms the canonical scheduler and Winners processes,
unchanged June/game and props hashes, current edge deployment timestamps and
no unpushed commits. It exits nonzero solely for the three baseline local
exceptions preserved throughout this goal. Today's picks were still pending,
so no new stored-era comparison was possible. TestFlight 941 is available.
