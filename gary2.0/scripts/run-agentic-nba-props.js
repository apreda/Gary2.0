#!/usr/bin/env node
/**
 * Agentic NBA Player Props Runner
 * Uses a 3-stage pipeline (Hypothesis → Investigator → Judge) for prop analysis
 * 
 * Usage:
 *   node scripts/run-agentic-nba-props.js
 *   node scripts/run-agentic-nba-props.js --limit=3
 *   node scripts/run-agentic-nba-props.js --store=1
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { buildNbaPropsAgenticContext } from '../src/services/agentic/nbaPropsAgenticContext.js';

runAgenticPropsCli({
  sportKey: 'basketball_nba',
  leagueLabel: 'NBA',
  buildContext: buildNbaPropsAgenticContext,
  windowHours: 36,  // NBA daily schedule - look 36 hours ahead
  propsPerGame: 5,
  limitDefault: 5  // Number of games to process
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NBA Props runner crashed:', error);
    process.exit(1);
  });
