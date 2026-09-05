# September 5, 2026 — Supabase I/O and college quarterback repair

Production checkout: `/Users/adam.preda/Desktop/Gary2.0`, branch `main`.
Code commit `15bb8b27` is pushed to `origin/main`.
Project: Gary, `xuttubsfgdcjfgmskcol`.

## Requested fixes and deployed changes

The NCAAF quarterback fallback began with "His" even when its own metadata
contained the quarterback's full name. The shared NFL/NCAAF native layout
already receives `meta.qb`, side, and structured passing figures. The fallback
now begins with the verified name and school for both current and prior season
lines. Passing figures, season labels, transfer context, and generated reads
are preserved.

The exact screenshot game is Marshall at Penn State, BDL game 457623. Its
quarterbacks are Carlos Del Rio-Wilson and Rocco Becht. The scoped SQL repair
updated 57 current NCAAF quarterback rows successfully before the incident below:
49 anonymous visible details and eight computed fallbacks whose visible detail
already contained a generated read. All 57 before/after receipt entries were
checked for matching QB/game identity and unchanged numeric detail values.
It reads identity from the same row and school from the exact game's slate.
It leaves past dates, NFL, other categories, and existing generated reads alone.
No native code was changed in this task.

Operational cron history occupied 237 MB of the approximately 400 MB database.
It retained about 205,000 execution logs dating back to June. The marketing
readiness snapshot sorted this history by unindexed `start_time` separately
for each monitored job. The indexed, monotonic `runid` now selects the latest
execution. A live EXPLAIN comparison for one lookup returned the same job and
reduced execution from 1,159 ms / 25,630 shared read blocks to 2.57 ms / zero
shared read blocks / 11 buffer hits. This measured one query, not total daily I/O.

Migration `20260905144249_reduce_cron_history_io.sql` was applied in production.
It schedules `cleanup-completed-cron-history` at 03:37 UTC daily, retaining
30 days of completed operational history. Each run examines at most the oldest
10,000 primary-key entries and deletes only terminal rows older than 30 days.
Running, undated, and recent rows remain. The bounded daily capacity exceeds
the observed approximately 2,700 rows/day.

Manual bounded batches removed 124,654 expired completed cron logs. The final
batch returned zero at 14:50:13 UTC. No pick, result, user, account, or athlete
history was deleted. DELETE does not promise to shrink allocated database files;
ordinary vacuum makes dead-row space reusable. No VACUUM FULL, TRUNCATE, or
extension-table ownership changes were used.

## Availability incident and recovery

After the manual cleanup, app REST reads, SQL sessions, and project metrics
stopped responding. The cause is not established; resource pressure from the
cleanup/checkpoint may have contributed on the already I/O-constrained host.
The 14:50:27 checkpoint wrote 9,289 buffers and finished after 319 seconds.
Logs then showed widespread cron startup timeouts. Repeated small SQL probes,
normal app reads, and independent morning-health requests timed out.

The top-level project API continued to say `ACTIVE_HEALTHY`, but the detailed
service-health API at 15:11:21 UTC correctly reported database, postgres-user
database, REST, and Auth unhealthy. Pooler alone was healthy. Project metrics
returned HTTP 500. Browser sessions were signed out and were not health evidence.

The existing Supabase CLI profile credential was used only with the official
Supabase Management API. One POST to `/v1/projects/{ref}/restart` was accepted
with HTTP 200 at 15:11:39 UTC. No pause/restore, plan upgrade, or credential
change was performed. At 15:12:35 the project reported `RESTARTING`.

Only `com.gary2.daily-insights` was temporarily unloaded to reduce work during
the incident. The journal establishes that its 11 AM ET run started at
15:00:05 UTC and was cancelled at 15:00:40 during the board stage. Its plist
is unchanged. Scheduler PID 23440 and Winners PID 11032 were not restarted.

Recovery completed: Postgres started at 15:16:14 UTC. At 15:17:03 the app API
returned HTTP 200 for both exact-game QB rows with the names and passing
metadata intact. SQL succeeded at 15:17:05. All five detailed core services
passed at 15:17:36. The content launch agent was bootstrapped and kickstarted;
the delayed run began at 15:18:46, Node PID 89077.

Independent morning-health verification at 15:19:31 passed all 11 app-data
reads within one second. It found a fresh 45/45-game board, MLB cards for all
15 games, complete NCAAF cards for all 30 games, and nine NCAAF picks with no
started games missing a pick. The production Today page loaded normally.

The direct documented `/customer/v1/privileged/metrics` endpoint returned
HTTP 200, `pg_up=1`, and no in-flight I/O on either disk at the snapshot.
The Management API metrics proxy still returned 500; this did not indicate
an unhealthy exporter or failed app reads. Snapshot memory was approximately
407 MiB total and 160 MiB available, with about 7.0 GiB free on `/data`.
The original warning concerns I/O consumption, not an exhausted storage volume.
Daily budget improvement cannot be proved from one post-restart snapshot.

The retention schedule was re-verified active. A bounded 10,000-row check
found 52 newly aged-out terminal entries after the initial cleanup; these
are left to the scheduled job. Allocated cron history remained 237 MB, as
expected after DELETE. Further manual bulk cleanup was not performed.

## Verification and local evidence

- Full `npm run verify` passed: 1,959 backend tests, 168 edge-helper tests,
  313 web tests, and Next/TypeScript checks.
- Focused suites passed 24 tests, including three isolated PostgreSQL cases
  for retention boundaries, batch limits, repair preservation, and idempotency.
- `git diff --check` passed.
- Production truth read the correct scheduler folder and nine stored picks;
  all 20 edge deployments passed timestamp parity and there were no unpushed
  code commits. The retained private Firebase plist is the known exception.
- Performance advisors were reviewed after recovery: three unindexed foreign
  keys, 22 RLS initialization warnings, 56 unused indexes, 62 overlapping-policy
  warnings, two duplicate-index groups, one HTTP-response bloat notice, and one
  Auth connection-allocation notice. These pre-existing broad recommendations
  were not used as a reason to rewrite access policies or run locking maintenance
  during incident recovery. See [Supabase database linter documentation](https://supabase.com/docs/guides/database/database-linter).
- `/tmp/gary-qb-before-repair-2026-09-05.json`: original public QB rows.
- `/tmp/gary-qb-repair-result-2026-09-05.json`: successful 57-row RETURNING receipt.
- `/tmp/gary-cron-history-cleanup-receipt.json`: per-batch deletion receipts.
- `/tmp/gary-supabase-pre-restart-health.json`: detailed service failures.
- `/tmp/gary-supabase-restart-receipt.json`: accepted restart, exact timestamps.
- `/tmp/gary-supabase-post-restart-health.json`: latest recovery health snapshot.
- `/tmp/gary-qb-live-verification.json`: recovered app response and passing metadata.
- `/tmp/gary-supabase-recovered-metrics.txt`: direct Prometheus snapshot.
- `/tmp/gary-launch-health-after-restart-20260905.log`: independent app health.
- `/tmp/gary-qb-io-production-truth.log`: production deployment verification.
- `/tmp/gary-qb-io-verify.log`: full verification output.

The real local `ios/GaryApp/GoogleService-Info.plist` remains uncommitted under
the repository's explicit production configuration exception.
