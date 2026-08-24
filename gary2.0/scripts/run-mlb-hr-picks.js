#!/usr/bin/env node
/**
 * MLB Home Run Props Runner
 * Uses the same full agentic pipeline as regular MLB props,
 * but filtered to HR props only. Gary picks players to hit HRs.
 *
 * Usage:
 *   node scripts/run-mlb-hr-picks.js
 *   node scripts/run-mlb-hr-picks.js --limit=3
 *   node scripts/run-mlb-hr-picks.js --store=0
 */
import { runAgenticPropsCli } from './run-agentic-props-cli.js';

// HR-only runs ride the PROPS DESK LANE (propsBrain over buildMlbDesk,
// Jul 26 2026) with an HR-filtered board — no context builder.
runAgenticPropsCli({
  sportKey: 'baseball_mlb',
  leagueLabel: 'MLB HR',
  windowHours: 24,
  useESTDayFiltering: true,
  propsPerGame: 5,
  limitDefault: 15,
  hrOnly: true
})
  .then(() => process.exit(0))
  .catch((error) => {
    // EXPECTED-PREGAME PASS (Aug 24 2026): the insights job runs this lane at
    // 6:00/7:15/8:00/11:00 ET — hours before MLB lineups post (~1-2h pregame)
    // — so the Scout Report's intentional lineup hard-gate fired every morning
    // and made com.gary2.daily-insights exit 1 daily, burying real failures
    // (the Wire outage sat invisible behind it). Lineups-not-posted-yet is the
    // NORMAL morning state, not a crash: say so and exit 0. The gate itself is
    // untouched; the afternoon passes still land the picks. Every other error
    // stays a loud exit 1.
    const chain = [error?.message, error?.cause?.message].filter(Boolean).join(' | ');
    if (/HARD FAIL[^|]*requires lineups/i.test(chain)) {
      console.log(`⏳ MLB HR lane: lineups not posted yet — expected before ~T-120; a later pass picks this up. (${chain.slice(0, 160)})`);
      process.exit(0);
    }
    console.error('MLB HR Props runner crashed:', error);
    process.exit(1);
  });
