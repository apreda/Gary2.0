// THE PARLAY, LIVE (founder, Oct 28 2026: "instead of tracking the score, since score isn't really relevant to the
// bet, can we actually live track their stats to see how they're doing"): each player leg's count so far, read from
// its game's live stat feed on every live-score poll while the game is on, and once more as it goes final. The app
// draws it against the leg's line (get_parlay → progress). A leg whose player or stat cannot be read exactly gets no
// count, and the ticket keeps the score for it: a wrong count is worse than none.
import axios from 'axios';
import { bdlAll, dartLegs } from '../../src/services/gary/darts/dartsGrade.js';
import { findMlbSettlementPlayer, mlbPropActual } from '../../supabase/functions/_shared/mlbPropSettlement.js';
import { findNflSettlementPlayer, nflActualFromStatRow } from './resultsGradingReliability.js';

const STATS_PATH = { NBA: 'v1', MLB: 'mlb/v1', NFL: 'nfl/v1' };

// The NBA box's own fields for each prop name the desks write ("points_rebounds_assists 33.5", "player_threes 2.5").
const NBA_FIELDS = {
  points: ['pts'], rebounds: ['reb'], assists: ['ast'], steals: ['stl'], blocks: ['blk'],
  threes: ['fg3m'], three_pointers: ['fg3m'], three_pointers_made: ['fg3m'], pra: ['pts', 'reb', 'ast'],
  points_rebounds_assists: ['pts', 'reb', 'ast'], points_rebounds: ['pts', 'reb'], points_assists: ['pts', 'ast'],
  rebounds_assists: ['reb', 'ast'],
};

/** A leg the ticket can count: one player, one stat, one line. Null for a game leg, an inning dart or a two-stat prop. */
export function trackedLeg(leg, dart = null) {
  const snap = leg?.grade?.snapshot || {};
  if (dart?.kind === 'first_inning') return null;
  const player = dart?.player ?? snap.player;
  const parts = dartLegs(dart?.prop ?? snap.prop);
  const bet = String(dart?.bet ?? snap.bet ?? '').toLowerCase();
  if (!player || parts.length !== 1 || !STATS_PATH[leg?.league] || !leg?.game_id || !['over', 'under'].includes(bet)) return null;
  return {
    key: leg.key, league: leg.league, gameId: String(leg.game_id), player,
    playerId: dart?.player_id ?? snap.player_id ?? null, stat: parts[0].stat, line: parts[0].line, bet,
  };
}

/** The leg's count in its game's stat rows; null when the player has no row yet or the stat is not one we read. */
export function legCount(t, rows) {
  const lookup = t.league === 'NFL'
    ? findNflSettlementPlayer(rows || [], { playerId: t.playerId, name: t.player })
    : findMlbSettlementPlayer(rows || [], { playerId: t.playerId, name: t.player });
  const row = lookup?.row;
  if (!row) return null;
  if (t.league === 'MLB') return mlbPropActual(t.stat, row);
  if (t.league === 'NFL') return nflActualFromStatRow(row, t.stat);
  const fields = NBA_FIELDS[t.stat.replace(/^player_/, '')];
  return fields ? fields.reduce((sum, f) => sum + (Number(row[f]) || 0), 0) : null;
}

/**
 * Count the day's live player legs and store them (public.parlay_leg_live). `games` are this poll's score rows
 * (league, game_id, status). A leg is counted while its game is live and once when it is final. Never fatal.
 */
export async function trackParlayLegs({ date, games, supabaseUrl, serviceKey, bdlApiKey, log = console }) {
  if (!supabaseUrl || !serviceKey || !bdlApiKey) return { tracked: 0 };
  const rest = (method, path, data) => axios({
    method, url: `${supabaseUrl}/rest/v1/${path}`, data,
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=representation' },
  }).then((r) => r.data);
  try {
    const [ticket] = await rest('GET', `parlay_of_the_day?game_date=eq.${date}&select=legs`);
    const legs = Array.isArray(ticket?.legs) ? ticket.legs : [];
    if (!legs.length) return { tracked: 0 };
    const dartIds = legs.map((l) => String(l.key).match(/^dart:(\d+)$/)?.[1]).filter(Boolean);
    const darts = dartIds.length ? await rest('GET', `darts?id=in.(${dartIds.join(',')})&select=id,kind,player,player_id,prop,bet`) : [];
    const dartById = new Map(darts.map((d) => [String(d.id), d]));
    const stored = await rest('GET', `parlay_leg_live?game_date=eq.${date}&select=key,is_final`);
    const settled = new Set(stored.filter((r) => r.is_final).map((r) => r.key));
    const status = new Map((games || []).map((g) => [`${g.league}|${g.game_id}`, String(g.status || '').toLowerCase()]));

    const due = legs
      .map((l) => trackedLeg(l, dartById.get(String(l.key).match(/^dart:(\d+)$/)?.[1])))
      .filter((t) => t && !settled.has(t.key) && ['live', 'final'].includes(status.get(`${t.league}|${t.gameId}`)));
    if (!due.length) return { tracked: 0 };

    const rows = [];
    for (const gameKey of new Set(due.map((t) => `${t.league}|${t.gameId}`))) {
      const [league, gameId] = gameKey.split('|');
      const stats = await bdlAll(`${STATS_PATH[league]}/stats?game_ids[]=${encodeURIComponent(gameId)}&per_page=100`, bdlApiKey)
        .catch((e) => { log.warn(`[parlay live] ${league} ${gameId}: ${e.message}`); return null; });
      if (!stats) continue;
      for (const t of due.filter((x) => `${x.league}|${x.gameId}` === gameKey)) {
        const actual = legCount(t, stats);
        if (actual == null || !Number.isFinite(Number(actual))) continue;
        rows.push({ game_date: date, key: t.key, actual: Number(actual), line: t.line, bet: t.bet,
          is_final: status.get(gameKey) === 'final', updated_at: new Date().toISOString() });
      }
    }
    if (rows.length) await rest('POST', 'parlay_leg_live?on_conflict=game_date,key', rows);
    if (rows.length) log.log(`🎟️ parlay live: ${rows.map((r) => `${r.key} ${r.actual}/${r.line}`).join(', ')}`);
    return { tracked: rows.length };
  } catch (e) {
    log.warn(`[parlay live] ${date}: ${e.response?.data ? JSON.stringify(e.response.data) : e.message}`);
    return { tracked: 0 };
  }
}
