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
  windowHours: 24,  // Only today's games (props aren't available for tomorrow)
  useESTDayFiltering: true,  // Filter by EST day - only games starting TODAY in EST
  propsPerGame: 5,  // Gary shortlists 5; 2 survive per game after constraint
  limitDefault: 15  // Increased to 15 to cover even the busiest NBA days (max 15 games)
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NBA Props runner crashed:', error);
    process.exit(1);
  });
