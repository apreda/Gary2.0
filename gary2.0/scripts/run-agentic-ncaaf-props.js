#!/usr/bin/env node
// College has one prop lane. Reuse the game runner's missing-prop recovery;
// an already published game pick is retained and only its missing prop runs.
// Usage: node scripts/run-agentic-ncaaf-props.js --game-id ID --date YYYY-MM-DD
process.argv.push('--ncaaf');
await import('./run-agentic-picks.js');
