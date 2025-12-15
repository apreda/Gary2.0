#!/usr/bin/env node
/**
 * Agentic NFL Game Pick Runner
 * With enhanced weather and QB cold weather performance analysis
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables FIRST before any other imports
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

// Dynamic imports after env is loaded
const { runAgenticCli } = await import('./run-agentic-cli.js');
const { buildNflAgenticContext } = await import('../src/services/agentic/nflAgenticContext.js');

runAgenticCli({
  sportKey: 'americanfootball_nfl',
  leagueLabel: 'NFL',
  buildContext: buildNflAgenticContext,
  windowHours: 24 * 6,
  limitDefault: 4
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NFL runner crashed:', error);
    process.exit(1);
  });

