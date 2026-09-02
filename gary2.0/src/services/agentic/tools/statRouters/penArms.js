/**
 * THE PEN — every arm, newest work first (founder GO, Sep 2 2026).
 *
 * "Each individual guy out of the bullpen and how they've done, not that
 * different than a starting pitcher." The club's active roster is the truth
 * of who they have; each pitcher's official game log says whether he is a
 * pen arm tonight and what he has done lately. This replaced a BDL-stint
 * list that dropped any arm under 3 IP with the club and anyone with a
 * start on his record — the Sep 1 Red Sox desk printed four arms of eight,
 * and the "pen as a unit" line was built from the four.
 *
 * Facts only. Who is available is the brain's read off the dates and pitch
 * counts; nothing here says "unavailable" — the press lane carries what the
 * manager announced.
 */
import { findMlbTeam, getTeamRoster, getPitcherGameLogRaw, getMlbPeopleHands } from '../../../mlbStatsApiService.js';
import { computeRelieverUsagePattern } from '../../scoutReport/sports/mlbSeasonContext.js';
import { summarizeRelieverLog, isPenArm, renderArmBlock, penAvailabilityLines, outsToIp } from './bullpenLedger.js';

const todayEtStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/**
 * One club's pen: the availability facts, then every arm's block (newest
 * work first), then the full-season unit line over exactly those arms.
 * A failed roster or an empty log set prints an honest-absence line — a
 * failed fetch is never an empty pen.
 */
export async function buildPenArmsForTeam(team, teamName, { todayEt } = {}) {
  const year = new Date().getFullYear();
  const today = todayEt || todayEtStr();
  const lines = [];
  let roster = null;
  try {
    const t = await findMlbTeam(team?.full_name || team?.name || teamName);
    roster = t?.id ? await getTeamRoster(t.id) : null;
  } catch (e) {
    console.warn(`[MLB Fetchers] pen roster fetch failed for ${teamName}: ${e.message}`);
  }
  const pitchers = (roster || []).filter((r) => r?.id != null && r?.name
    && (String(r.positionType || '') === 'Pitcher' || String(r.position || '') === 'P'));
  if (!pitchers.length) {
    lines.push(`${teamName}: active roster unavailable this run — treat as missing data, not as an empty pen.`);
    return { lines, arms: [], ok: false };
  }

  const logs = await Promise.all(pitchers.map(async (p) => {
    try { return { p, log: await getPitcherGameLogRaw(p.id, year) }; } catch { return { p, log: null }; }
  }));
  const arms = [];
  let failed = 0;
  for (const { p, log } of logs) {
    if (!Array.isArray(log)) { failed += 1; continue; }
    const sum = summarizeRelieverLog(log, today);
    if (!isPenArm(sum)) continue;
    arms.push({ name: p.name, id: p.id, sum, usage: computeRelieverUsagePattern(log) });
  }
  if (!arms.length) {
    lines.push(`${teamName}: no reliever game logs resolved this run${failed ? ` (${failed} log fetch${failed === 1 ? '' : 'es'} failed)` : ''} — treat as missing data, not as an empty pen.`);
    return { lines, arms: [], ok: false };
  }

  const hands = await getMlbPeopleHands(arms.map((a) => a.id)).catch(() => new Map());
  // High-leverage arms first (saves, then holds, then innings) — the order a
  // fan lists a pen in; every arm prints.
  arms.sort((a, b) => b.sum.sv - a.sum.sv || b.sum.hld - a.sum.hld || b.sum.outs - a.sum.outs);
  const failedNote = failed ? ` (${failed} more pitcher${failed === 1 ? '' : 's'} whose game log did not load)` : '';
  lines.push(`${teamName} pen — ${arms.length} arms on the active roster${failedNote}, newest work first:`);
  lines.push(...penAvailabilityLines(arms, today));
  for (const a of arms) {
    lines.push(...renderArmBlock({ ...a, hand: hands?.get?.(a.id)?.throw || null }));
  }
  let uOuts = 0;
  let uEr = 0;
  let uH = 0;
  let uBb = 0;
  for (const a of arms) {
    uOuts += a.sum.outs;
    uEr += a.sum.er;
    uH += a.sum.h;
    uBb += a.sum.bb;
  }
  if (uOuts > 0) {
    lines.push(`${teamName} pen as a unit, full season, these ${arms.length} arms: ${((uEr * 27) / uOuts).toFixed(2)} ERA, ${(((uH + uBb) * 3) / uOuts).toFixed(2)} WHIP over ${outsToIp(uOuts)} IP — not a recent-form figure; the game-by-game ledger above carries the recent work`);
  }
  return { lines, arms, ok: true };
}

/** The MLB_CLOSER_RELIEVER_STATS token: both clubs, home/away halves. */
export async function fetchPenArms(sport, home, away) {
  const homeTeam = home.full_name || home.name;
  const awayTeam = away.full_name || away.name;
  const today = todayEtStr();
  const [h, a] = await Promise.all([
    buildPenArmsForTeam(home, homeTeam, { todayEt: today }),
    buildPenArmsForTeam(away, awayTeam, { todayEt: today }),
  ]);
  return {
    homeValue: h.lines.join('\n'),
    awayValue: a.lines.join('\n'),
    comparison: `Every pen arm, newest work first, for ${awayTeam} @ ${homeTeam}`,
    source: h.ok || a.ok ? 'MLB Stats API (roster + game logs)' : 'MLB Stats API (no data)',
  };
}
