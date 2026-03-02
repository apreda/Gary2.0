#!/usr/bin/env node
/**
 * Agentic NHL Player Props Runner
 * Uses a full agentic iteration loop for NHL prop analysis
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
  windowHours: 24,  // Only today's games (props aren't available for tomorrow)
  useESTDayFiltering: true,  // Filter by EST day - only games starting TODAY in EST
  propsPerGame: 5,  // Gary shortlists 5; 2 survive per game after constraint
  limitDefault: 15
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NHL Props runner crashed:', error);
    process.exit(1);
  });
