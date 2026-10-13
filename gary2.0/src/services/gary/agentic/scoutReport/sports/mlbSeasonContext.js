/**
 * SEASON CONTEXT (founder GO, Aug 18 2026 — the audit's consistency fills):
 * the desk covered L20/L30 and the season aggregate with nothing between, so
 * "how consistent have they been all year?" and "have they slumped like this
 * before?" had no answer. Everything here computes from the already-cached
 * season game index — zero new network. Records print WITH their situation
 * (founder's law: a record needs the context behind it; the desk's ledgers
 * and stories carry what actually happened in the games).
 */
import { toEtDate } from './mlbSeriesState.js';

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/** Chronological finals for one team — same rows as teamFinalsRich (its
 *  extra fields are harmless to the arc/bounce-back/record-since readers). */
export function teamFinalsChrono(seasonIndex, teamBdlId) {
  return teamFinalsRich(seasonIndex, teamBdlId);
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mar/Apr 15-12, 4.6 scored / 4.1 allowed · May 13-15, 3.9/4.4 · ..." —
 *  the season's own month-by-month shape. Null under 2 months of finals. */
export function computeTeamMonthArc(seasonIndex, teamBdlId) {
  const finals = teamFinalsChrono(seasonIndex, teamBdlId);
  if (finals.length < 10) return null;
  const byMonth = new Map(); // 'YYYY-MM' -> { w, l, rf, ra, n }
  for (const g of finals) {
    const key = g.date.slice(0, 7);
    const m = byMonth.get(key) || { w: 0, l: 0, rf: 0, ra: 0, n: 0 };
    g.won ? m.w++ : m.l++;
    m.rf += g.rf; m.ra += g.ra; m.n++;
    byMonth.set(key, m);
  }
  const keys = [...byMonth.keys()].sort();
  if (keys.length < 2) return null;
  const parts = keys.map((k) => {
    const m = byMonth.get(k);
    const label = MONTH_LABELS[Number(k.slice(5, 7)) - 1] || k;
    return `${label} ${m.w}-${m.l}, ${(m.rf / m.n).toFixed(1)}/${(m.ra / m.n).toFixed(1)}`;
  });
  return `by month (W-L, scored/allowed per game): ${parts.join(' · ')}`;
}

/**
 * Tonight's spot, instantiated: only the branch that matches the team's last
 * final prints — "lost their last game; after a loss this season: 32-19."
 * The loss itself is documented by the desk's ledgers and stories, which is
 * the context the founder requires a record to carry. Null without data.
 */
export function computeBounceBackLine(seasonIndex, teamBdlId, teamName, oppLabelOf = null) {
  const finals = teamFinalsChrono(seasonIndex, teamBdlId);
  if (finals.length < 10) return null;
  let afterLossW = 0, afterLossL = 0, afterWinW = 0, afterWinL = 0;
  for (let i = 1; i < finals.length; i++) {
    if (finals[i - 1].won) finals[i].won ? afterWinW++ : afterWinL++;
    else finals[i].won ? afterLossW++ : afterLossL++;
  }
  const last = finals[finals.length - 1];
  // The opponent is named IN the line (founder, Aug 27: "it doesnt even say
  // who they lost to?") and the old "detailed in the ledgers above" pointer
  // is gone — this section prints FIRST, so "above" was a lie about the
  // desk's own structure. The game's story and box print below.
  const opp = typeof oppLabelOf === 'function' ? oppLabelOf(last.oppId) : null;
  const oppBit = opp ? ` ${last.home ? 'vs' : '@'} ${opp}` : '';
  if (last.won) {
    return `${teamName} won their last game ${last.rf}-${last.ra}${oppBit} (${last.date}); after a win this season: ${afterWinW}-${afterWinL}.`;
  }
  return `${teamName} lost their last game ${last.rf}-${last.ra}${oppBit} (${last.date}); after a loss this season: ${afterLossW}-${afterLossL}.`;
}

/** Rich chronological finals (date, result, score, venue, opponent id) —
 *  the one row shape the situational devices below share. */
export function teamFinalsRich(seasonIndex, teamBdlId) {
  if (!seasonIndex?.entries || teamBdlId == null) return [];
  const rows = [];
  for (const [, g] of seasonIndex.entries()) {
    if (!sameId(g.homeId, teamBdlId) && !sameId(g.awayId, teamBdlId)) continue;
    if (!/final/i.test(String(g.status || ''))) continue;
    if (g.seasonType === 'spring_training') continue;
    const home = sameId(g.homeId, teamBdlId);
    const rf = Number(home ? g.homeRuns : g.awayRuns);
    const ra = Number(home ? g.awayRuns : g.homeRuns);
    if (!Number.isFinite(rf) || !Number.isFinite(ra) || rf === ra) continue;
    rows.push({ date: toEtDate(g.date), won: rf > ra, rf, ra, home, oppId: home ? g.awayId : g.homeId });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The current run of results, naturally (founder, Aug 19: don't tunnel on
 * the word "streak" — provide the context behind the recent wins and
 * losses). Returns { len, won, games } for the live streak.
 */
export function computeCurrentStreak(seasonIndex, teamBdlId) {
  const rows = teamFinalsRich(seasonIndex, teamBdlId);
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const games = [];
  for (let i = rows.length - 1; i >= 0 && rows[i].won === last.won; i--) games.unshift(rows[i]);
  return { len: games.length, won: last.won, games };
}

/**
 * The last-N results with the EXCEPTIONS named (founder's 5-1 example:
 * "the one loss was @ the Dodgers"). Returns { wins, losses, exceptions }
 * where exceptions are the minority-result games. Null under N finals.
 */
export function computeRecentQuality(seasonIndex, teamBdlId, n = 7) {
  const rowsAll = teamFinalsRich(seasonIndex, teamBdlId);
  const win = rowsAll.slice(-n);
  if (win.length < n) return null;
  const wins = win.filter((g) => g.won).length;
  const losses = n - wins;
  const minorityWon = wins > losses ? false : true;
  const exceptions = (wins === 0 || losses === 0) ? [] : win.filter((g) => g.won === minorityWon);
  return { n, wins, losses, exceptions };
}

/**
 * Venue transition for tonight (founder, Aug 19: coming home after a road
 * trip / continuing on the road / leaving a homestand). Reads the team's
 * played games only — the trip we can PROVE from finals. Null when tonight
 * simply continues a homestand (the schedule-shape line already says so).
 */
export function computeVenueTransition(seasonIndex, teamBdlId, isHomeTonight) {
  if (isHomeTonight == null) return null;
  const rows = teamFinalsRich(seasonIndex, teamBdlId);
  if (!rows.length) return null;
  // Run length of the current venue context at the tail of the played games.
  const lastVenueHome = rows[rows.length - 1].home;
  let run = 0;
  for (let i = rows.length - 1; i >= 0 && rows[i].home === lastVenueHome; i--) run++;
  if (isHomeTonight && !lastVenueHome) {
    return `first home game after a ${run}-game road trip`;
  }
  if (!isHomeTonight && lastVenueHome) {
    return `first road game after a ${run}-game homestand`;
  }
  if (!isHomeTonight && !lastVenueHome) {
    return `game ${run + 1} of the current road trip`;
  }
  return null; // continuing a homestand — the schedule-shape line already says so
}

/** Team W-L in the window since a date (exclusive) — the "how has the team
 *  actually gone since he last played" fact. Null when nothing followed. */
export function computeRecordSince(seasonIndex, teamBdlId, sinceDateEt) {
  const since = String(sinceDateEt || '').slice(0, 10);
  if (!since) return null;
  const finals = teamFinalsChrono(seasonIndex, teamBdlId).filter((g) => g.date > since);
  if (!finals.length) return null;
  const w = finals.filter((g) => g.won).length;
  return { wins: w, losses: finals.length - w };
}

/**
 * A reliever's season usage pattern from his raw statsapi game log —
 * the manager's actual rules for the arm, as counts: appearances,
 * back-to-back days, 3-appearances-in-4-days, pitch loads, multi-inning
 * outings. Pure function; pass gameLog splits (relief rows only are used).
 */
export function computeRelieverUsagePattern(gameLogSplits = []) {
  const relief = (gameLogSplits || []).filter((g) => g?.date && !(g.stat?.gamesStarted > 0));
  if (relief.length < 3) return null;
  const dates = [...new Set(relief.map((g) => g.date))].sort();
  const dateSet = new Set(dates);
  const dayMs = 86400000;
  const shift = (d, n) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * dayMs).toISOString().slice(0, 10);
  let b2b = 0;
  let threeInFour = 0;
  for (const d of dates) {
    if (dateSet.has(shift(d, -1))) b2b++;
    const windowCount = [0, -1, -2, -3].filter((n) => dateSet.has(shift(d, n))).length;
    if (windowCount >= 3) threeInFour++;
  }
  const pitches = relief.map((g) => Number(g.stat?.numberOfPitches)).filter(Number.isFinite);
  const ips = relief.map((g) => parseFloat(g.stat?.inningsPitched)).filter(Number.isFinite);
  const multiInning = ips.filter((ip) => ip >= 1.1).length;
  const avgP = pitches.length ? Math.round(pitches.reduce((a, b) => a + b, 0) / pitches.length) : null;
  const maxP = pitches.length ? Math.max(...pitches) : null;
  // CONDITIONAL BACK-TO-BACK (founder, Aug 19): "are there guys who pitch
  // the next night after a 9-pitch outing, and guys that never happens
  // for?" — the manager's actual rule, as counts. For each relief outing,
  // did the arm work the NEXT calendar day, split by that outing's load?
  const byDate = new Map();
  for (const g of relief) {
    const p = Number(g.stat?.numberOfPitches);
    const prev = byDate.get(g.date);
    byDate.set(g.date, Math.max(prev ?? 0, Number.isFinite(p) ? p : 0));
  }
  let lightNext = 0, lightTotal = 0, heavyNext = 0, heavyTotal = 0;
  for (const [d, load] of byDate.entries()) {
    const workedNext = dateSet.has(shift(d, 1));
    if (load > 0 && load <= 15) { lightTotal++; if (workedNext) lightNext++; }
    if (load >= 25) { heavyTotal++; if (workedNext) heavyNext++; }
  }
  const bits = [`${relief.length} G`];
  bits.push(b2b ? `${b2b}× back-to-back days` : 'never on back-to-back days');
  if (threeInFour) bits.push(`${threeInFour}× 3-in-4 days`);
  if (avgP != null) bits.push(`avg ${avgP} pitches${maxP != null ? `, max ${maxP}` : ''}`);
  if (multiInning) bits.push(`${multiInning}× 4+ outs`);
  if (lightTotal >= 3) bits.push(`after ≤15-pitch outings: worked next day ${lightNext} of ${lightTotal}`);
  if (heavyTotal >= 3) bits.push(`after 25+ pitches: next day ${heavyNext} of ${heavyTotal}`);
  return bits.join(', ');
}

export default {
  teamFinalsChrono,
  teamFinalsRich,
  computeTeamMonthArc,
  computeBounceBackLine,
  computeRecordSince,
  computeRelieverUsagePattern,
  computeCurrentStreak,
  computeRecentQuality,
  computeVenueTransition,
};
