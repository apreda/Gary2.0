#!/usr/bin/env node
/**
 * NBA player props runner (Oct 19 2026): the props desk lane with the NBA desk (nbaPropsDesk.js), two props a game.
 *
 * Usage:
 *   node scripts/run-agentic-nba-props.js --test            # writes test_prop_picks only
 *   node scripts/run-agentic-nba-props.js --game-id=21717855 --test
 *   node scripts/run-agentic-nba-props.js --store=0         # writes nothing
 * A run with neither flag stores to production (the scheduler's way).
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { exitAfterFlushing } from './lib/processLifecycle.js';

runAgenticPropsCli({
  sportKey: 'basketball_nba',
  leagueLabel: 'NBA',
  windowHours: 24,
  useESTDayFiltering: true,
  limitDefault: 4,
})
  .then(() => exitAfterFlushing(0))
  .catch((error) => {
    console.error('Agentic NBA Props runner crashed:', error);
    return exitAfterFlushing(1);
  });
