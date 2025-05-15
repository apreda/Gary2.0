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
- `OPENAI_API_KEY`: OpenAI API key

### `testPickGeneration.js`

Test script to verify pick generation and storage.

**Usage:**
```bash
node scripts/testPickGeneration.js
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
