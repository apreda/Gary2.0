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
  windowHours: 16,  // NHL daily schedule - today's games only
  propsPerGame: 2,  // 2-per-game rule: exactly 2 most confident picks per game
  limitDefault: 15  // Number of games to process (NHL can have many games per day)
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NHL Props runner crashed:', error);
    process.exit(1);
  });
