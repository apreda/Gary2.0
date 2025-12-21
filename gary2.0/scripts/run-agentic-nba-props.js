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
  windowHours: 16,  // NBA daily schedule - today's games only
  propsPerGame: 2,  // 2-per-game rule: exactly 2 most confident picks per game
  limitDefault: 10  // Number of games to process (NBA can have many games per day)
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NBA Props runner crashed:', error);
    process.exit(1);
  });
