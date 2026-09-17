# Operational collector midnight failure — September 17, 2026

Adam reported “FAILURE: Failure records unreadable” observed at 00:00:59 ET and authorized diagnosis and repair.

## Cause

The collector immediately reads `logs/scheduler/scheduler-<current Eastern date>.log`. The scheduler previously created that file only when it had a message to log; its independent 30-second heartbeat did not open the new day's file. At midnight, the September 17 file therefore did not exist even though scheduler PID 8541 was alive and its heartbeat was fresh. The collector's generic catch converted ENOENT into the unreadable-records incident and correctly withheld recovery of other incidents.

Collector reports were complete through 23:59:58 ET and incomplete beginning 00:00:59. The original scheduler eventually created the log at 00:08:23 when its normal line watcher wrote a message. This explains why the failure could disappear later without a repair; the preventative fix below removes the quiet-day gap.

## Repair

- The scheduler heartbeat opens each new Eastern day's log with a timestamped marker before publishing that day's heartbeat. It appends once per date/process and preserves prior log contents. Quiet periods no longer defer log creation until a job or line-watch message.
- If the collector runs before the first post-midnight heartbeat, it permits only a bounded first-minute handover with a fresh pre-midnight heartbeat and a missing scheduler file. Collection remains incomplete during this handover; it never infers recovery from an absent file.
- Missing files after the grace period, missing files after a new-day heartbeat, stale/missing heartbeats, access errors, data-file errors, invalid JSON, and oversized input remain reportable. Error details identify the input and bounded failure category without emailing raw paths/provider text.
- Logging failures do not stop the independent liveness heartbeat; the collector still detects the unreadable log. Failed opening attempts are retried.
- No database schema, model selection, pick generation policy, publication cadence, prices, or incident-retention policy changed.

## Validation and live activation

- 21 focused tests passed, including actual temporary log files across summer/winter Eastern midnight, UTC-midnight non-rotation, append preservation, failed-write retry, handover boundaries, safe error descriptions, and the isolated PostgreSQL incident/recovery contract.
- Full backend suite: 399 files / 4,349 tests passed. Existing Swift optional-interpolation warnings remain unrelated.
- All 242 edge tests passed; scheduler/collector syntax and diff checks passed.
- Verified scheduler PID 8541 had no active pick/prop descendants before restarting the existing `com.gary.scheduler` service with its installed configuration. New PID 99243 loaded the fix. The per-minute collector loads its script afresh and required no configuration change.
- Live dry run: `complete: true`, `observations: []`, current scheduler heartbeat.
- The normal scheduled collector reported complete at **00:09:03 ET**. Supabase `gary_ops.incidents` records `collector:read` resolved at `2026-09-17T04:09:03.192107Z`; a recovery event was enqueued. The two unresolved September 16 game incidents remained open, as required. Enqueue is not proof of email delivery.
- The broader `production-truth` check still cannot verify unrelated edge parity/support-queue state because the local Supabase CLI has no login. Its working-tree/unpushed warnings include concurrent SEO work and the private iOS plist. Live incident recovery was verified independently through the authenticated Supabase connector; no edge function changed in this repair.

Backend logs: `/tmp/gary-operational-midnight-tests.log`; edge logs: `/tmp/gary-operational-midnight-edge.log`. Local source is the canonical `/Users/adam.preda/Gary2.0` checkout. Preserve concurrent SEO work and the private iOS plist when committing or synchronizing this repair.
