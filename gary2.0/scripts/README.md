# Pick Generation Scripts

This directory contains scripts for generating, storing, and grading betting picks using the agentic pipeline.

## Scripts

### `run-agentic-picks.js`
Runs the agentic pipeline for game picks (NBA, NHL, NFL, NCAAB).
```bash
node scripts/run-agentic-picks.js --nba
node scripts/run-agentic-picks.js --nfl --matchup "Patriots" --limit 1
```

### `run-agentic-nba-props.js`
Runs the 4-pass agentic pipeline for NBA player props.
```bash
node scripts/run-agentic-nba-props.js --store=1
```

### `run-agentic-nhl-props.js`
Runs the agentic pipeline for NHL player props.
```bash
node scripts/run-agentic-nhl-props.js --store=1
```

### `run-agentic-nfl-props.js`
Runs the agentic pipeline for NFL player props.
```bash
node scripts/run-agentic-nfl-props.js --store=1
```

### `run-agentic-nfl-td.js` / `run-agentic-tnf-td.js` / `run-agentic-mnf-td.js`
NFL touchdown prop variants (full slate, Thursday Night, Monday Night).
```bash
node scripts/run-agentic-nfl-td.js --store=1
```

### `run-agentic-props-cli.js`
Interactive CLI for running props pipelines with custom options.

### `run-all-results.js` / `run-results-for-date.js`
Grade picks against final scores and update results in Supabase.
```bash
node scripts/run-all-results.js
node scripts/run-results-for-date.js --date 2025-02-20
```

### `run-dfs-lineups.js`
Generates DFS lineup recommendations.
```bash
node scripts/run-dfs-lineups.js
```

## Environment Variables

All scripts require these env vars (set in `.env` or CI):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY` — primary LLM for analysis
- `BALLDONTLIE_API_KEY` — odds, stats, and player data
- `TANK01_RAPIDAPI_KEY` — DFS salaries and projections

## Pick Generation Flow

1. **Data Collection** — Fetch games, stats, and odds from BallDontLie
2. **AI Analysis** — Agentic pipeline with Gemini for multi-pass analysis
3. **Storage** — Save picks to Supabase
4. **Results** — Nightly grading via `run-all-results.js`
