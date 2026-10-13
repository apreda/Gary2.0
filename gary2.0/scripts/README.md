# Scripts — the jobs

## At a glance (launchd, Oct 13 2026)

| Job | Runs | When |
|---|---|---|
| `com.gary.scheduler` | `scheduler.js` (spawns each game's pick run, `run-agentic-picks.js`, at T-90 with later tiers) | always on; restart after code changes it imports |
| `com.gary.winners` | `run-winners-board.js --watch` (late news, seating Gary's card, the daily floor) | always on, every 2 minutes |
| `com.gary.darts` | `run-darts.js` | :00, :20, :40 |
| `com.gary2.daily-insights` | `run-daily-content.js` (slate, board, wire, insights) | 6 AM and noon |
| `com.gary2.daily-results` | grading (`run-all-results.js`) and insight grading | 2 AM, 6:45 AM and through the day |
| `com.gary.marquee` | `run-marquee.js` | mornings, hourly |
| `com.gary2.football-availability` | `../run-insight-connections.js` (NFL availability and practice report) | mornings, hourly |
| `com.gary2.live-scores` (+ watchdog) | `poll-live-scores.js` | every 2 minutes |
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
The scheduled overnight card phase has a 05:45 Eastern cutoff covering work,
waits, and retries so it releases the LaunchAgent before the 6 AM daily run.
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
Runs current MLB, NFL and NCAAF game lanes; NBA remains seasonal. NHL and
NCAAB are retired. MLB uses the frozen June engine; college uses Sol.
```bash
node scripts/run-agentic-picks.js --nba
node scripts/run-agentic-picks.js --nfl --matchup "Patriots" --limit 1
node scripts/run-agentic-picks.js --ncaaf --matchup "Alabama" --limit 1
```

### Props runners (`run-agentic-mlb-props.js`, `run-agentic-nfl-props.js`)
One props system: the props desk brain (`src/services/pickdesk/propsBrain.js`
over the game desk + THE PROP BOARD + THE PROP SHEETS). The old multi-pass
orchestrator props pipeline (NBA/NHL runners) was deleted Sep 2 2026.
```bash
node scripts/run-agentic-mlb-props.js --store=1
```

### `run-agentic-nfl-props.js`
Runs the agentic pipeline for NFL player props, including the supported TD
markets in the same atomic per-game pass.
```bash
node scripts/run-agentic-nfl-props.js --store=1
```

### `run-agentic-props-cli.js`
Interactive CLI for running props pipelines with custom options.

### `run-all-results.js` / `run-results-for-date.js`
Grade picks against final scores and update results in Supabase.
The main CLI composes provider, storage, grading and recap modules under
[`lib/results/`](lib/results/README.md); import those modules for fixture tests.
```bash
node scripts/run-all-results.js
node scripts/run-results-for-date.js --date 2025-02-20
```

## Environment Variables

Set the variables required by the lane being run in its local environment;
never copy production credentials into fixture previews or tests:
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Existing Claude/GPT subscription bridge configuration — see
  `src/services/agentic/orchestrator/modelCascade.js`; metered Anthropic/OpenAI
  routes and Gemini are disabled. College decisions use Sol.
- `BALLDONTLIE_API_KEY` — odds, stats, and player data
- `NCAAF_THE_ODDS_API_KEY` — active server-side The Odds API key for current NCAAF player props
- `TANK01_RAPIDAPI_KEY` — DFS salaries and projections

## Pick Generation Flow

1. **Data Collection** — Fetch games, stats, and odds from BallDontLie
2. **AI Analysis** — Approved sport desk and subscription model routing; MLB
   retains the frozen June engine, and college uses Sol.
3. **Storage** — Save picks to Supabase
4. **Results** — Nightly grading via `run-all-results.js`
