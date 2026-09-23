// Darts results (founder, Sep 23 2026): Gary's leans are not bets and never
// reach the Billfold, but "i still want to see that they hit". Once a game is
// final, each of its leans is marked hit, miss or void straight from the box
// score (no model), so the Darts page can show yesterday's hits.
import { findMlbSettlementPlayer, mlbPropActual } from '../../../supabase/functions/_shared/mlbPropSettlement.js';
import { findNflSettlementPlayer } from '../../../scripts/lib/resultsGradingReliability.js';

const BDL = 'https://api.balldontlie.io';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function bdl(path, apiKey) {
  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(`${BDL}/${path}`, { headers: { Authorization: apiKey }, signal: AbortSignal.timeout(20000) });
    if (res.status !== 429) break;
    await sleep(1500 * (attempt + 1));
  }
  if (!res.ok) throw new Error(`BDL ${res.status} for ${path}`);
  return res.json();
}

async function bdlAll(path, apiKey) {
  const rows = [];
  let cursor = null;
  do {
    const page = await bdl(`${path}${cursor == null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`, apiKey);
    rows.push(...(page.data || []));
    cursor = page.meta?.next_cursor ?? null;
  } while (cursor != null);
  return rows;
}

/** "home_runs 0.5" → one leg; "hits 1.5 + runs_scored 0.5" → both legs. */
export function dartLegs(prop) {
  return String(prop || '').split('+')
    .map((part) => part.trim().match(/^([a-z_]+)\s+(-?\d+(?:\.\d+)?)$/i))
    .filter(Boolean)
    .map((m) => ({ stat: m[1].toLowerCase(), line: Number(m[2]) }));
}

const clears = (actual, line, bet) => (bet === 'under' ? actual < line : actual > line);
const isFinal = (status) => /final/i.test(String(status || ''));
const isOff = (status) => /postpon|cancel|suspend/i.test(String(status || ''));

/** Grade one MLB lean against its game and box. null = not gradable yet. */
export function gradeMlbDart(dart, game, statRows) {
  if (!game) return null;
  if (isOff(game.status)) return { result: 'void', actual: null };
  if (!isFinal(game.status)) return null;
  const legs = dartLegs(dart.prop);
  if (!legs.length) return null;
  const bet = String(dart.bet || 'over').toLowerCase();
  if (dart.kind === 'first_inning') {
    const away = game.away_team_data?.inning_scores?.[0];
    const home = game.home_team_data?.inning_scores?.[0];
    if (!Number.isFinite(away) || !Number.isFinite(home)) return null;
    const runs = away + home;
    return { result: clears(runs, legs[0].line, bet) ? 'hit' : 'miss', actual: runs };
  }
  const lookup = findMlbSettlementPlayer(statRows, { playerId: dart.player_id, name: dart.player });
  if (lookup.status === 'missing') return { result: 'void', actual: null }; // did not play
  if (!lookup.row) return null; // ambiguous identity: never guess
  const actuals = legs.map((leg) => mlbPropActual(leg.stat, lookup.row));
  if (actuals.some((value) => value == null)) return null;
  const hit = legs.every((leg, i) => clears(actuals[i], leg.line, bet));
  return { result: hit ? 'hit' : 'miss', actual: actuals[0] };
}

const nflNumber = (row, ...keys) => keys.reduce((sum, key) => sum + (Number(row?.[key]) || 0), 0);
const NFL_ACTUAL = {
  td: (r) => nflNumber(r, 'rushing_touchdowns', 'receiving_touchdowns', 'kick_return_touchdowns', 'punt_return_touchdowns'),
  tetd: (r) => nflNumber(r, 'rushing_touchdowns', 'receiving_touchdowns'),
  qbtd: (r) => nflNumber(r, 'rushing_touchdowns'),
  recyds: (r) => nflNumber(r, 'receiving_yards'),
  passtd: (r) => nflNumber(r, 'passing_touchdowns'),
  int: (r) => nflNumber(r, 'passing_interceptions'),
  // First TD needs the scoring order; it stays ungraded until a play feed is wired.
};

/** Grade one NFL lean against its game and player stats. null = not gradable yet. */
export function gradeNflDart(dart, game, statRows) {
  if (!game) return null;
  if (isOff(game.status)) return { result: 'void', actual: null };
  if (!isFinal(game.status)) return null;
  const measure = NFL_ACTUAL[dart.kind];
  const leg = dartLegs(dart.prop)[0];
  if (!measure || !leg) return null;
  const lookup = findNflSettlementPlayer(statRows, { playerId: dart.player_id, name: dart.player });
  if (lookup.status === 'missing') return { result: 'void', actual: null };
  if (!lookup.row) return null;
  const actual = measure(lookup.row);
  return { result: clears(actual, leg.line, String(dart.bet || 'over').toLowerCase()) ? 'hit' : 'miss', actual };
}

/** Grade every ungraded, unscratched lean for a date. Never fatal to its caller. */
export async function gradeDarts({ supabase, bdlApiKey, date, console = globalThis.console }) {
  const { data: darts, error } = await supabase.from('darts')
    .select('id,league,kind,player,player_id,prop,bet,game_id')
    .eq('game_date', date).is('result', null).is('scratched_at', null);
  if (error) throw error;
  if (!darts?.length) return { graded: 0 };
  const byGame = new Map();
  for (const dart of darts) {
    const key = `${dart.league}|${dart.game_id}`;
    if (!byGame.has(key)) byGame.set(key, []);
    byGame.get(key).push(dart);
  }
  let graded = 0;
  for (const [key, group] of byGame) {
    const [league, gameId] = key.split('|');
    if (!gameId || gameId === 'null' || !['MLB', 'NFL'].includes(league)) continue;
    try {
      const path = league === 'MLB' ? 'mlb/v1' : 'nfl/v1';
      const game = (await bdl(`${path}/games/${encodeURIComponent(gameId)}`, bdlApiKey)).data;
      if (!isFinal(game?.status) && !isOff(game?.status)) continue;
      const needsBox = group.some((dart) => dart.kind !== 'first_inning');
      const stats = needsBox && isFinal(game.status)
        ? await bdlAll(`${path}/stats?game_ids[]=${encodeURIComponent(gameId)}&per_page=100`, bdlApiKey)
        : [];
      for (const dart of group) {
        const outcome = league === 'MLB' ? gradeMlbDart(dart, game, stats) : gradeNflDart(dart, game, stats);
        if (!outcome) continue;
        const { error: writeError } = await supabase.from('darts')
          .update({ result: outcome.result, actual: outcome.actual, graded_at: new Date().toISOString() })
          .eq('id', dart.id).is('result', null);
        if (writeError) throw writeError;
        graded++;
      }
    } catch (e) {
      console.warn(`  ⚠️ Darts grade ${league} game ${gameId}: ${e.message}`);
    }
  }
  console.log(`  🎯 Darts graded: ${graded} for ${date}`);
  return { graded };
}
