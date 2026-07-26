#!/usr/bin/env node
/**
 * Agentic MLB Player Props Runner
 * Uses a full agentic iteration loop for MLB prop analysis
 *
 * Usage:
 *   node scripts/run-agentic-mlb-props.js
 *   node scripts/run-agentic-mlb-props.js --limit=3
 *   node scripts/run-agentic-mlb-props.js --store=1
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';

// MLB rides the PROPS DESK LANE inside the CLI (propsBrain over buildMlbDesk,
// Jul 26 2026) — no context builder; the desk is the context.
runAgenticPropsCli({
  sportKey: 'baseball_mlb',
  leagueLabel: 'MLB',
  windowHours: 24,  // Only today's games (props aren't available for tomorrow)
  useESTDayFiltering: true,  // Filter by EST day - only games starting TODAY in EST
  limitDefault: 15
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic MLB Props runner crashed:', error);
    process.exit(1);
  });
