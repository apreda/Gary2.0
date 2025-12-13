#!/usr/bin/env node
/**
 * Agentic NHL Player Props Runner
 * Uses a 3-stage pipeline (Hypothesis → Investigator → Judge) for prop analysis
 * 
 * Usage:
 *   node scripts/run-agentic-nhl-props.js
 *   node scripts/run-agentic-nhl-props.js --limit=3
 *   node scripts/run-agentic-nhl-props.js --store=1
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { buildNhlPropsAgenticContext } from '../src/services/agentic/nhlPropsAgenticContext.js';

runAgenticPropsCli({
  sportKey: 'icehockey_nhl',
  leagueLabel: 'NHL',
  buildContext: buildNhlPropsAgenticContext,
  windowHours: 48,  // NHL - look 48 hours ahead
  propsPerGame: 5,
  limitDefault: 5  // Number of games to process
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NHL Props runner crashed:', error);
    process.exit(1);
  });
