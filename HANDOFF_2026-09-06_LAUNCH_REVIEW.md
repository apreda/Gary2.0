# Launch review and recovery — September 6, 2026

The founder asked whether all six launch workstreams include execution, checks,
review and iteration. They remain in scope; documents, QA and prepared assets
are not substitutes for publication, real participants or third-party approval.
Current scorecard: `GaryMarketing/launch-2026-09/EXECUTION_REVIEW_2026-09-06.md`.

## New recovery and delivery

- SQL/MCP connections failed and analytics REST returned 503 around 06:02–06:04
  Eastern. Detailed health at 06:13 showed database, postgres-user DB, REST and
  Auth unhealthy, despite the top-level project saying ACTIVE_HEALTHY. A bounded
  two-hour log query returned no rows; direct metrics timed out. Cause unknown.
- One official Supabase project restart was accepted at 06:14:57. Postgres
  started 06:19:30, SQL and REST recovered around 06:21, all five services were
  healthy at 06:24:04. At 06:30 direct metrics returned 200/pg_up=1, zero in-flight
  I/O, about 186 MiB available memory and 7.08 GiB free data storage. Recovery is
  not a diagnosed permanent fix; do not add an automatic restart loop.
- Today’s daily_slate was missing after the failed 5 AM publication. The normal
  `run-daily-slate.js --date 2026-09-06` republished 18 games (15 MLB/3 NCAAF),
  deleting zero rows. All starts were still future. The production scheduler
  PID 23440 and Winners PID 11032 were preserved. No cron/launch-agent edit,
  billing change, usage reset, bulk cleanup or new campaign publication occurred.
- The exact X bio link retained September 5's last-good ISR page during the
  outage. Web commit **b35c98b8** adds a browser-clock notice for older boards,
  respecting 3 AM Eastern rollover, with refresh/archive access. Home metadata
  no longer promises every-game/every-day availability. 339 web tests, types,
  focused lint and normal fixture smoke passed. Real browser verified stale
  notice after hydration, refresh, current-day silence and the recovered public
  18-game board plus September 5's full reasoning without signup.
- Web CI **34027201891** passed. First deployment failed on archive inventory's
  transient database 500. Unchanged-source redeploy **dpl_Fits9hU4d3raMvoL4xqRZLsspaar**
  is READY with the public domains and exact b35c98b8 SHA. The date notice cannot
  establish same-day source freshness or service health.
- Natural X posts exposed missing-context references and a sentence split at
  `a.m.`. **a63a269d** repairs these in the shared verbatim selector. Replay of all
  45 September 5 picks changes 16 selections, with 45/45 retaining safe whole
  copy. All 41 focused cases, 1,991 backend tests and 168 edge tests passed;
  CI **34027525003** passed. `social-auto-post` **v99** is deployed, JWT verification
  preserved; all 11 retrieved cloud source files match local source exactly.
- The natural 06:30 scheduled poster response was HTTP 200/health ok, zero posts
  outside its hours. A separate read-only dry run returned the same early-hour
  result. It did not refresh metrics or exercise sentence selection.

## Current six-workstream evidence

901's exact archive was rechecked: executable SHA256
`f71cb609efb7f9cf99659c6ad04b83d648e42fd0f1a88a53d408977838d567e7`, 21 manifests,
13 declared categories. The other task's September 5 submission receipt and
broad account QA supersede old build-900 blockers. Latest receipt: Waiting for
Review, automatic release after approval, US/Canada. Today's browser needs
App Store Connect sign-in; no refreshed approval state claimed.

Yesterday: 45 stored picks match 45 games; 30 X threads (22 NCAAF/8 MLB), all
roughly 110–120 minutes pregame. The existing 30/day cap was reached. Fifteen
stored picks have no X log; do not claim every game is tweeted. App source-first
availability times were not proven. Thread snapshots sum to 7,790 impressions
and 42 profile clicks after roughly 6–13 hours; unequal ages, not unique reach
or measured lift. Current retained HTTP responses do not prove yesterday uptime.

Consented current-week funnel: seven sessions, one useful read, two observed
browsers, no mature seven-day denominator. Tiny sample may include internal use.
Book aggregate: 120 retained entries placed in 30 days, zero manual rows/accounts;
zero consented manual saves/settlements. Disposable 901 QA accounts were removed
and cannot count as real pilot adoption.

Content library, founder scripts, recruitment protocol and vendor packet remain
prepared. Previously requested campaign/contact decision remains pending; no
new messages/posts sent. Instagram mobile minimum age/link/handle issue, TikTok
eligibility, founder footage and provider credits remain visible dependencies.
Next code priority: durable exact-game X publication intent/reconciliation for
root success followed by reply/log failure. No fix to that failure mode yet.

The database recurrence and protected obsolete 9 AM cron remain open operational
dependencies. Do not bypass the earlier denied Terminal control or restart the
scheduler. Keep the real Firebase plist uncommitted. Daily launch automation
continues in this task; its observed September 6 start was 06:01 Eastern, so the
documents no longer promise an incorrect 10 AM time. No second automation added.

Evidence JSON files are under `GaryMarketing/launch-2026-09/evidence/`.
Runtime logs are `/tmp/gary-launch-*-20260906.*`. Temporary credential-free browser
fixture is `/tmp/gary-launch-date-qa-20260906`, with no production config.
