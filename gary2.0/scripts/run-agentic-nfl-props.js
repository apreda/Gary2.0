#!/usr/bin/env node
/**
 * Agentic NFL Player Props Runner
 * Rides the PROPS DESK LANE inside the CLI (footballPropsDesk over the
 * football scout report + THE PROP BOARD, Aug 20 2026 — the same system as
 * MLB). No context builder param; the desk is the context.
 *
 * Usage:
 *   node scripts/run-agentic-nfl-props.js
 *   node scripts/run-agentic-nfl-props.js --limit=4
 *   node scripts/run-agentic-nfl-props.js --store=1
 *   node scripts/run-agentic-nfl-props.js --matchup=chiefs
 *   node scripts/run-agentic-nfl-props.js --game-id=1392248
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { exitAfterFlushing } from './lib/processLifecycle.js';

runAgenticPropsCli({
  sportKey: 'americanfootball_nfl',
  leagueLabel: 'NFL',
  windowHours: 24 * 7,  // NFL is weekly — look ahead 7 days
  useESTDayFiltering: false,  // Rolling window (NFL games span Thu/Sun/Mon)
  limitDefault: 4,  // Manual runs without --game-id take the next 4 games
})
  .then(() => exitAfterFlushing(0))
  .catch((error) => {
    console.error('Agentic NFL Props runner crashed:', error);
    return exitAfterFlushing(1);
  });
