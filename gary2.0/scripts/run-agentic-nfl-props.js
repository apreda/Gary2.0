#!/usr/bin/env node
/**
 * Agentic NFL Props Runner
 * 
 * Runs the full agentic pipeline for NFL player props (yards, receptions, etc.)
 * Uses the categorized NFL format: 3 regular props + 2 regular TD + 1 value TD + 1 first TD per game
 * 
 * Usage:
 *   node scripts/run-agentic-nfl-props.js                    # Preview only (no storage)
 *   node scripts/run-agentic-nfl-props.js --store=1          # Store picks to Supabase
 *   node scripts/run-agentic-nfl-props.js --matchup=Bills    # Filter to specific matchup
 *   node scripts/run-agentic-nfl-props.js --limit=2          # Limit number of games
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { buildNflPropsAgenticContext } from '../src/services/agentic/nflPropsAgenticContext.js';

runAgenticPropsCli({
  sportKey: 'americanfootball_nfl',
  leagueLabel: 'NFL',
  buildContext: buildNflPropsAgenticContext,
  windowHours: 48,         // 48-hour rolling window (catches Sunday + Monday games)
  propsPerGame: 7,         // Gary outputs: 3 regular + 2 regular TD + 1 value TD + 1 first TD = 7 max
  limitDefault: 16,        // Max 16 games in Wild Card Weekend
  useESTDayFiltering: false // Use rolling window - more reliable for NFL scheduling
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NFL Props runner crashed:', error);
    process.exit(1);
  });
