#!/usr/bin/env node
/**
 * Agentic EPL Player Props Runner
 * Uses a 3-stage pipeline (Hypothesis → Investigator → Judge) for prop analysis
 * 
 * Usage:
 *   node scripts/run-agentic-epl-props.js
 *   node scripts/run-agentic-epl-props.js --limit=3
 *   node scripts/run-agentic-epl-props.js --store=1
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { buildEplPropsAgenticContext } from '../src/services/agentic/eplPropsAgenticContext.js';

runAgenticPropsCli({
  sportKey: 'soccer_epl',
  leagueLabel: 'EPL',
  buildContext: buildEplPropsAgenticContext,
  windowHours: 24 * 7,  // EPL weekly schedule - look 7 days ahead
  propsPerGame: 5,
  limitDefault: 5  // Number of games to process
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic EPL Props runner crashed:', error);
    process.exit(1);
  });
