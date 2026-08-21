#!/usr/bin/env node
/**
 * Agentic NCAAF player-props runner.
 * Rides the PROPS DESK LANE inside the CLI (footballPropsDesk over the
 * football scout report + THE PROP BOARD, Aug 20 2026 — the same system as
 * MLB). No context builder param; the desk is the context.
 *
 * Current market lines: The Odds API event-odds endpoint.
 * Game identity, roster validation, stats, live scores, grading: Ball Don't Lie.
 *
 * This process exits nonzero on missing/deactivated market credentials, an
 * unmatched event, missing BDL validation, malformed model output, or storage
 * failure. A game where the provider posts no player-prop markets is a
 * verified pass (no board exists to pick from), as is Gary's explicit no_play.
 *
 * Usage:
 *   node scripts/run-agentic-ncaaf-props.js --game-id=<BDL_GAME_ID>
 *   node scripts/run-agentic-ncaaf-props.js --game-id=<BDL_GAME_ID> --store=0
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';
import { exitAfterFlushing } from './lib/processLifecycle.js';

runAgenticPropsCli({
  sportKey: 'americanfootball_ncaaf',
  leagueLabel: 'NCAAF',
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
