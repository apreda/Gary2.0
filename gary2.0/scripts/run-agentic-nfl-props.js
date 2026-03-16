#!/usr/bin/env node
/**
 * Agentic NFL Player Props Runner
 * Uses the orchestrator multi-pass pipeline for NFL prop analysis.
 *
 * Usage:
 *   node scripts/run-agentic-nfl-props.js
 *   node scripts/run-agentic-nfl-props.js --limit=4
 *   node scripts/run-agentic-nfl-props.js --store=1
 *   node scripts/run-agentic-nfl-props.js --regular=1    # Yards/receptions only (skip TDs)
 *   node scripts/run-agentic-nfl-props.js --matchup=chiefs
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { buildNflPropsAgenticContext } from '../src/services/agentic/nflPropsAgenticContext.js';

runAgenticPropsCli({
  sportKey: 'americanfootball_nfl',
  leagueLabel: 'NFL',
  buildContext: buildNflPropsAgenticContext,
  windowHours: 24 * 7,  // NFL is weekly — look ahead 7 days
  useESTDayFiltering: false,  // Rolling window (NFL games span Thu/Sun/Mon)
  propsPerGame: 5,  // Gary shortlists 5; 2 survive per game after constraint
  limitDefault: 4,  // Default to 4 games (typical NFL slate focus)
  regularOnly: false  // Set true to skip TDs (--regular=1 flag also works)
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NFL Props runner crashed:', error);
    process.exit(1);
  });
