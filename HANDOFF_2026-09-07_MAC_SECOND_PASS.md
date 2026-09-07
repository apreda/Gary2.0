# Second Mac reliability pass — September 7

Continue using `/Users/adam.preda/Gary2.0` on main. The Desktop compatibility
symlink and pinned Node 22.23.2 runtime remain as documented in
`HANDOFF_2026-09-07_MAC_REPAIR.md`. Push notifications remain out of scope.
Preserve the private, intentionally uncommitted GoogleService-Info.plist.

## Changes deployed on the Mac

The scheduler and live-score watchdogs previously bootstrapped a replacement
and then immediately ran `kickstart -k`, which could kill that new process.
Both now use `scripts/run-watchdog.js` and `lib/launchdRecovery.js`: unload once,
bootstrap up to three times with two-second backoff, and rely on RunAtLoad.
No second forced restart follows a successful bootstrap.

Before recovering a stale scheduler, inspect its descendants and detached
game/prop writers. Defer while those processes exist, including descendant
research/model work. Missing or failed process/job inspection also withholds
recovery. Only process IDs reach the log; process titles can contain secrets.
This is a conservative snapshot guard, not an atomic lock against a process
starting after inspection. The heartbeat/log thresholds remain five/eight
minutes. No pick policy, prompt, model, provider or schedule was changed.

The scheduler watchdog now preserves a failed recovery or morning-check exit
status even if the following host check succeeds. Host coverage reads use
SIGKILL at the existing 60-second timeout and reject malformed reports,
unexpected exits and terminated children. A complete failing report with exit
1 remains valid evidence; pregame pending picks remain a normal status.

Both watchdog plists were installed at 11:49 ET and completed with exit zero.
Scheduler PID 79083 and Winners PID 89023 were unchanged across installation.
All nine installed production plists match their versioned definitions.

## Verification and cleanup

- Root `npm run verify` passed on Node 22: 2,169 backend tests, 180 edge tests,
  349 web tests and generated-route/TypeScript checks (2,698 total tests).
- A disposable launchd job exercised real bootout/bootstrap recovery. It
  started exactly twice: initial launch and one replacement. A subsequent
  fresh check made no changes. The probe job and its files were removed.
- The 11:48 ET coverage read found 12/12 games on the board, 11/11 MLB and 1/1
  complete college game cards, no started games missing picks, and 18/18
  yesterday grades with recaps. The remaining pregame picks were outside their
  final retry windows. Internal free space was the only host warning.
- At 11:50 ET Postgres had 33 connections, no active query older than 60 seconds,
  no lock waiters, and 2,068 successful cron runs today with no recorded failures.
  Database size was 438,588,207 bytes. It had not restarted since September 6
  at 12:57:05 UTC.
- Removed five idle generated directories from old `/tmp` QA fixtures: four
  `.next` outputs and one temporary CI `node_modules`. Checked for open files
  before each removal. Free internal space increased by about 0.45 GiB to
  9.0 GiB. Fixture source, receipts, manifests, active Xcode output, archives,
  simulator state and private configuration remain intact.

The concurrent college abbreviation task completed and committed its work as
`4b0da38d`; see `HANDOFF_2026-09-07_COLLEGE_ABBREVIATIONS.md` for native delivery
status. This second infrastructure pass did not create another iOS archive.
The earlier Home scroll correction was uploaded as build 902. Xcode Cloud's
existing private release-configuration limitation remains; do not publish the
local Google plist to satisfy its guard.

Receipts: `/Users/adam.preda/Documents/ChatGPT/Gary/mac-repair-2026-09-07/round2/`.
Test log: `/tmp/gary-round2-verify.log`. Post-push production audit:
`/tmp/gary-round2-production-truth.log`. The Mac still hosts production without
an added cloud subscription; no full-machine backup destination is configured.
