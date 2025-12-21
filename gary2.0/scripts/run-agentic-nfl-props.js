#!/usr/bin/env node
/**
 * Agentic NFL Player Props Runner
 * Uses a 3-stage pipeline (Hypothesis → Investigator → Judge) for prop analysis
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { buildNflPropsAgenticContext } from '../src/services/agentic/nflPropsAgenticContext.js';

runAgenticPropsCli({
  sportKey: 'americanfootball_nfl',
  leagueLabel: 'NFL',
  buildContext: buildNflPropsAgenticContext,
  windowHours: 24 * 7,  // NFL weekly schedule
  propsPerGame: 5,
  limitDefault: 5  // Number of games to process
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NFL Props runner crashed:', error);
    process.exit(1);
  });




