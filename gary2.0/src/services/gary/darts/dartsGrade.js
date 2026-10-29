// Darts results (founder, Sep 23 2026): Gary's leans are not bets and never
// reach the Billfold, but "i still want to see that they hit". Once a game is
// final, each of its leans is marked hit, miss or void straight from the box
// score (no model), so the Darts page can show yesterday's hits.
import { findMlbSettlementPlayer, mlbPropActual } from '../../../../supabase/functions/_shared/mlbPropSettlement.js';
import { findNflSettlementPlayer } from '../../../../scripts/lib/resultsGradingReliability.js';
import { espnPlayerLines, officialLineFor } from '../../sports/nba/espnNbaGame.js';

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

export async function bdlAll(path, apiKey) {
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
  // Any touchdown the player scores, as a book's anytime-TD pays (audit, Oct 13 2026: fumble and interception
  // returns were left out; the props grader already counts them).
  td: (r) => nflNumber(r, 'rushing_touchdowns', 'receiving_touchdowns', 'fumbles_touchdowns', 'interception_touchdowns', 'kick_return_touchdowns', 'punt_return_touchdowns'),
  tetd: (r) => nflNumber(r, 'rushing_touchdowns', 'receiving_touchdowns'),
  qbtd: (r) => nflNumber(r, 'rushing_touchdowns'),
  recyds: (r) => nflNumber(r, 'receiving_yards'),
  rushyds: (r) => nflNumber(r, 'rushing_yards'),
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

// NBA (Oct 19 2026): the box score's own fields.
const NBA_ACTUAL = {
  pts: (r) => Number(r?.pts) || 0, reb: (r) => Number(r?.reb) || 0, ast: (r) => Number(r?.ast) || 0,
  threes: (r) => Number(r?.fg3m) || 0, pra: (r) => (Number(r?.pts) || 0) + (Number(r?.reb) || 0) + (Number(r?.ast) || 0),
};
const minutesPlayed = (r) => { const m = String(r?.min ?? '').split(':')[0]; return Number(m) || 0; };

/**
 * The feed's stat rows with each player's counts from the official box (Oct 27 2026 bug audit: six NBA darts were
 * graded on a count one off the official one, Gobert's 20 rebounds read 19; none turned a result yet). A row the official
 * box has no line for, or a game ESPN has no final box for, keeps the feed's counts.
 */
export async function withOfficialNbaCounts(game, rows, lines = null) {
  const official = lines || await espnPlayerLines(game).catch(() => null);
  if (!official) return rows;
  return (rows || []).map((r) => {
    const side = String(r?.team?.id) === String(game?.home_team?.id) ? 'home' : 'away';
    const o = officialLineFor(`${r?.player?.first_name || ''} ${r?.player?.last_name || ''}`.trim(), official.filter((x) => x.side === side));
    return o ? { ...r, ...Object.fromEntries(['pts', 'reb', 'ast', 'fg3m'].filter((k) => o[k] != null).map((k) => [k, o[k]])) } : r;
  });
}

/** Grade one NBA lean against its game and box score. A player who never got on the floor voids. null = not yet. */
export function gradeNbaDart(dart, game, statRows) {
  if (!game) return null;
  if (isOff(game.status)) return { result: 'void', actual: null };
  if (!isFinal(game.status)) return null;
  const measure = NBA_ACTUAL[dart.kind];
  const leg = dartLegs(dart.prop)[0];
  if (!measure || !leg) return null;
  const row = (statRows || []).find((r) => String(r?.player?.id ?? r?.player_id) === String(dart.player_id));
  if (!row || !(minutesPlayed(row) > 0)) return { result: 'void', actual: null };
  const actual = measure(row);
  return { result: clears(actual, leg.line, String(dart.bet || 'over').toLowerCase()) ? 'hit' : 'miss', actual };
}

/**
 * NBA darts graded again from the stored game records (Oct 29 2026 hunt, round 7): a dart was graded once, at the final,
 * on ESPN's box while it still settled, and the league's later corrections never reached it (Gobert's Oct 26 rebounds
 * stored 19, officially 20; LaMelo Ball's Oct 28 rebounds 4, officially 3). The records take the corrections the morning
 * after, the day after and a week after (ensureNbaRecords); a graded dart whose count differs from its game's record
 * takes the record's count and result. No feed calls. Never fatal to its caller.
 */
export async function regradeNbaDarts({ supabase, date, days = 8, console = globalThis.console }) {
  const from = new Date(Date.parse(`${date}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const { data: darts, error } = await supabase.from('darts').select('id,kind,prop,bet,game_id,player_id,actual,result')
    .eq('league', 'NBA').gte('game_date', from).lte('game_date', date).in('result', ['hit', 'miss']).is('scratched_at', null);
  if (error) throw error;
  const ids = [...new Set((darts || []).map((d) => d.game_id).filter((id) => id != null).map(String))];
  if (!ids.length) return { regraded: 0 };
  const { data: records, error: recError } = await supabase.from('game_records').select('game_id, record').eq('league', 'NBA').in('game_id', ids);
  if (recError) throw recError;
  const byGame = new Map((records || []).map((r) => [String(r.game_id), r.record]));
  let regraded = 0;
  for (const dart of darts) {
    const row = byGame.get(String(dart.game_id))?.players?.find((p) => String(p.id) === String(dart.player_id));
    const measure = NBA_ACTUAL[dart.kind], leg = dartLegs(dart.prop)[0];
    if (!row || !(row.min > 0) || !measure || !leg) continue;
    const actual = measure(row);
    const result = clears(actual, leg.line, String(dart.bet || 'over').toLowerCase()) ? 'hit' : 'miss';
    if (Number(dart.actual) === actual && dart.result === result) continue;
    const { error: writeError } = await supabase.from('darts').update({ actual, result }).eq('id', dart.id);
    if (writeError) throw writeError;
    console.log(`  🎯 NBA dart ${dart.id} (${dart.prop} ${dart.bet}): ${dart.actual} → ${actual} from the corrected box${result !== dart.result ? `, ${dart.result} → ${result}` : ''}`);
    regraded++;
  }
  return { regraded };
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
    if (!gameId || gameId === 'null' || !['MLB', 'NFL', 'NBA'].includes(league)) continue;
    try {
      const path = league === 'MLB' ? 'mlb/v1' : league === 'NBA' ? 'v1' : 'nfl/v1';
      const game = (await bdl(`${path}/games/${encodeURIComponent(gameId)}`, bdlApiKey)).data;
      if (!isFinal(game?.status) && !isOff(game?.status)) continue;
      const needsBox = group.some((dart) => dart.kind !== 'first_inning');
      const feed = needsBox && isFinal(game.status)
        ? await bdlAll(`${path}/stats?game_ids[]=${encodeURIComponent(gameId)}&per_page=100`, bdlApiKey)
        : [];
      const stats = league === 'NBA' && feed.length ? await withOfficialNbaCounts(game, feed) : feed;
      for (const dart of group) {
        const outcome = league === 'MLB' ? gradeMlbDart(dart, game, stats) : league === 'NBA' ? gradeNbaDart(dart, game, stats) : gradeNflDart(dart, game, stats);
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
