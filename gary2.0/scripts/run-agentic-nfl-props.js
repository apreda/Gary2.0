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
  windowHours: 24,  // Today's games within 24h
  propsPerGame: 3,  // Top 3 highest confidence picks per game
  limitDefault: 20,  // Process up to 20 games (full NFL Sunday slate)
  useESTDayFiltering: true  // Filter by EST day instead of rolling window
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Agentic NFL Props runner crashed:', error);
    process.exit(1);
  });




