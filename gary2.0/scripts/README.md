# Scripts — the jobs

## At a glance (launchd, refreshed Oct 21 2026; full inventory in `launchd/README.md`)

| Job | Runs | When |
|---|---|---|
| `com.gary.scheduler` | `scheduler.js`: writes the day's plan, slate and board at 4:45 AM ET, then spawns each game's pick (`run-agentic-picks.js`) at T-90 with retries at T-60/T-30/T-15, and the props runner for MLB, NFL and NBA games | always on; restart after code changes it imports (each pick is a fresh process) |
| `com.gary.winners` | `run-winners-board.js --watch` (the NFL and NBA boards, Gary's card, late news, seating, the daily floor) | always on |
| `com.gary.darts` | `run-darts.js` (MLB, NFL, NBA) | :00, :20, :40 |
| `com.gary2.daily-insights` | `run-daily-content.js` (slate, board, wire, insights, cards) | 5 AM and noon |
| `com.gary2.daily-results` | grading (`run-all-results.js`), football proof, insight grading | 2:00, 6:45, 11:30, 16:45, 20:00 |
| `com.gary.marquee` | `run-marquee.js` | 5:05 through 10:05 AM, hourly |
| `com.gary2.football-availability` | `../run-insight-connections.js` (NFL availability and practice report) | 5:05 AM through 11:05 PM, hourly |
| `com.gary2.live-scores` (+ watchdog) | `poll-live-scores.js` (also writes NBA finals into team_games) | every 2 minutes |
| `com.gary.operational-alerts` | `run-operational-alerts.js` | every minute |
| `com.gary.subscription-model-worker` | `run-subscription-model-worker.js` (model calls for edge functions) | always on |
| `com.gary.ig-post`, `com.gary.free-pick-video` | Instagram posting and the free-pick video (in `../../GaryMarketing/`) | every 5 / 2 minutes |
| `com.gary2.recap-backfill`, `com.gary.log-rotate`, `com.gary.scheduler-watchdog`, `com.gary.keepawake` | recaps, log rotation, host health, keeping the Mac awake | as scheduled |

Plists live in `launchd/` and `~/Library/LaunchAgents/`; they start scripts by path, so moving a script means
updating both and reloading the job. Services are organized in `../src/services/README.md`.

## Pick generation (detail)

This directory contains scripts for generating, storing, and grading betting picks using the agentic pipeline.

## Scripts

### Morning publication and recovery

The existing `com.gary2.daily-insights` LaunchAgent runs `run-daily-content.js`.
It now checks the actual database REST path before each stage and waits up to
45 minutes total per run through transient outages. A failed stage is retried
once only after storage was observed unavailable and then recovered; completed
stages are not replayed. Invalid credentials fail immediately. Waiting,
recovery, and stage outcomes are recorded in
`~/Library/Logs/Gary2.0/daily-content-stages.jsonl`.
The scheduled overnight card phase has a 04:45 Eastern cutoff covering work,
waits, and retries so it releases the LaunchAgent before the 5 AM daily run.
Explicit dated card backfills retain their individual stage caps.

The daily pipeline repairs `daily_slate` before BOARD, Wire, insights, and
player cards. The 5 AM scheduler also publishes slate and board snapshots,
each in a fresh process capped at eight minutes. This prevents yesterday's
cached module exports from breaking today's snapshot imports after code updates.
The scheduler still needs a restart after edits to its own scheduling code.

Run `node scripts/morning-health.js` to check current output. It retains failed
overnight attempts but recognizes later successful equivalent card stages only
when current card coverage also verifies. The existing 7 AM watchdog rechecks
failed health after five minutes; a verified successful check completes the day.
An outage that outlasts the recovery budget remains a failure. Neither component
restarts Supabase or treats a live scheduler PID as proof of fresh content.

### `run-agentic-picks.js`
One game pick run per sport flag; the scheduler runs one game at a time by its BDL id. `--test` writes to the test
tables (`test_daily_picks`); never re-run a pick that is already published.
```bash
node scripts/run-agentic-picks.js --nba --game-id 21717855 --test
node scripts/run-agentic-picks.js --nfl --matchup "Patriots" --limit 1 --test
node scripts/run-agentic-picks.js --ncaaf --matchup "Alabama" --limit 1 --test
```
After Gary decides, the pick is published at his own line for MLB, the NFL, college and the NBA (no "best line"
swap); see `../src/services/README.md` for where each sport's decision lives.

### Props runners (`run-agentic-mlb-props.js`, `run-agentic-nfl-props.js`, `run-agentic-nba-props.js`)
One props system: the props desk brain (`../src/services/gary/pickdesk/propsBrain.js`; the NBA's desk is
`nbaPropsDesk.js`). These runners store by default: a test run passes `--test` where the runner has it, or stays off
production. No college props, ever.

### `run-agentic-props-cli.js`
Interactive CLI for the props desks (MLB, NFL and NBA). It stores by default.

### `run-all-results.js`
Grades picks against final scores and updates results in Supabase. It composes provider, storage, grading and
recap modules under [`lib/results/`](lib/results/README.md); import those modules for fixture tests.

### Tests that move the clock
A test that shifts `Date.now()` must set `GARY_BDL_SHARED_CACHE_DIR` to a scratch folder (the shared BDL cache is
on disk and read by the live jobs) and must not probe the official NBA injury report in loops (its CDN blocks this
host).

## Environment Variables

Set the variables required by the lane being run in its local environment;
never copy production credentials into fixture previews or tests:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- The Claude/GPT subscription bridge: `../src/services/gary/agentic/orchestrator/subscriptionRoutes.js` (the order)
  and `modelCascade.js`; metered Anthropic/OpenAI routes and Gemini are disabled. Gary is Opus.
- `BALLDONTLIE_API_KEY` — games, odds, stats, props and injuries
- `THE_ODDS_API_KEY` (college prop odds also read `NCAAF_THE_ODDS_API_KEY`) — The Odds API backup (500-credit plan, metered by `oddsApiBudget.js`)
- `GARY_JEV_*` — Jev prop assessments
