#!/usr/bin/env node
/**
 * Market Pulse — League-Wide Market Results (TODAY-rolling)
 *
 * Summarizes how the betting market behaved across a full league slate for a
 * given day: the overs/unders record (final runs vs the PREGAME total), the
 * favorites moneyline record (more-negative pregame ML = favorite), and the
 * underdogs' flat-stake net units. One `market_pulse` row per (date, league),
 * upserted via the supabase client (onConflict date,league) so re-runs refresh
 * rather than duplicate. iOS reads via the anon SELECT policy.
 *
 * TODAY-ANCHORED (Jun 2026): the default date is TODAY in EST, not yesterday.
 * The Home "Wire" strip resets to 0 the moment today's slate begins and BUILDS
 * as today's games go final + grade (the grader/launchd cadence re-runs this
 * 5x/day). The 0-state is real: as soon as today has a slate (>=1 scheduled
 * game) a row is written with zeroed counts (games_counted 0, empty meta), and
 * each later run re-upserts the same (date, league) row with the running tally
 * as games finalize. Per-game meta carries winner_is_dog (true=+ML dog winner,
 * false=−ML fav winner), so iOS derives BOTH "+ML DOGS" and the new "+ML FAVS"
 * counts straight from meta. iOS reads the date == todayEST() row; before any
 * game is final it sees the zeroed row, so the strip shows 0/0/0/0, not stale
 * yesterday counts. Pass --yesterday (or --date) to (re)build a settled day.
 *
 * Data sources:
 *   MLB — bdl.getMlbGamesForETDate(date) for finals; EVERY market number
 *         (total, run line, both MLs) joins from the daily_slate PREGAME
 *         snapshot. The live odds endpoint is banned from tallies: post-game
 *         it holds the SETTLED lines (see scripts/lib/marketPulseTallies.js).
 *   NBA — ballDontLieOddsService.getGamesWithOddsForSport('basketball_nba', date)
 *         for totals, joined to bdl.getNbaGamesForDate(date) for finals.
 *         ⚑ NBA totals still read the live-odds snapshot (the same settled-line
 *         trap); no pregame slate join is wired, so NBA carries no favs/dogs
 *         counts. Fix rides the NBA-readiness pass before the season (~Oct 1).
 *
 * Usage:
 *   node run-market-pulse.js                       # TODAY (EST), rolling — MLB + NBA
 *   node run-market-pulse.js --yesterday           # the settled prior EST day
 *   node run-market-pulse.js --date 2026-06-04     # specific date
 *   node run-market-pulse.js --league MLB          # single league
 *   node run-market-pulse.js --dry-run             # print rows, no write
 */

// MUST load env vars FIRST before any other imports
import './src/loadEnv.js';

import { getESTDate, getESTHour } from './src/utils/dateUtils.js';
import { computePulsePasses } from './scripts/lib/marketPulseRunMode.js';
import { accumulate, freshAcc } from './scripts/lib/marketPulseTallies.js';

// Import after env is loaded (services read env at module init time).
// market_pulse is RLS'd anon-read-only — writes need the service-role key,
// so build an admin client here instead of the shared anon client.
const { createClient } = await import('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, adminKey);
const { ballDontLieService: bdl } = await import('./src/services/ballDontLieService.js');
const { ballDontLieOddsService } = await import('./src/services/ballDontLieOddsService.js');

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

// Leagues with full-slate odds + finals coverage.
const ACTIVE_LEAGUES = ['MLB', 'NBA'];

const TABLE = 'market_pulse';

// ─────────────────────────────────────────────────────────────────────────────
// Arg parsing (mirrors run-insight-connections.js / run-wire-items.js)
// ─────────────────────────────────────────────────────────────────────────────

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

const dryRun = args.includes('--dry-run');
const yesterdayFlag = args.includes('--yesterday');
const dateArg = getArgValue('--date');
const leagueArg = getArgValue('--league');

// Date precedence: --date (explicit) > --yesterday (settled prior day) > hour-keyed
// default (see scripts/lib/marketPulseRunMode.js): flagless pre-6AM-ET runs SETTLE
// yesterday (the 2 AM slot is the only one that sees a full West-Coast night),
// 6-10 AM runs re-settle yesterday then write today's 0-state, later runs are the
// today-anchored strip as before. A row built for TODAY is written even with 0
// graded games (the 0-state reset), as long as today actually has a slate; a
// settled past day keeps the old "skip empty" behavior.
const passes = computePulsePasses({
  dateArg,
  yesterdayFlag,
  etHour: getESTHour(),
  today: getESTDate(),
});
for (const pass of passes) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pass.date)) {
    console.error(`❌ Invalid --date "${pass.date}". Expected YYYY-MM-DD.`);
    process.exit(1);
  }
}

// Leagues: --league (comma-separated, case-insensitive) filtered to ACTIVE_LEAGUES,
// else all active leagues (default 'MLB,NBA').
let leagues = ACTIVE_LEAGUES;
if (leagueArg) {
  const requested = leagueArg
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  leagues = ACTIVE_LEAGUES.filter((l) => requested.includes(l));
  const unknown = requested.filter((l) => !ACTIVE_LEAGUES.includes(l));
  if (unknown.length) {
    console.warn(`⚠️  Ignoring unsupported league(s): ${unknown.join(', ')}`);
  }
}

if (leagues.length === 0) {
  console.error(
    `❌ No active leagues to run. Active: ${ACTIVE_LEAGUES.join(', ')}` +
      (leagueArg ? ` (requested: ${leagueArg})` : '')
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const teamName = (t) => {
  if (!t) return '';
  if (typeof t === 'string') return t;
  return t.full_name || t.display_name || t.name || t.abbreviation || '';
};

// ── daily_slate join helpers (mirror src/services/streaksService.js) ──────────
// Per-game PREGAME lines (both MLs, total, run line) are read from the
// `daily_slate` morning snapshot,
// NEVER re-derived from the live BDL odds endpoint for a past date — that feed
// only keeps the latest snapshot, which post-game is the SETTLED in-game line
// (the winner reads ~-10000, circular). daily_slate freezes the real two-sided
// pregame line before first pitch. It's keyed by (ET date, mascot away, mascot
// home), so each BDL final joins by its real ET date + normalized team names.
// BDL games carry the mascot under `.name` ("Braves"); daily_slate stores the
// same mascot-short string (oddsService mapTeamName), so we join on `.name`,
// NOT `.display_name` ("Atlanta Braves"), which would not match.
const TEAM_ALIASES = { 'Oakland Athletics': 'Athletics' };
const canonicalTeam = (name) => (name ? TEAM_ALIASES[name] || name : name);

function normalizeName(name) {
  if (!name) return '';
  let s = String(canonicalTeam(name)).toLowerCase();
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); // strip accents
  s = s.replace(/[.'’\-]/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

/** Per-game join key for daily_slate: "ETdate|normAway|normHome". */
function slateKey(etDate, awayName, homeName) {
  return `${etDate}|${normalizeName(awayName)}|${normalizeName(homeName)}`;
}

/** BDL games index by UTC date; resolve each game's real ET slate day. */
function isoToETDate(iso) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Map<bdlGameId, { ml_home, ml_away, total, spread_home }> of GENUINE pregame
 * lines for the given MLB finals, sourced from daily_slate (keyed by ET date +
 * mascot names). A final with no stored slate row (e.g. before daily_slate
 * existed) is simply absent → no pregame market, so accumulate() counts the
 * game but skips every tally it can't ground.
 */
async function fetchMlbPregameLines(finals) {
  const byGame = new Map();
  if (!finals.length) return byGame;
  const etDates = [...new Set(finals.map((g) => isoToETDate(g.date)))];
  let slate = [];
  try {
    const { data, error } = await supabase
      .from('daily_slate')
      .select('date, away_team, home_team, ml_home, ml_away, total, spread')
      .eq('league', 'MLB')
      .in('date', etDates);
    if (error) throw new Error(error.message);
    slate = data || [];
  } catch (err) {
    console.warn(`   ⚠️  daily_slate read failed (pregame lines unavailable): ${err.message}`);
    return byGame;
  }
  const byKey = new Map();
  for (const r of slate) {
    if (!r?.date || r.away_team == null || r.home_team == null) continue;
    byKey.set(slateKey(r.date, r.away_team, r.home_team), r);
  }
  for (const g of finals) {
    const r = byKey.get(slateKey(isoToETDate(g.date), g.away_team?.name, g.home_team?.name));
    if (r) byGame.set(g.id, { ml_home: num(r.ml_home), ml_away: num(r.ml_away), total: num(r.total), spread_home: num(r.spread) });
  }
  return byGame;
}

/** Median of a numeric array (closing-line consensus across vendors). */
function median(values) {
  const arr = values.filter((v) => v !== null && v !== undefined).map(Number).sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-league builders → { row, meta }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MLB: finals from BDL (score fields home_team_data.runs / away_team_data.runs),
 * every market number from the daily_slate pregame snapshot via
 * fetchMlbPregameLines. No live-odds fetch — see the settled-line ban in
 * scripts/lib/marketPulseTallies.js.
 */
async function buildMlb(date) {
  // Finals via the ET-date helper (BDL files late West-Coast games under
  // tomorrow's UTC date). EVERY market number — total, run line, both MLs —
  // comes from the daily_slate PREGAME snapshot: the live odds endpoint only
  // keeps the latest vendor rows, which post-game are the SETTLED in-game
  // lines (a 13-1 blowout stored spread_home 11.5; a 1-0 final stored total
  // 1.5) and flipped Aug 24-25's true fav 4-11 into a reported 12-3.
  const games = await bdl.getMlbGamesForETDate(date);

  const finals = (games || []).filter((g) => {
    const status = String(g.status || '').toUpperCase();
    return status.includes('FINAL')
      && num(g.home_team_data?.runs) !== null
      && num(g.away_team_data?.runs) !== null;
  });
  const pregameByGame = await fetchMlbPregameLines(finals);

  const acc = freshAcc();
  const meta = [];

  for (const g of finals) {
    const homeScore = num(g.home_team_data?.runs);
    const awayScore = num(g.away_team_data?.runs);

    const awayTeam = teamName(g.away_team);
    const homeTeam = teamName(g.home_team);
    const matchup = `${awayTeam} @ ${homeTeam}`;
    const { ml_home = null, ml_away = null, total = null, spread_home = null } = pregameByGame.get(g.id) || {};
    const rec = accumulate(acc, {
      matchup, awayTeam, homeTeam, homeScore, awayScore, total, spreadHome: spread_home,
      mlHome: ml_home, mlAway: ml_away,
    });
    if (rec) meta.push(rec);
  }

  // slated = how many games exist on the date at all (any status), so run() can
  // tell "today has a slate but nothing's final yet" (write the 0-row) apart
  // from "no games today" (write nothing).
  return { acc, meta, slated: (games || []).length };
}

/**
 * NBA: getGamesWithOddsForSport('basketball_nba', date) yields the unified
 * { id, home_team, away_team, bookmakers:[{ markets:[{ key, outcomes }] }] }
 * shape (totals + h2h). Finals come from getNbaGamesForDate(date)
 * (home_team_score / visitor_team_score). Join by game id.
 */
async function buildNba(date) {
  const [oddsGames, finalGames] = await Promise.all([
    ballDontLieOddsService.getGamesWithOddsForSport('basketball_nba', date),
    bdl.getNbaGamesForDate(date),
  ]);

  const finalById = new Map();
  for (const g of finalGames || []) {
    if (g?.id != null) finalById.set(g.id, g);
  }

  const acc = freshAcc();
  const meta = [];

  for (const og of oddsGames || []) {
    const fg = finalById.get(og.id);
    if (!fg) continue;
    const status = String(fg.status || '').toUpperCase();
    if (!status.includes('FINAL')) continue;
    const homeScore = num(fg.home_team_score);
    const awayScore = num(fg.visitor_team_score);
    if (homeScore === null || awayScore === null) continue;

    // Median closing total + ML across the game's bookmakers (extractFromBookmaker
    // shape: markets keyed 'totals' / 'h2h', outcomes named Over/Under or team).
    const totalPoints = [];
    const spreadHomeVals = [];
    const homeNm = og.home_team;
    const awayNm = og.away_team;
    const lastWord = (s) => String(s || '').trim().split(/\s+/).pop().toLowerCase();
    const homeLast = lastWord(homeNm);

    for (const bk of og.bookmakers || []) {
      for (const mkt of bk.markets || []) {
        if (mkt.key === 'totals') {
          const over = (mkt.outcomes || []).find((o) => o.name === 'Over');
          if (over && num(over.point) !== null) totalPoints.push(num(over.point));
        } else if (mkt.key === 'spreads') {
          for (const o of mkt.outcomes || []) {
            if (lastWord(o.name) === homeLast && num(o.point) !== null) spreadHomeVals.push(num(o.point));
          }
        }
      }
    }

    const total = median(totalPoints);
    const spreadHome = median(spreadHomeVals);

    const matchup = `${awayNm} @ ${homeNm}`;
    // NBA carries no daily_slate pregame-ML join here, so mlHome/mlAway stay null
    // → winner_is_dog is null and NBA games are excluded from the dogs/favs view
    // (the view is MLB-only for now). Team names keep the meta shape consistent.
    const rec = accumulate(acc, { matchup, awayTeam: awayNm, homeTeam: homeNm, homeScore, awayScore, total, spreadHome });
    if (rec) meta.push(rec);
  }

  return { acc, meta, slated: (finalGames || []).length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

/** One full pulse pass for a single date. Returns the pass's failure count. */
async function run(targetDate, isToday) {
  console.log(
    `\n📊 Market Pulse — date=${targetDate}${isToday ? '' : ' (settling)'} leagues=${leagues.join(', ')}` +
      (dryRun ? ' (DRY RUN)' : '')
  );

  const rows = [];
  let failures = 0;

  for (const league of leagues) {
    console.log(`\n── ${league} ──`);
    try {
      const { acc, meta, slated = 0 } = league === 'MLB' ? await buildMlb(targetDate)
        : await buildNba(targetDate);

      if (acc.games_counted === 0) {
        // TODAY 0-state: if today HAS a slate but nothing's final yet, still write
        // a zeroed row so the strip resets to 0 and rolls up as games grade. A
        // settled past day (or a today with no slate at all) writes nothing.
        if (isToday && slated > 0) {
          console.log(`   ${league}: slate of ${slated}, 0 final yet — writing 0-state row.`);
          // falls through to build the (all-zero) row below
        } else {
          console.log(`   No gradeable ${league} games (score + odds) for ${targetDate}.`);
          continue;
        }
      }

      const row = {
        date: targetDate,
        league,
        overs_wins: acc.overs_wins,
        overs_losses: acc.overs_losses,
        overs_pushes: acc.overs_pushes,
        fav_wins: acc.fav_wins,
        fav_losses: acc.fav_losses,
        dog_wins: acc.dog_wins,
        dog_losses: acc.dog_losses,
        dog_net_units: Number(acc.dog_net_units.toFixed(2)),
        games_counted: acc.games_counted,
        meta,
        generated_by: 'run-market-pulse.js',
      };
      rows.push(row);

      console.log(
        `   ${league}: ${acc.games_counted} games | O/U ${acc.overs_wins}-${acc.overs_losses}-${acc.overs_pushes} | ` +
          `Fav (pregame ML) ${acc.fav_wins}-${acc.fav_losses}`
      );
    } catch (err) {
      failures += 1;
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`   ❌ [${league}] market pulse failed: ${detail}`);
    }
  }

  if (rows.length === 0) {
    console.log(`\n${dryRun ? '🧪 DRY RUN complete' : '✅ Done'} — no rows computed for ${targetDate}.`);
  } else if (dryRun) {
    console.log(`\n🧪 Would upsert ${rows.length} row(s):`);
    console.log(JSON.stringify(rows, null, 2));
    console.log(`\n🧪 DRY RUN complete — ${rows.length} row(s) computed for ${targetDate}.`);
  } else {
    // Persist every successfully built league before reporting a partial failure.
    // A failed league never discards or blocks the authoritative rows that did
    // complete during this pass.
    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: 'date,league' });
    if (error) {
      console.error(`   ❌ Upsert failed: ${error.message}${error.code ? ' [code=' + error.code + ']' : ''}`);
      return failures + 1;
    }

    console.log(`\n✅ Done — upserted ${rows.length} market_pulse row(s) for ${targetDate}.`);
  }

  // All leagues were attempted and every successful row was handled above.
  // Report any owned league failure only after that work is complete. Empty but
  // authoritative leagues use the normal no-row path and do not increment this.
  if (failures > 0) {
    console.error(`\n❌ Market Pulse completed with ${failures} failed league(s); successful league updates were preserved.`);
  }
  return failures;
}

(async () => {
  // A failed pass never blocks the next one (a broken settle still lets today's
  // 0-state land, and vice versa); any failure anywhere exits nonzero at the end.
  let totalFailures = 0;
  for (const pass of passes) {
    totalFailures += await run(pass.date, pass.isToday);
  }
  process.exit(totalFailures > 0 ? 1 : 0);
})()
  .catch((error) => {
    console.error('Market Pulse runner crashed:', error);
    process.exit(1);
  });
