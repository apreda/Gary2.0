# Codebase cleanup — active goal

Approved by Adam September 19, 2026. Work directly on main in verified batches.
This checklist is the completion contract, not a proposal for a rewrite.

## Delivery checklist

- [x] Map production entry points, data ownership, compatibility paths and frozen code.
- [x] Consolidate the sports provider around one implementation and shared transport.
- [ ] Remove verified unused implementations; record protected exceptions explicitly.
- [ ] Define and check date, identity, ticket and missing-data contracts at boundaries.
- [ ] Extract runner scheduling, evidence and publication responsibilities into testable modules.
- [ ] Extract native Hub/Home/Picks/Book components and domain models.
- [ ] Replace fragile source-slicing tests where the extracted public API can be tested.
- [ ] Refresh current operations docs, index history, clarify private configuration.
- [ ] Add incremental mechanical lint/type/import checks to existing verification.
- [ ] Complete full checks, native archive/TestFlight delivery, and production parity.

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

### 2 — Scheduler boundaries (verified; delivery in progress)

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

The first production audit ran alongside a shell search mentioning the scheduler
path, which its process-name scan misidentified as a second scheduler. The
reported extra PID was already gone; `ps` confirmed one real scheduler (9168)
and only its caffeinate child. Repeat the audit without that concurrent search.
