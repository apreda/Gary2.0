#!/usr/bin/env node
/**
 * MLB Home Run Props Runner
 * Uses the same full agentic pipeline as regular MLB props,
 * but filtered to HR props only. Gary picks players to hit HRs.
 *
 * Usage:
 *   node scripts/run-mlb-hr-picks.js
 *   node scripts/run-mlb-hr-picks.js --limit=3
 *   node scripts/run-mlb-hr-picks.js --store=0
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';

// HR-only runs ride the PROPS DESK LANE (propsBrain over buildMlbDesk,
// Jul 26 2026) with an HR-filtered board — no context builder.
runAgenticPropsCli({
  sportKey: 'baseball_mlb',
  leagueLabel: 'MLB HR',
  windowHours: 24,
  useESTDayFiltering: true,
  propsPerGame: 5,
  limitDefault: 15,
  hrOnly: true
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('MLB HR Props runner crashed:', error);
    process.exit(1);
  });
