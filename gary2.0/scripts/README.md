# Pick Generation Scripts

This directory contains scripts for managing the generation, storage, and distribution of betting picks.

## Scripts

### `pickManager.js`

The main entry point for generating and storing picks.

**Usage:**
```bash
node scripts/pickManager.js
```

**Environment Variables:**
- `LOG_LEVEL`: Logging level (default: 'info')
- `NODE_ENV`: Environment (e.g., 'development', 'production')
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_KEY`: Supabase API key
- `GEMINI_API_KEY`: Gemini 3 Deep Think API key

### `run-agentic-nba-props.js`
Runs the 3-stage agentic pipeline for NBA player props.
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

## Pick Generation Flow

1. **Data Collection**
   - Fetch upcoming games
   - Collect team/player statistics
   - Get current odds

2. **AI Analysis**
   - Generate analysis using OpenAI
   - Format picks with confidence scores

3. **Storage**
   - Save picks to Supabase
   - Update related records

4. **Notification**
   - Create notifications for subscribers
   - Trigger webhooks

## Error Handling

- Retries failed operations
- Comprehensive logging
- Graceful degradation

## Monitoring

- Logs all operations
- Tracks performance metrics
- Alerts for critical failures
