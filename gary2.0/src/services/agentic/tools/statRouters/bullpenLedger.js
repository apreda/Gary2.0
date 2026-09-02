/**
 * Bullpen-ledger helpers (Aug 17 2026, founder-authorized Aug 15 KC fix).
 *
 * Two defects lived inline in MLB_BULLPEN_WORKLOAD:
 *  - Ledger dates came from the UTC `gameDate` instant, so any 8pm+ ET game
 *    was stamped with the NEXT day's date. `officialDate` is MLB's own
 *    calendar date for the game and is authoritative.
 *  - Relievers were "everyone after pitchers[0]" with no position check, so a
 *    position player mopping up a blowout inflated the pen's arms-used count.
 */

import { etDateStr } from '../../../insights/shared.js';

/**
 * The official calendar date a game belongs to. Prefers MLB's `officialDate`;
 * falls back to the ET calendar date of the UTC start instant. Never a raw
 * UTC slice, and never an invented date.
 * @param {{ officialDate?: string, gameDate?: string } | null | undefined} game
 */
export function bullpenLedgerDate(game) {
  const official = String(game?.officialDate ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(official)) return official;
  if (game?.gameDate) return etDateStr(game.gameDate);
  return null;
}

/** Boxscore position codes that mean "this player is actually a pitcher".
 *  '1' = P; 'Y' / 'TWP' = two-way player (may legitimately pitch). */
function isPitcherPosition(position) {
  if (!position || (position.code == null && !position.abbreviation)) {
    // Absence of position data is not evidence of a position player — fail
    // open so a malformed record never hides real pen workload.
    return true;
  }
  const code = String(position.code ?? '');
  const abbr = String(position.abbreviation ?? '').toUpperCase();
  return code === '1' || code === 'Y' || abbr === 'P' || abbr === 'TWP';
}

/**
 * Relief appearances from one boxscore side, in appearance order.
 * pitchers[0] is the starter (appearance order); everyone after is relief —
 * but only entries whose box record is actually a pitcher count as pen arms.
 * @param {{ pitchers?: unknown, players?: Record<string, any> } | null | undefined} side
 * @returns {Array<{ pid: number, player: any }>}
 */
export function relieverBoxEntries(side) {
  const pitcherIds = Array.isArray(side?.pitchers) ? side.pitchers : [];
  const players = side?.players || {};
  const entries = [];
  for (const pid of pitcherIds.slice(1)) {
    const player = players[`ID${pid}`];
    if (!player) continue;
    if (!isPitcherPosition(player.position)) continue;
    entries.push({ pid, player });
  }
  return entries;
}

// (The Aug-26 pen-window composition and leverage-arms devices were retired
// the same day they shipped — founder duplication audit: composed prose
// restated the appearance ledger, and the game stories carry the pen's
// narrative. outsToIp stays: the ledger's own arithmetic.)

/** Outs → MLB "X.Y" innings string (Y = leftover outs). */
export function outsToIp(outs) {
  const o = Math.max(0, Math.trunc(Number(outs) || 0));
  return `${Math.floor(o / 3)}.${o % 3}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EVERY ARM, NEWEST WORK FIRST (founder GO, Sep 2 2026)
//
// The pen used to reach Gary as a season object: full-season lines for the
// arms BDL listed under the club's stint, a season unit ERA, and recency
// only as unit rollups. The Sep 1 Red Sox desk printed four arms while the
// active roster carried eight relievers — Gamboa (opened a game), Miller
// and Morán (under 3 IP with the club) and Bello (a starter used as the
// bulk arm) were all missing, and the "pen as a unit" line was built from
// the four. These helpers make each reliever read like a starter: his last
// outings, when he last pitched and how many pitches, his week, then his
// season. Facts only — availability is the brain's read off the dates.
// ═══════════════════════════════════════════════════════════════════════════

const TWO_WORD_CLUBS = /\b(Blue Jays|Red Sox|White Sox)$/;

/** "New York Yankees" → "Yankees"; "Boston Red Sox" → "Red Sox". */
export function clubNick(name) {
  const two = String(name || '').match(TWO_WORD_CLUBS);
  return two ? two[1] : String(name || '?').trim().split(' ').pop();
}

/** MLB "X.Y" innings string → outs (Y = leftover outs). */
export function ipToOuts(ip) {
  const n = parseFloat(ip);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n) * 3 + Math.round((n % 1) * 10);
}

/** Calendar-day shift on a YYYY-MM-DD string. */
export function shiftDate(date, days) {
  const t = new Date(`${date}T12:00:00Z`).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + days * 86400000).toISOString().slice(0, 10);
}

/** Whole days from `fromDate` to `toDate` (both YYYY-MM-DD); null on bad input. */
export function daysBetween(fromDate, toDate) {
  const a = new Date(`${fromDate}T12:00:00Z`).getTime();
  const b = new Date(`${toDate}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * One pitcher's season, read from his official game log (regular season
 * only — the preseason law). Pure; `todayEt` is the desk's calendar date.
 */
export function summarizeRelieverLog(splits = [], todayEt = null) {
  const rows = (splits || [])
    .filter((g) => g?.date && (g.gameType == null || g.gameType === 'R'))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const sum = { g: rows.length, gs: 0, reliefG: 0, outs: 0, er: 0, h: 0, bb: 0, k: 0, sv: 0, hld: 0, bs: 0 };
  const relief = [];
  const pitchesByDate = new Map();
  for (const r of rows) {
    const s = r.stat || {};
    const gs = Number(s.gamesStarted) || 0;
    sum.gs += gs;
    sum.outs += ipToOuts(s.inningsPitched);
    sum.er += Number(s.earnedRuns) || 0;
    sum.h += Number(s.hits) || 0;
    sum.bb += Number(s.baseOnBalls) || 0;
    sum.k += Number(s.strikeOuts) || 0;
    sum.sv += Number(s.saves) || 0;
    sum.hld += Number(s.holds) || 0;
    sum.bs += Number(s.blownSaves) || 0;
    if (!gs) { sum.reliefG += 1; relief.push(r); }
    const p = Number(s.numberOfPitches) || 0;
    pitchesByDate.set(r.date, (pitchesByDate.get(r.date) || 0) + p);
  }
  const last = rows[rows.length - 1] || null;
  const lastRelief = relief[relief.length - 1] || null;
  const daysSinceLast = last && todayEt ? daysBetween(last.date, todayEt) : null;
  const daysSinceRelief = lastRelief && todayEt ? daysBetween(lastRelief.date, todayEt) : null;
  const last7 = { g: 0, outs: 0, er: 0, pitches: 0 };
  if (todayEt) {
    for (const r of rows) {
      const d = daysBetween(r.date, todayEt);
      if (d == null || d < 0 || d > 7) continue;
      last7.g += 1;
      last7.outs += ipToOuts(r.stat?.inningsPitched);
      last7.er += Number(r.stat?.earnedRuns) || 0;
      last7.pitches += Number(r.stat?.numberOfPitches) || 0;
    }
  }
  return {
    ...sum,
    rows,
    last,
    lastRelief,
    lastWasStart: Boolean(last && (Number(last.stat?.gamesStarted) || 0) > 0),
    daysSinceLast,
    daysSinceRelief,
    last3: rows.slice(-3).reverse(),
    last7,
    pitchesByDate,
  };
}

/**
 * Is this roster pitcher a pen arm tonight? A pure reliever always is. A
 * pitcher with starts on his record counts only while he is being used in
 * relief — a relief appearance in the last 14 days and his latest outing
 * not a start (tonight's starter, and the rotation, never print here).
 */
export function isPenArm(sum) {
  if (!sum || !sum.g || !sum.reliefG) return false;
  if (sum.gs === 0) return true;
  if (sum.lastWasStart) return false;
  return sum.daysSinceRelief != null && sum.daysSinceRelief >= 0 && sum.daysSinceRelief <= 14;
}

/** One outing from the game log: "08-31 vs Mariners, 1.0 IP, 0 H, 0 ER, 0 BB, 2 K, 15 p (HLD)". */
export function renderOuting(r) {
  const s = r?.stat || {};
  const where = r?.isHome === false ? '@' : 'vs';
  const bits = [
    `${String(r?.date || '').slice(5)} ${where} ${clubNick(r?.opponent?.name)}`,
    `${s.inningsPitched ?? '?'} IP`,
    `${Number(s.hits) || 0} H`,
    `${Number(s.earnedRuns) || 0} ER`,
    `${Number(s.baseOnBalls) || 0} BB`,
    `${Number(s.strikeOuts) || 0} K`,
  ];
  if (s.numberOfPitches != null) bits.push(`${s.numberOfPitches} p`);
  const ir = Number(s.inheritedRunners) || 0;
  if (ir) bits.push(`inherited ${Number(s.inheritedRunnersScored) || 0}/${ir} scored`);
  const tags = [];
  if ((Number(s.gamesStarted) || 0) > 0) tags.push('start');
  if (Number(s.saves)) tags.push('SV');
  if (Number(s.holds)) tags.push('HLD');
  if (Number(s.blownSaves)) tags.push('BS');
  if (Number(s.wins)) tags.push('W');
  if (Number(s.losses)) tags.push('L');
  return bits.join(', ') + (tags.length ? ` (${tags.join(', ')})` : '');
}

/**
 * One arm's block, newest work first: role counts, last pitched + his week,
 * his last three outings, then the season line and the season usage pattern.
 * `usage` is computeRelieverUsagePattern's string (its leading "N G, " is
 * dropped — the season line already carries G).
 */
export function renderArmBlock({ name, hand, sum, usage }) {
  const lines = [];
  const era = sum.outs > 0 ? ((sum.er * 27) / sum.outs).toFixed(2) : '—';
  const whip = sum.outs > 0 ? (((sum.h + sum.bb) * 3) / sum.outs).toFixed(2) : '—';
  const role = [`${sum.sv} SV`, `${sum.hld} HLD`, sum.bs ? `${sum.bs} BS` : null].filter(Boolean).join(', ');
  const startsTag = sum.gs > 0 ? ` · ${sum.gs} GS this season` : '';
  lines.push(`  ${name}${hand ? ` (${hand}HP)` : ''} — ${role}${startsTag}`);
  let lastBit = 'Has not pitched this season';
  if (sum.last) {
    const d = sum.daysSinceLast;
    const when = d === 0 ? 'today' : d === 1 ? 'yesterday' : d != null && d > 1 ? `${d} days ago` : String(sum.last.date);
    const p = sum.last.stat?.numberOfPitches;
    lastBit = `Last pitched: ${when} (${String(sum.last.date).slice(5)})${p != null ? `, ${p} pitches` : ''}`;
  }
  const w = sum.last7;
  const weekBit = w.g
    ? ` · last 7 days: ${w.g} G, ${outsToIp(w.outs)} IP, ${w.er} ER, ${w.pitches} pitches`
    : ' · last 7 days: did not pitch';
  lines.push(`    ${lastBit}${weekBit}`);
  if (sum.last3.length) {
    const label = sum.last3.length === 1 ? 'Last outing' : `Last ${sum.last3.length} outings, newest first`;
    lines.push(`    ${label}: ${sum.last3.map(renderOuting).join(' · ')}`);
  }
  const tiny = sum.outs > 0 && sum.outs < 30 ? ` — every rate here rests on ${outsToIp(sum.outs)} IP` : '';
  const usageBit = usage ? ` · Usage: ${String(usage).replace(/^\d+ G, /, '')}` : '';
  lines.push(`    Season: ${sum.g} G, ${era} ERA, ${whip} WHIP, ${sum.k} K, ${sum.bb} BB in ${outsToIp(sum.outs)} IP${tiny}${usageBit}`);
  return lines;
}

/**
 * The club's pen by the calendar, as facts: who pitched yesterday and how
 * many pitches, who worked both of the last two days, three of the last
 * four, and who has not pitched in three days. No availability verdicts.
 */
export function penAvailabilityLines(arms, todayEt) {
  const d1 = shiftDate(todayEt, -1);
  const d2 = shiftDate(todayEt, -2);
  const d3 = shiftDate(todayEt, -3);
  const d4 = shiftDate(todayEt, -4);
  const on = (a, d) => d != null && a.sum.pitchesByDate.has(d);
  const withPitches = (a, d) => `${a.name} ${a.sum.pitchesByDate.get(d)} p`;
  const yesterday = arms.filter((a) => on(a, d1)).map((a) => withPitches(a, d1));
  const both = arms.filter((a) => on(a, d1) && on(a, d2)).map((a) => a.name);
  const threeOfFour = arms.filter((a) => [d1, d2, d3, d4].filter((d) => on(a, d)).length >= 3).map((a) => a.name);
  const idle = arms.filter((a) => ![d1, d2, d3].some((d) => on(a, d))).map((a) => a.name);
  return [
    `Pitched yesterday (${String(d1 || '').slice(5)}): ${yesterday.length ? yesterday.join(', ') : 'none'}.`,
    `Pitched both of the last two days: ${both.length ? both.join(', ') : 'none'}. Pitched 3 of the last 4 days: ${threeOfFour.length ? threeOfFour.join(', ') : 'none'}.`,
    `Not used in the last 3 days: ${idle.length ? idle.join(', ') : 'none'}.`,
  ];
}
