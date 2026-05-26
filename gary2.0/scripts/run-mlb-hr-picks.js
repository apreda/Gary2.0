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
import { buildMlbPropsAgenticContext } from '../src/services/agentic/mlbPropsAgenticContext.js';

runAgenticPropsCli({
  sportKey: 'baseball_mlb',
  leagueLabel: 'MLB HR',
  buildContext: buildMlbPropsAgenticContext,
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
