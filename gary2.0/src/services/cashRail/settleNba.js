/**
 * Cash Rail settlement for the NBA (Oct 30 2026, founder: "the new scoreboard feature of course has to work
 * for all sports not just NFL"). The same board as the NFL's (settle.js): bets already cashed, at their
 * frozen pregame prices, one ladder per player and stat, game lines at the final. Nothing under, ever.
 *
 * Stats come from BDL's NBA play-by-play: a made shot credits its shooter (named first) with its points, a
 * three with a three, and the passer named second with an assist; a rebound credits the player named first;
 * a steal or a block the player named second. Team rebounds name nobody and credit nobody.
 */
import { gameLineHits } from './gameLines.js';

const MARKET_NAMES = {
  points: 'Points', rebounds: 'Rebounds', assists: 'Assists', threes: 'Threes', steals: 'Steals', blocks: 'Blocks',
  points_rebounds_assists: 'Pts + reb + ast', points_rebounds: 'Pts + reb', points_assists: 'Pts + ast',
  rebounds_assists: 'Reb + ast', double_double: 'Double-double', triple_double: 'Triple-double',
};
const COMBOS = {
  points_rebounds_assists: ['points', 'rebounds', 'assists'], points_rebounds: ['points', 'rebounds'],
  points_assists: ['points', 'assists'], rebounds_assists: ['rebounds', 'assists'],
};
const DOUBLE_STATS = ['points', 'rebounds', 'assists', 'steals', 'blocks'];
const WORDS = { threes: 'three', rebounds: 'rebound', assists: 'assist', steals: 'steal', blocks: 'block' };

/** True for an NBA prop type the board can grade from plays (full-game only, no quarter or minute windows). */
export const nbaSettleable = propType => Object.hasOwn(MARKET_NAMES, propType);

const clockSecs = c => {
  const s = String(c ?? '0');
  if (!s.includes(':')) return Number(s) || 0; // under a minute BDL sends seconds: "34.5"
  const [m, sec] = s.split(':').map(Number);
  return (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(sec) ? sec : 0);
};
const clockText = c => {
  const t = Math.floor(clockSecs(c));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
const elapsedOf = p => (p.period <= 4
  ? (p.period - 1) * 720 + (720 - clockSecs(p.clock))
  : 2880 + (p.period - 5) * 300 + (300 - clockSecs(p.clock)));
const periodName = n => (n <= 4 ? `Q${n}` : n === 5 ? 'OT' : `${n - 4}OT`);
const whenOf = p => `${periodName(p.period)} ${clockText(p.clock)}`;
const ordinal = n => `${n}${(n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;

/** The stat lines one play adds: [playerId, stat, value]. */
function statLines(p) {
  const ids = p.participants || [];
  const text = String(p.text || '');
  const out = [];
  if (p.scoring_play && ids[0] != null) {
    const v = Number(p.score_value) || 0;
    out.push([ids[0], 'points', v]);
    if (v === 3) out.push([ids[0], 'threes', 1]);
    if (/ assists\)/.test(text) && ids[1] != null) out.push([ids[1], 'assists', 1]);
  }
  if (/Rebound/.test(p.type || '') && ids[0] != null) out.push([ids[0], 'rebounds', 1]);
  if (/ steals\)/.test(text) && ids[1] != null) out.push([ids[1], 'steals', 1]);
  if (/ blocks /.test(text) && ids[1] != null) out.push([ids[1], 'blocks', 1]);
  return out;
}

const inOrder = plays => plays
  .filter(p => Number.isFinite(p.period) && p.period >= 1)
  .map((p, i) => ({ p, i }))
  .sort((a, b) => ((a.p.order ?? a.i) - (b.p.order ?? b.i)) || (a.i - b.i))
  .map(({ p }) => p);

/** Each player's totals from the plays so far: `${pid}|${stat}` → value. */
export function nbaPlayerTotals(plays = []) {
  const totals = new Map();
  for (const p of inOrder(plays)) {
    for (const [pid, stat, v] of statLines(p)) totals.set(`${pid}|${stat}`, (totals.get(`${pid}|${stat}`) ?? 0) + v);
  }
  return totals;
}

function playText(base, p, cum) {
  if (base === 'points') {
    const v = Number(p.score_value);
    return `${v === 3 ? 'Three' : v === 1 ? 'Free throw' : 'Bucket'} · ${cum} pts`;
  }
  if (WORDS[base]) return `${ordinal(cum)} ${WORDS[base]}`;
  if (base === 'double_double') return 'Double-double';
  if (base === 'triple_double') return 'Triple-double';
  return `${cum} total`;
}

/**
 * @param {{markets: object[], plays: object[], game: object, players: Record<string,string>, garyPick: object|null}} input
 * @returns {{hits: object[], possession: null, situation: null, elapsed_s: number, clock: string, status: string}}
 */
export function settleNba({ markets = [], plays = [], game = {}, players = {}, garyPick = null }) {
  const ordered = inOrder(plays);
  const byPlayer = new Map();
  for (const m of markets) {
    if (m.playerId == null) continue;
    if (!byPlayer.has(String(m.playerId))) byPlayer.set(String(m.playerId), []);
    byPlayer.get(String(m.playerId)).push(m);
  }

  const cum = new Map();
  const get = (pid, stat) => cum.get(`${pid}|${stat}`) ?? 0;
  const valueOf = (pid, base) => {
    if (COMBOS[base]) return COMBOS[base].reduce((s, st) => s + get(pid, st), 0);
    if (base === 'double_double') return DOUBLE_STATS.filter(st => get(pid, st) >= 10).length >= 2 ? 1 : 0;
    if (base === 'triple_double') return DOUBLE_STATS.filter(st => get(pid, st) >= 10).length >= 3 ? 1 : 0;
    return get(pid, base);
  };
  const cashed = new Map(); // market key → { play, value }
  const totalCash = new Map();

  for (const p of ordered) {
    const touched = new Set();
    for (const [pid, stat, v] of statLines(p)) {
      cum.set(`${pid}|${stat}`, get(pid, stat) + v);
      touched.add(String(pid));
    }
    for (const pid of touched) {
      for (const m of byPlayer.get(pid) || []) {
        if (cashed.has(m.key)) continue;
        const v = valueOf(pid, m.propType);
        if (m.kind === 'milestone' ? v >= m.line : v > m.line) cashed.set(m.key, { play: p, value: v });
      }
    }
    if (p.scoring_play) {
      const pts = (Number(p.away_score) || 0) + (Number(p.home_score) || 0);
      for (const m of markets) {
        if (m.propType === 'game_total' && !totalCash.has(m.key) && pts > m.line) totalCash.set(m.key, { play: p, pts });
      }
    }
  }

  const last = ordered[ordered.length - 1];
  const final = game.status_state === 'final';
  const finalElapsed = Math.max(2880, last ? elapsedOf(last) : 0);

  const hits = [];
  const ladders = new Map();
  for (const m of markets) {
    if (m.playerId == null || !cashed.has(m.key)) continue;
    const name = players[m.playerId];
    if (!name) continue;
    const lk = `${m.playerId}|${m.propType}`;
    if (!ladders.has(lk)) ladders.set(lk, { name, base: m.propType, rungs: [] });
    ladders.get(lk).rungs.push({ m, c: cashed.get(m.key) });
  }
  for (const [key, l] of ladders) {
    l.rungs.sort((a, b) => (a.m.line - b.m.line) || (a.m.kind === 'over' ? -1 : 1));
    const top = l.rungs[l.rungs.length - 1];
    hits.push({ key, who: l.name, market: MARKET_NAMES[l.base], price: top.m.price,
      rungs: l.rungs.map(r => ({ label: r.m.label, price: r.m.price })),
      elapsed: elapsedOf(top.c.play), when: whenOf(top.c.play), play: playText(l.base, top.c.play, top.c.value) });
  }
  hits.push(...gameLineHits({ markets, totalCash, final, garyPick, finalElapsed, elapsedOf, whenOf,
    homeName: game.home_team?.name || 'Home', awayName: game.visitor_team?.name || 'Away',
    home: Number(game.home_team_score ?? last?.home_score) || 0,
    away: Number(game.visitor_team_score ?? last?.away_score) || 0 }));
  hits.sort((a, b) => (a.elapsed - b.elapsed) || a.key.localeCompare(b.key));

  let clock = 'Q1 12:00';
  if (final) clock = 'FINAL';
  else if (last && /End Period/i.test(last.type || '')) clock = last.period === 2 ? 'HALF' : `END ${periodName(last.period)}`;
  else if (last) clock = whenOf(last);

  return {
    hits,
    possession: null,
    situation: null,
    elapsed_s: final ? finalElapsed : (last ? elapsedOf(last) : 0),
    clock,
    status: final ? 'final' : 'live',
  };
}
