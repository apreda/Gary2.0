# Pick Generation Scripts

This directory contains scripts for generating, storing, and grading betting picks using the agentic pipeline.

## Scripts

### `run-agentic-picks.js`
Runs the agentic pipeline for game picks (NBA, NHL, NFL, NCAAB, NCAAF).
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

### `run-agentic-ncaaf-props.js`
Runs the NCAAF player-props/anytime-TD lane using current event markets and
exact BDL roster/stat/game identity validation.
```bash
node scripts/run-agentic-ncaaf-props.js --game-id=<BDL_GAME_ID> --store=1
```

### `run-agentic-props-cli.js`
Interactive CLI for running props pipelines with custom options.

### `run-all-results.js` / `run-results-for-date.js`
Grade picks against final scores and update results in Supabase.
```bash
node scripts/run-all-results.js
node scripts/run-results-for-date.js --date 2025-02-20
```

## Environment Variables

All scripts require these env vars (set in `.env` or CI):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` — primary LLM for analysis
- `BALLDONTLIE_API_KEY` — odds, stats, and player data
- `NCAAF_THE_ODDS_API_KEY` — active server-side The Odds API key for current NCAAF player props
- `TANK01_RAPIDAPI_KEY` — DFS salaries and projections

## Pick Generation Flow

1. **Data Collection** — Fetch games, stats, and odds from BallDontLie
2. **AI Analysis** — Agentic pipeline with Gemini for multi-pass analysis
3. **Storage** — Save picks to Supabase
4. **Results** — Nightly grading via `run-all-results.js`
