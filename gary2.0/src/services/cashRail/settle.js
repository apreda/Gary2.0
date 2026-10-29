/**
 * Cash Rail settlement (Oct 29 2026): turns a game's BDL plays plus its frozen
 * pregame price board (prices.js) into the bets the game has already cashed.
 * Pure and idempotent: the worker re-runs it over every play on each poll, so
 * a play the league takes back simply stops producing its hit.
 *
 * A yardage or count ladder (one player's receiving yards, receptions…) folds
 * into ONE hit whose rungs climb; touchdowns, first TD and game lines are one
 * hit each. Nothing pending, nothing under, ever.
 */

const MARKET_NAMES = {
  receiving_yards: 'Rec yards', rushing_yards: 'Rush yards', passing_yards: 'Pass yards',
  rushing_receiving_yards: 'Rush + rec yards', receptions: 'Receptions', passing_tds: 'Pass TDs',
  passing_completions: 'Completions', passing_attempts: 'Pass attempts', rushing_attempts: 'Rush attempts',
  interceptions: 'Interceptions thrown', longest_reception: 'Longest catch', longest_rush: 'Longest run',
  longest_pass: 'Longest completion',
};
const WINDOW_LABEL = { _1q: '1st quarter', _1h: '1st half', _2h: '2nd half' };
const IN_WINDOW = { '': () => true, _1q: p => p === 1, _1h: p => p <= 2, _2h: p => p >= 3 };
const SCORER_TYPES = ['receiver', 'rusher', 'interception_returner', 'kickoff_returner', 'punt_returner',
  'fumble_recoverer', 'recoverer', 'returner', 'blocked_kick_recoverer'];
const MINUS = '−';

const splitWindow = propType => {
  const w = Object.keys(WINDOW_LABEL).find(s => propType.endsWith(s));
  return w ? { base: propType.slice(0, -w.length), window: w } : { base: propType, window: '' };
};
const clockSecs = c => {
  const [m, s] = String(c || '0:00').split(':').map(Number);
  return (Number.isFinite(m) ? m : 0) * 60 + (Number.isFinite(s) ? s : 0);
};
const elapsedOf = p => (p.period <= 4
  ? (p.period - 1) * 900 + (900 - clockSecs(p.clock_display))
  : 3600 + (p.period - 5) * 600 + (600 - clockSecs(p.clock_display)));
const whenOf = p => (p.period <= 4 ? `Q${p.period} ${p.clock_display}` : `OT ${p.clock_display}`);
const ordinal = n => `${n}${(n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')}`;
const minusSign = s => String(s).replace(/^-/, MINUS);
const ids = (p, type) => (p.participants || []).filter(x => x.type === type).map(x => x.player_id);

/** The stat lines one play adds: [playerId, stat, value, 'add'|'max']. */
function statLines(p) {
  const slug = p.type_slug || '';
  const y = Number(p.stat_yardage) || 0;
  const out = [];
  const td = Boolean(p.scoring_play) && slug.includes('touchdown');
  if (slug === 'pass-reception' || slug === 'passing-touchdown') {
    for (const r of ids(p, 'receiver')) {
      out.push([r, 'receiving_yards', y, 'add'], [r, 'receptions', 1, 'add'], [r, 'longest_reception', y, 'max'], [r, 'rushing_receiving_yards', y, 'add']);
    }
    for (const q of ids(p, 'passer')) {
      out.push([q, 'passing_yards', y, 'add'], [q, 'passing_completions', 1, 'add'], [q, 'passing_attempts', 1, 'add'], [q, 'longest_pass', y, 'max']);
      if (td) out.push([q, 'passing_tds', 1, 'add']);
    }
  } else if (slug === 'pass-incompletion') {
    for (const q of ids(p, 'passer')) out.push([q, 'passing_attempts', 1, 'add']);
  } else if (slug.includes('interception')) {
    for (const q of ids(p, 'passer')) out.push([q, 'interceptions', 1, 'add'], [q, 'passing_attempts', 1, 'add']);
  } else if (slug === 'rush' || slug === 'rushing-touchdown') {
    for (const r of ids(p, 'rusher')) {
      out.push([r, 'rushing_yards', y, 'add'], [r, 'rushing_attempts', 1, 'add'], [r, 'longest_rush', y, 'max'], [r, 'rushing_receiving_yards', y, 'add']);
    }
  }
  if (td) {
    const scorer = (slug === 'passing-touchdown' ? ids(p, 'receiver') : [])[0]
      ?? (p.participants || []).find(x => SCORER_TYPES.includes(x.type))?.player_id;
    if (scorer != null) out.push([scorer, 'tds', 1, 'add']);
  }
  return out;
}

function playText(base, p, cum) {
  const y = Number(p.stat_yardage) || 0;
  const slug = p.type_slug || '';
  const run = slug.startsWith('rush');
  switch (base) {
    case 'receiving_yards': return `${y}-yd catch · ${cum} yds`;
    case 'rushing_yards': return `${y}-yd run · ${cum} yds`;
    case 'rushing_receiving_yards': return `${y}-yd ${run ? 'run' : 'catch'} · ${cum} yds`;
    case 'passing_yards': return `${cum} pass yds`;
    case 'receptions': return `${ordinal(cum)} catch of the night`;
    case 'passing_completions': return `${ordinal(cum)} completion`;
    case 'passing_attempts': return `${ordinal(cum)} pass attempt`;
    case 'rushing_attempts': return `${ordinal(cum)} carry`;
    case 'passing_tds': return `${ordinal(cum)} TD pass`;
    case 'interceptions': return `${ordinal(cum)} interception thrown`;
    case 'longest_reception': return `${y}-yd catch`;
    case 'longest_rush': return `${y}-yd run`;
    case 'longest_pass': return `${y}-yd completion`;
    default: return p.short_text || '';
  }
}

function tdText(p) {
  const y = Number(p.stat_yardage) || 0;
  const slug = p.type_slug || '';
  if (slug === 'passing-touchdown') return `${y}-yd TD catch`;
  if (slug === 'rushing-touchdown') return `${y}-yd TD run`;
  if (slug.includes('interception')) return 'Interception returned for a TD';
  if (slug.includes('kickoff') || slug.includes('punt')) return 'Return for a TD';
  return p.short_text || 'Touchdown';
}

function tdMarketName(line, window) {
  const n = Number(line);
  const base = n <= 1 ? 'Anytime TD' : `${n}+ TDs`;
  return window ? `${base} · ${WINDOW_LABEL[window]}` : base;
}

/**
 * @param {{markets: object[], plays: object[], game: object, players: Record<string,string>,
 *          garyPick: {type:'spread'|'ml'|'total', side?:'home'|'away'|'over', line?:number}|null}} input
 * @returns {{hits: object[], possession: string|null, situation: string|null, elapsed_s: number, clock: string, status: string}}
 */
export function settleNfl({ markets = [], plays = [], game = {}, players = {}, garyPick = null }) {
  const ordered = plays
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => Number.isFinite(p.period) && p.period >= 1)
    .sort((a, b) => (elapsedOf(a.p) - elapsedOf(b.p)) || (a.i - b.i))
    .map(({ p }) => p);

  const byPlayer = new Map();
  for (const m of markets) {
    if (m.playerId == null) continue;
    if (!byPlayer.has(m.playerId)) byPlayer.set(m.playerId, []);
    byPlayer.get(m.playerId).push(m);
  }

  const cum = new Map(); // `${pid}|${stat}|${window}` → value
  const cashed = new Map(); // market key → { play, value }
  let firstTd = null;
  let totalCash = new Map(); // game total market key → play

  for (const p of ordered) {
    for (const [pid, stat, value, mode] of statLines(p)) {
      for (const w of Object.keys(IN_WINDOW)) {
        if (!IN_WINDOW[w](p.period)) continue;
        const k = `${pid}|${stat}|${w}`;
        const before = cum.get(k) ?? 0;
        cum.set(k, mode === 'max' ? Math.max(before, value) : before + value);
      }
      if (stat === 'tds' && !firstTd) firstTd = { pid, p };
      for (const m of byPlayer.get(pid) || []) {
        if (cashed.has(m.key)) continue;
        const { base, window } = splitWindow(m.propType);
        if (!IN_WINDOW[window](p.period)) continue;
        if (base === 'first_td') {
          if (firstTd && firstTd.p === p && firstTd.pid === pid) cashed.set(m.key, { play: p, value: 1 });
          continue;
        }
        const stat2 = base === 'anytime_td' ? 'tds' : base;
        if (stat2 !== stat) continue;
        const v = cum.get(`${pid}|${stat2}|${window}`) ?? 0;
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
  const final = game.status_state === 'final' || ordered.some(p => p.type_slug === 'end-of-game');
  const finalElapsed = Math.max(3600, last ? elapsedOf(last) : 0);
  const homeName = game.home_team?.name || 'Home';
  const awayName = game.visitor_team?.name || 'Away';
  const isGary = key => {
    if (!garyPick) return false;
    if (garyPick.type === 'spread') return key === `game|spread|${garyPick.side}|${garyPick.line}`;
    if (garyPick.type === 'ml') return key === `game|ml|${garyPick.side}`;
    if (garyPick.type === 'total') return key === `game|total|over|${garyPick.line}`;
    return false;
  };
  const withGary = (key, h) => (isGary(key) ? { ...h, gary: true } : h);

  const hits = [];
  // Ladders: one hit per player + prop type, rungs low → high.
  const ladders = new Map();
  for (const m of markets) {
    if (m.playerId == null || !cashed.has(m.key)) continue;
    const { base, window } = splitWindow(m.propType);
    const name = players[m.playerId];
    if (!name) continue;
    if (base === 'first_td' || base === 'anytime_td') {
      const c = cashed.get(m.key);
      const key = base === 'first_td' ? `${m.playerId}|${m.propType}` : `${m.playerId}|${m.propType}|${m.line}`;
      hits.push({ key, who: name, market: base === 'first_td' ? 'First TD scorer' : tdMarketName(m.line, window),
        price: m.price, elapsed: elapsedOf(c.play), when: whenOf(c.play), play: tdText(c.play) });
      continue;
    }
    const lk = `${m.playerId}|${m.propType}`;
    if (!ladders.has(lk)) ladders.set(lk, { name, base, window, rungs: [] });
    ladders.get(lk).rungs.push({ m, c: cashed.get(m.key) });
  }
  for (const [key, l] of ladders) {
    l.rungs.sort((a, b) => (a.m.line - b.m.line) || (a.m.kind === 'over' ? -1 : 1));
    const top = l.rungs[l.rungs.length - 1];
    const market = MARKET_NAMES[l.base] + (l.window ? ` · ${WINDOW_LABEL[l.window]}` : '');
    hits.push({ key, who: l.name, market, price: top.m.price,
      rungs: l.rungs.map(r => ({ label: r.m.label, price: r.m.price })),
      elapsed: elapsedOf(top.c.play), when: whenOf(top.c.play), play: playText(l.base, top.c.play, top.c.value) });
  }

  // Game lines.
  for (const [key, c] of totalCash) {
    const m = markets.find(x => x.key === key);
    hits.push(withGary(key, { key, who: 'Game total', market: `Over ${m.line}`, price: m.price,
      elapsed: elapsedOf(c.play), when: whenOf(c.play), play: `Made it ${c.pts} points` }));
  }
  if (final) {
    const home = Number(game.home_team_score ?? last?.home_score) || 0;
    const away = Number(game.visitor_team_score ?? last?.away_score) || 0;
    const finalText = `Final ${Math.max(home, away)}–${Math.min(home, away)}`;
    for (const m of markets) {
      const side = m.propType.endsWith('_home') ? 'home' : m.propType.endsWith('_away') ? 'away' : null;
      if (!side) continue;
      const margin = side === 'home' ? home - away : away - home;
      const who = side === 'home' ? homeName : awayName;
      if (m.kind === 'spread' && margin + m.line > 0) {
        hits.push(withGary(m.key, { key: m.key, who, market: `Spread ${minusSign(m.label)}`, price: m.price,
          elapsed: finalElapsed, when: 'FINAL', play: finalText }));
      } else if (m.kind === 'ml' && margin > 0) {
        hits.push(withGary(m.key, { key: m.key, who, market: 'Moneyline', price: m.price,
          elapsed: finalElapsed, when: 'FINAL', play: finalText }));
      }
    }
  }
  hits.sort((a, b) => (a.elapsed - b.elapsed) || a.key.localeCompare(b.key));

  // The game's state from the last play.
  const lastWithTeam = [...ordered].reverse().find(p => p.team?.abbreviation);
  const lastDown = [...ordered].reverse().find(p => p.end_down_distance_text);
  let clock = 'Q1 15:00';
  if (final) clock = 'FINAL';
  else if (last?.type_slug === 'end-period') clock = `END Q${last.period}`;
  else if (last?.type_slug === 'end-of-half') clock = 'HALF';
  else if (last) clock = whenOf(last);

  return {
    hits,
    possession: final ? null : lastWithTeam?.team?.abbreviation ?? null,
    situation: final || !lastDown ? null : lastDown.end_down_distance_text.toUpperCase().replace(' AT ', ' · '),
    elapsed_s: final ? finalElapsed : (last ? elapsedOf(last) : 0),
    clock,
    status: final ? 'final' : 'live',
  };
}
