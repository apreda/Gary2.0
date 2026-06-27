#!/usr/bin/env node
/**
 * Tomorrow Board snapshot CLI
 *
 * Assembles tomorrow's TOMORROW-tab snapshot (slate + line board, ranked big
 * games w/ plain-text divisional standing, by-sport probable starters, key
 * returns, the extra tabbed lanes — FORM · RUN PROFILE · WEATHER, earliest-game
 * countdown) into the `tomorrow_board` Supabase table via tomorrowService.
 *
 * The 5 AM scheduler plan step calls writeTomorrowBoard automatically, plus a
 * cheap evening re-run picks up overnight-posted lines. This CLI exists for
 * backfills and manual re-snapshots.
 *
 * Usage:
 *   node scripts/run-tomorrow-board.js                    # tomorrow (ET) -> tomorrow_board
 *   node scripts/run-tomorrow-board.js --today            # today (ET)    -> today_board
 *   node scripts/run-tomorrow-board.js --date 2026-06-27  # specific ET date
 *   node scripts/run-tomorrow-board.js --date 2026-06-27 --table today_board
 */

import '../src/loadEnv.js';

const args = process.argv.slice(2);

function getArgValue(flag) {
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const next = args[idx + 1];
  if (!next || next.startsWith('--')) return undefined;
  return next;
}

const { writeTomorrowBoard, tomorrowET } = await import('../src/services/tomorrowService.js');

const dateArg = getArgValue('--date');
const today = args.includes('--today');
const tableArg = getArgValue('--table');
// Today's ET calendar date (en-CA formats YYYY-MM-DD), for the --today path.
const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const targetDate = dateArg || (today ? todayET : tomorrowET());
const table = tableArg || (today ? 'today_board' : 'tomorrow_board');

if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
  console.error(`❌ Invalid --date "${targetDate}". Expected YYYY-MM-DD.`);
  process.exit(1);
}

try {
  const r = await writeTomorrowBoard(targetDate, table);
  console.log(
    `\n🏁 ${table} for ${r.date}: ${r.game_count} game(s), ` +
    `${r.big_games.length} big game(s), ${r.starters.length} starter(s), ` +
    `${r.returns.length} return(s), ${r.form.length} form, ` +
    `${r.run_profile.length} run-profile, ${r.weather.length} weather, ` +
    `${r.wc_lookahead.length} wc-lookahead, ` +
    `lines=${r.any_lines ? 'posted' : 'open soon'}, ` +
    `countdown=${r.countdown_sport || 'none'}`,
  );
  process.exit(0);
} catch (e) {
  console.error(`❌ Tomorrow board write failed: ${e.message}`);
  process.exit(1);
}
