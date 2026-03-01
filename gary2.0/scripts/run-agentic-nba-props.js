#!/usr/bin/env node
/**
 * Agentic NBA Player Props Runner
 * Uses a full agentic iteration loop for NBA prop analysis
 *
 * Usage:
 *   node scripts/run-agentic-nba-props.js
 *   node scripts/run-agentic-nba-props.js --limit=3
 *   node scripts/run-agentic-nba-props.js --store=1
 *   node scripts/run-agentic-nba-props.js --test
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { buildNbaPropsAgenticContext } from '../src/services/agentic/nbaPropsAgenticContext.js';

runAgenticPropsCli({
  sportKey: 'basketball_nba',
  leagueLabel: 'NBA',
  buildContext: buildNbaPropsAgenticContext,
  windowHours: 24,
  useESTDayFiltering: true,
  propsPerGame: 5,
  limitDefault: 15
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NBA Props runner crashed:', error);
    process.exit(1);
  });
