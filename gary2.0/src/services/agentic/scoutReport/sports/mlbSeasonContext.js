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

/** Chronological finals for one team from the season index:
 *  [{ date, won, rf, ra }] — regular season only. */
export function teamFinalsChrono(seasonIndex, teamBdlId) {
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
    rows.push({ date: toEtDate(g.date), won: rf > ra, rf, ra });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
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
export function computeBounceBackLine(seasonIndex, teamBdlId, teamName) {
  const finals = teamFinalsChrono(seasonIndex, teamBdlId);
  if (finals.length < 10) return null;
  let afterLossW = 0, afterLossL = 0, afterWinW = 0, afterWinL = 0;
  for (let i = 1; i < finals.length; i++) {
    if (finals[i - 1].won) finals[i].won ? afterWinW++ : afterWinL++;
    else finals[i].won ? afterLossW++ : afterLossL++;
  }
  const last = finals[finals.length - 1];
  if (last.won) {
    return `${teamName} won their last game (${last.date}, ${last.rf}-${last.ra} — detailed in the ledgers above); after a win this season: ${afterWinW}-${afterWinL}.`;
  }
  return `${teamName} lost their last game (${last.date}, ${last.rf}-${last.ra} — detailed in the ledgers above); after a loss this season: ${afterLossW}-${afterLossL}.`;
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
  const bits = [`${relief.length} G`];
  bits.push(b2b ? `${b2b}× back-to-back days` : 'never on back-to-back days');
  if (threeInFour) bits.push(`${threeInFour}× 3-in-4 days`);
  if (avgP != null) bits.push(`avg ${avgP} pitches${maxP != null ? `, max ${maxP}` : ''}`);
  if (multiInning) bits.push(`${multiInning}× 4+ outs`);
  return bits.join(', ');
}

export default { teamFinalsChrono, computeTeamMonthArc, computeBounceBackLine, computeRecordSince, computeRelieverUsagePattern };
