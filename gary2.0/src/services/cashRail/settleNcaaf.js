/**
 * Cash Rail settlement for college football (Oct 30 2026, founder: the scoreboard "has to work for all
 * sports"). The same board as the NFL's (settle.js), with one difference: BDL's college plays name players
 * only in text, so player bets settle from the live box score (player_stats, by player id), and a bet is
 * timed when the board first sees it cash, a time carried on every pass after (`prior`). The game total
 * cashes on the scoring play that took it over; spreads and moneylines at the final.
 */
import { gameLineHits } from './gameLines.js';
import { MARKET_NAMES, tdMarketName } from './settle.js';

/** Each gradeable prop type, read off a player's box score row. */
const STAT = {
  anytime_td: s => (s.rushing_touchdowns || 0) + (s.receiving_touchdowns || 0),
  passing_yards: s => s.passing_yards,
  passing_tds: s => s.passing_touchdowns,
  interceptions: s => s.passing_interceptions,
  rushing_yards: s => s.rushing_yards,
  receiving_yards: s => s.receiving_yards,
  receptions: s => s.receptions,
  rushing_receiving_yards: s => (s.rushing_yards || 0) + (s.receiving_yards || 0),
  longest_reception: s => s.receiving_long,
  longest_rush: s => s.rushing_long,
};

/** True for a college prop type the board can grade from the box score. */
export const ncaafSettleable = propType => Object.hasOwn(STAT, propType);

const clockSecs = c => {
  const [m, s] = String(c || '0:00').split(':').map(Number);
  return (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0);
};
const elapsedAt = (period, clock) => (period <= 4
  ? (period - 1) * 900 + (900 - clockSecs(clock))
  : 3600 + (period - 5) * 600 + (600 - clockSecs(clock)));
const whenAt = (period, clock) => `${period <= 4 ? `Q${period}` : 'OT'} ${clock || '0:00'}`;
const elapsedOf = p => elapsedAt(p.period, p.clock);
const whenOf = p => whenAt(p.period, p.clock);

function statText(base, v) {
  if (base.endsWith('_yards')) return `${v} yds`;
  if (base === 'receptions') return `${v} catches`;
  if (base === 'passing_tds') return `${v} TD passes`;
  if (base === 'interceptions') return `${v} picks thrown`;
  if (base.startsWith('longest_')) return `${v}-yd long`;
  return String(v);
}

/**
 * @param {{markets: object[], plays: object[], stats: object[], game: object, players: Record<string,string>,
 *          garyPick: object|null, prior?: object[]}} input `prior` = the board's hits from the last pass
 * @returns {{hits: object[], possession: null, situation: null, elapsed_s: number, clock: string, status: string}}
 */
export function settleNcaaf({ markets = [], plays = [], stats = [], game = {}, players = {}, garyPick = null, prior = [] }) {
  const final = game.status_state === 'final';
  const nowElapsed = final ? 3600 : elapsedAt(game.period || 1, game.time);
  const nowWhen = final ? 'FINAL' : whenAt(game.period || 1, game.time);
  const before = new Map((prior || []).map(h => [h.key, h]));
  // A bet keeps the time it was first seen at, as long as it still reads the same.
  const timed = (h, same = b => true) => {
    const b = before.get(h.key);
    return b && same(b) ? { ...h, elapsed: b.elapsed, when: b.when } : { ...h, elapsed: nowElapsed, when: nowWhen };
  };

  const box = new Map(stats.map(s => [String(s.player?.id), s]));
  const hits = [];
  const ladders = new Map();
  for (const m of markets) {
    if (m.playerId == null) continue;
    const name = players[m.playerId];
    const s = box.get(String(m.playerId));
    if (!name || !s) continue;
    const v = Number(STAT[m.propType]?.(s));
    if (!Number.isFinite(v) || !(m.kind === 'milestone' ? v >= m.line : v > m.line)) continue;
    if (m.propType === 'anytime_td') {
      hits.push(timed({ key: `${m.playerId}|anytime_td|${m.line}`, who: name, market: tdMarketName(m.line, ''),
        price: m.price, play: v === 1 ? 'Scored' : `${v} TDs` }));
      continue;
    }
    const lk = `${m.playerId}|${m.propType}`;
    if (!ladders.has(lk)) ladders.set(lk, { name, base: m.propType, v, rungs: [] });
    ladders.get(lk).rungs.push(m);
  }
  for (const [key, l] of ladders) {
    l.rungs.sort((a, b) => (a.line - b.line) || (a.kind === 'over' ? -1 : 1));
    const top = l.rungs[l.rungs.length - 1];
    hits.push(timed({ key, who: l.name, market: MARKET_NAMES[l.base], price: top.price,
      rungs: l.rungs.map(r => ({ label: r.label, price: r.price })), play: statText(l.base, l.v) },
    b => b.price === top.price));
  }

  const totalCash = new Map();
  const ordered = [...plays].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const p of ordered) {
    if (!p.scoring_play) continue;
    const pts = (Number(p.home_score) || 0) + (Number(p.away_score) || 0);
    for (const m of markets) {
      if (m.propType === 'game_total' && !totalCash.has(m.key) && pts > m.line) totalCash.set(m.key, { play: p, pts });
    }
  }
  hits.push(...gameLineHits({ markets, totalCash, final, garyPick, finalElapsed: 3600, elapsedOf, whenOf,
    homeName: game.home_team?.name || 'Home', awayName: game.visitor_team?.name || 'Away',
    home: Number(game.home_score) || 0, away: Number(game.away_score) || 0 }));
  hits.sort((a, b) => (a.elapsed - b.elapsed) || a.key.localeCompare(b.key));

  return { hits, possession: null, situation: null, elapsed_s: nowElapsed, clock: nowWhen, status: final ? 'final' : 'live' };
}
