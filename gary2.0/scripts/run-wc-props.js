#!/usr/bin/env node
/**
 * World Cup Player Props Runner.
 *
 * Uses the shared agentic props pipeline (run-agentic-props-cli) with the soccer
 * context builder + soccer props constitution. Gary picks player props (anytime
 * goal, shots, shots on target, assists, tackles, saves) for each WC match.
 *
 * Usage:
 *   node scripts/run-wc-props.js
 *   node scripts/run-wc-props.js --limit=2
 *   node scripts/run-wc-props.js --store=0
 *   node scripts/run-wc-props.js --game-id=17
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { buildWcPropsAgenticContext } from '../src/services/agentic/wcPropsAgenticContext.js';

runAgenticPropsCli({
  sportKey: 'soccer_world_cup',
  leagueLabel: 'WC',
  buildContext: buildWcPropsAgenticContext,
  windowHours: 24,
  useESTDayFiltering: true,
  propsPerGame: 3,
  limitDefault: 10,
})
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('WC Props runner crashed:', error);
    process.exit(1);
  });
