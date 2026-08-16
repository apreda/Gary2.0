#!/usr/bin/env node
/**
 * Agentic NCAAF player-props runner.
 *
 * Current market lines: The Odds API event-odds endpoint.
 * Game identity, roster validation, stats, live scores, grading: Ball Don't Lie.
 *
 * This process exits nonzero on missing/deactivated market credentials, an
 * unmatched event, absent live markets, missing BDL validation, malformed model
 * output, or storage failure. Only Gary's explicit no_play decision is a pass.
 *
 * Usage:
 *   node scripts/run-agentic-ncaaf-props.js --game-id=<BDL_GAME_ID>
 *   node scripts/run-agentic-ncaaf-props.js --game-id=<BDL_GAME_ID> --store=0
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { buildNcaafPropsAgenticContext } from '../src/services/agentic/ncaafPropsAgenticContext.js';
import { exitAfterFlushing } from './lib/processLifecycle.js';

runAgenticPropsCli({
  sportKey: 'americanfootball_ncaaf',
  leagueLabel: 'NCAAF',
  buildContext: buildNcaafPropsAgenticContext,
  windowHours: 24 * 7,
  useESTDayFiltering: false,
  limitDefault: 4,
  regularOnly: false,
})
  .then(() => exitAfterFlushing(0))
  .catch((error) => {
    console.error(`Agentic NCAAF Props runner failed: ${error.code ? `[${error.code}] ` : ''}${error.message}`);
    return exitAfterFlushing(1);
  });
