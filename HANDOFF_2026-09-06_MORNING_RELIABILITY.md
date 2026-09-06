# Morning publication reliability — September 6, 2026

The founder requested a fix for the recurring 7 AM stale BOARD/INSIGHTS alert.
Application repairs **2e4f6250**, **661b8599**, and **24968d30** are pushed to
`origin/main` in the canonical production checkout. The underlying Supabase stall is still an
open incident; a recovered database is not evidence that recurrence is fixed.

## Three independent failures

1. At 05:03:02 ET the still-running scheduler failed both board publications
   with `The requested module '../../marketTruth.js' does not provide an export
   named 'isAmericanPrice'`. The export exists on disk. This was a stale ESM
   dependency graph in the daemon started September 5 at 09:00, after subsequent
   source updates. A real subprocess regression test reproduces a cached old
   export and confirms a fresh snapshot process succeeds on the same new files.
2. Supabase REST returned PGRST002/HTTP 503 during the overnight and 06:00
   content jobs. The old runner continued expensive provider work against
   unavailable storage and then waited until the 07:15 calendar run to recover.
   The separate launch review restarted Supabase at 06:14:57; Postgres started
   at 06:19:30. That earlier task also restored `daily_slate`. This task did not
   restart Supabase or change its plan/configuration.
3. The normal 07:15 run restored BOARD at 07:15:51 and completed the content
   stages at 07:25:48. Health still failed because the overnight combined
   football-card stage had failed, even though its separate daytime replacements
   and current output were healthy. The watchdog treated a completed failed
   check as final and never checked the recovery.

## Deployed changes

- Scheduler slate and board publications each use a fresh process with an
  eight-minute cap. Pick generation and the configured Astra/Sol models remain
  unchanged. Signal shutdown cancels and reaps the detached snapshot before
  exiting the scheduler. A real SIGTERM test caught and then verified this
  cleanup. Scheduling code changes still require a daemon restart.
- The existing daily-content owner probes the actual REST data path before
  stages. Transient outages share a 45-minute wait budget per run. It resumes
  on verified recovery, retries a failed stage once only after an observed
  database outage, and never replays successful stages. Permanent auth/config
  failures remain failures. No database restart loop was introduced.
- The scheduled overnight card phase has an overall 05:45 ET cutoff covering
  work, waits, and retries. This releases its LaunchAgent before the 06:00 daily
  publication. Explicit dated card backfills retain their per-stage caps.
- The normal content pipeline repairs `daily_slate` before BOARD and insights.
- Failed historical combined card attempts retain their evidence and acquire
  `recovered_by` only after later equivalent stages succeed and current card
  coverage verifies. Data-read errors and incomplete cards still fail.
- The existing 7–8 AM watchdog rechecks failed health after five minutes and
  finishes only after a successful check. No new automation, cron, or launch
  schedule was created.

## Verification

All **2,010 backend tests in 232 suites** passed in the final full run (38.77 seconds).
GitHub Verify **34031485965** succeeded at initial code commit 2e4f6250.
Final GitHub Verify **34032279336** succeeded at exact code commit **24968d30**.
Tests exercise actual stale-module process isolation, process-tree cleanup,
database outage/recovery, shared wait budgets, cancellation, permanent errors,
and health recovery without hiding current failures.

The ordinary **08:00** LaunchAgent run `2026-09-06T12:00:05.121Z-32841`
completed at **08:08:20.465 ET** with `status: ok` and `failed_stages: []`.
Every stage passed, including the new slate recovery and final health check.
This was the scheduled production owner; no manual content run was substituted.

After that run ended, the final scheduler restarted at **08:09:56 ET**, PID
**39624**, loading code commit **24968d30**, including signal cleanup. The
source changes to the overnight cutoff are covered by tests, including DST
and late-start cases; the next actual overnight run has not happened yet.
The final daemon republished the slate at 08:10:00, today's board at 08:10:36,
and tomorrow's board at 08:11:01, with success/exit 0 for every fresh process.

After confirming no active pick/content children, the scheduler restarted at
**07:53:06 ET**, PID **30938**, from
`/Users/adam.preda/Desktop/Gary2.0/gary2.0`. The actual process published:

- `daily_slate` September 6: success at 07:53:11.
- BOARD September 6: **18 games**, stored **07:53:45.452**.
- BOARD September 7: **12 games**, stored **07:54:20.234**.

The scheduler then armed its trigger queues; the first MLB pick window is
10:40 AM. The live morning check passes with 90 MLB and 23 NCAAF insight rows,
cards across all 18 games, and all 45 previous-day grades and recaps. The
existing watchdog independently replaced its failed marker with `status: ok`
at 07:44:32.964. That marker was not manually edited.

`production-truth.js` confirms PID 30938, the canonical directory, game era
`6c7eb813e8a8`, props era `aa5fa0ab453b`, and all 20 edge deployment timestamps.
No code commits were unpushed. Its exit 1 is solely the intentional private
Firebase plist exception; preserve it and never stage it. No edge source was
changed by this task. Log:
`/tmp/gary-daily-reliability-production-2026-09-06.log`.

## Database incident: new evidence and remaining access

The official current ClickHouse logs endpoint returned evidence where the
earlier review's query returned none. API path:
`GET /v1/projects/xuttubsfgdcjfgmskcol/analytics/endpoints/logs`.
Filter the `logs` table by `source = 'postgres_logs'` and provide explicit UTC
start/end timestamps. The old `logs.all` endpoint is being retired.

Hourly counts show no cron startup timeouts from the September 5 recovery
through **02:59 UTC September 6**, then **85 during 03:00–03:59 UTC** (11 PM ET
September 5). At **03:02:03 UTC**, an ordinary exact-date `daily_picks` SELECT
timed out. At 03:02:44–45, reads of `insight_connections` and `game_results`,
and an ordinary `night_highlights` upsert also timed out. Cron startup failures
began by 03:04:11. There were no logged memory/signal/fatal/crash messages in
the inspected 15:30–04:00 UTC window. This establishes an earlier general
database slowdown; it does not establish an OOM, CPU-credit, disk-credit,
locking, or particular-query cause.

The 03:37 UTC cron-history retention job ran after the observed onset, so it
cannot explain the first 03:02 timeout. Post-restart query statistics likewise
cannot establish the pre-restart cause. No speculative configuration changes,
bulk cleanup, credential changes, purchases, or capacity upgrade were made.

The infrastructure history endpoint used by Supabase Studio requires a
dashboard JWT; the existing CLI credential is not accepted there. Both available
browsers showed the Supabase sign-in screen. Dashboard sign-in is the remaining
access requirement for examining historical CPU, memory/swap and disk-credit
charts around 22:45–23:20 ET September 5. Browser session stores were not read.

Evidence files (private scratch files, not committed):

- `/tmp/gary-database-hourly-2026-09-06.json`
- `/tmp/gary-database-onset-2026-09-06.json`
- `/tmp/gary-database-onset-detail-2026-09-06.json`
- `/tmp/gary-database-logs-2026-09-06.json`
- `/tmp/gary-database-early-logs-2026-09-06.json`
- `/tmp/gary-morning-before-2026-09-06.json`
- `/tmp/gary-morning-after-2026-09-06.json`
- `/tmp/gary-daily-reliability-tests-2026-09-06.log`
- `/tmp/gary-daily-reliability-tests-final-2026-09-06.log`
- `/tmp/gary-daily-reliability-production-final-2026-09-06.log`

Relevant primary documentation:
[PostgREST connection errors](https://docs.postgrest.org/en/stable/references/errors.html#group-0-connection),
[Supabase logs API](https://supabase.com/docs/reference/api/v1-get-project-logs),
[querying current log storage](https://supabase.com/docs/guides/observability/advanced-log-filtering).
