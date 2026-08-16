# Cloud migration — run the pick scheduler off the laptop

**Why:** the pick scheduler has run on the laptop via launchd. Twice now it has
zeroed a whole day's picks — once from a macOS idle-sleep, once from a crash the
watchdog failed to recover. Live-scores, grading, and social already run in the
cloud (Supabase pg_cron → edge functions). Picks are the last thing tethered to
the Mac. This moves them off it.

## Architecture decision

**Always-on worker (Railway / Render / Fly), NOT GitHub Actions.**

Picks are time-sensitive — they fire at T-90/60/30/15 minutes before each game,
driven by precise in-memory timers in `scripts/scheduler.js`. GitHub Actions
scheduled workflows can be delayed 5–15+ minutes under load, which would fire a
T-15 pick *after* kickoff. An always-on worker keeps the exact timing and runs
the existing scheduler unchanged — no rewrite, just deploy. `caffeinate` and the
launchd watchdog are no longer needed (the host runs the process 24/7).

## What's already done (in this repo)

- `package.json`: added `"start": "node scripts/scheduler.js"` + `engines.node >= 20`.
- The scheduler already has crash guards (`unhandledRejection` stays up,
  `uncaughtException` exits cleanly) — on a host with auto-restart, a crash now
  self-heals in seconds.

## Deploy steps (founder — ~20 min, one time)

1. Create a **Railway** (or Render) account. Both have a Background Worker / long-
   running service type. Railway is the simplest; ~$5/mo after the trial credit.
2. New project → **Deploy from GitHub repo** → `apreda/Gary2.0`.
3. Set **Root Directory** = `gary2.0` (the Node app lives in the subfolder).
4. Start command: `npm start` (already wired to the scheduler).
5. Add the environment variables below (copy each value from `gary2.0/.env`).
6. Deploy. Watch the logs for the `📋 Daily slate published` line at the next
   5 AM ET tick (or trigger a redeploy to publish immediately).
7. Once you confirm picks are landing from the cloud for a full day, **disable
   the laptop scheduler** so it doesn't double-run:
   `launchctl bootout gui/$(id -u)/com.gary.scheduler`
   `launchctl bootout gui/$(id -u)/com.gary.scheduler-watchdog`
   (The pipeline is idempotent — a brief overlap is safe, just wasteful.)

## Environment variables to set on the host

Copy values from `gary2.0/.env`:

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
GEMINI_API_KEY_BACKUP
API_FOOTBALL_KEY
BALLDONTLIE_API_KEY
ODDS_API_KEY
OPENAI_API_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_SPORTS_KEY
VITE_ODDS_API_KEY
VITE_PERPLEXITY_API_KEY
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

(Stripe keys aren't needed by the scheduler — leave them off the worker.)

## Notes

- Logs are written to `logs/scheduler/` on disk; on a cloud host those are
  ephemeral — read the host's own log stream instead.
- The scheduler reads/writes Supabase (cloud) and the sports APIs (cloud), so
  nothing else needs to change to run it remotely.

## Current local insight refresh schedule

The installed `com.gary2.daily-insights` launch agent refreshes the Hub/Picks
intelligence pipeline at **06:00, 07:15, 08:00, 11:00, 16:30, and 19:30 ET**.
The 06:00 and 08:00 passes give the morning board two additional opportunities
to collect probable pitchers, weather, schedule context, and generated reads.

Scheduled insight writes are additive and first-write-wins for normal cards:
later passes fill newly available lanes without replacing cards users already
saw. Explicitly volatile streak facts may refresh, projected lineups may upgrade
to confirmed, and live board facts such as weather, odds, and probable starters
may update as their sources change.

## Production ownership — extend, do not duplicate

Gary has one primary local lifecycle. New sports must be added to these owners
instead of introducing a parallel scheduled workflow:

- `com.gary.scheduler` is the sole primary generator for MLB, NFL, and NCAAF
  game picks and props.
- `com.gary2.live-scores` owns the two-minute live-score loop and immediate
  final-result/proof handoff.
- `com.gary2.daily-results` is the retained catch-up grader and prior-slate
  football-proof pass.
- `com.gary2.daily-insights` builds Hub, Wire, and board data for every enabled
  league.

Sport-specific GitHub Actions are manual emergency/backfill tools only. Do not
add a cron for a new sport when one of the owners above already performs that
job. The Railway scheduler must remain stopped while `com.gary.scheduler` is
active; moving the primary to another host requires an explicit one-owner
cutover, not overlapping writers.
