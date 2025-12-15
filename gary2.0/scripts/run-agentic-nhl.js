#!/usr/bin/env node
/**
 * Agentic NHL Runner
 * Uses the 3-stage pipeline (Hypothesis → Investigator → Judge) for NHL moneyline/spread picks
 * 
 * Usage:
 *   node scripts/run-agentic-nhl.js
 *   node scripts/run-agentic-nhl.js --limit=3
 *   node scripts/run-agentic-nhl.js --store=1
 *   node scripts/run-agentic-nhl.js --nocache=1
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.local first, then .env BEFORE importing services
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

// Dynamic imports after env is loaded
const { runAgenticCli } = await import('./run-agentic-cli.js');
const { buildNhlAgenticContext } = await import('../src/services/agentic/nhlAgenticContext.js');

runAgenticCli({
  sportKey: 'icehockey_nhl',
  leagueLabel: 'NHL',
  buildContext: buildNhlAgenticContext,
  windowHours: 24,  // NHL daily schedule - look 24 hours ahead
  limitDefault: 3   // Number of games to process by default
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NHL runner crashed:', error);
    process.exit(1);
  });
