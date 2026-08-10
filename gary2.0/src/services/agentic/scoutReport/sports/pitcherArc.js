/**
 * PITCHER ARC LINES — the trajectory facts for the starter block.
 *
 * Aug 4 2026 (founder GO, the Bieber/Chandler/Schlittler autopsy): the desk
 * printed season aggregates pre-chewed ("5.74 ERA", "vs LHB .800 OPS") while
 * the prospective evidence sat as raw ledger rows — so rationales quoted the
 * season number and skimmed the arc. These lines make the arc exactly as
 * quotable as the aggregate sitting next to it.
 *
 * FACTS ONLY. No interpretation, no weighting, no "trending" language — the
 * no-steering law applies to data lines too. Every formatter returns a plain
 * string or null (null = the line simply doesn't print).
 */

import { foldName } from '../../../../utils/nameUtils.js';

const MONTH_NAMES = { 3: 'Mar', 4: 'Apr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Aug', 9: 'Sep', 10: 'Oct' };

/** Baseball IP notation ("5.2" = 5⅔ innings) → outs. Null-safe. */
export function outsFromIp(ip) {
  const n = parseFloat(ip);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n) * 3 + Math.round((n % 1) * 10);
}

/** Outs → baseball IP notation string. */
export function ipFromOuts(outs) {
  if (!Number.isFinite(outs) || outs < 0) return null;
  return `${Math.floor(outs / 3)}.${outs % 3}`;
}

/**
 * Computed window over the most recent N starts of a getPitcherLastStarts
 * ledger (rows oldest→newest). The ledger prints the rows; this prints the
 * arithmetic so the recent number is as citable as the season one.
 *   "Last 3 starts: 15.0 IP, 5 ER (3.00 ERA), 15 K, 8 BB"
 * Null when fewer than n starts (a 2-row ledger needs no summary).
 */
export function recentWindowLine(starts, n = 3) {
  if (!Array.isArray(starts) || starts.length < n) return null;
  const window = starts.slice(-n);
  let outs = 0, er = 0, k = 0, bb = 0;
  for (const g of window) {
    const o = outsFromIp(g.ip);
    if (o == null) return null; // a malformed row would silently corrupt the math
    outs += o;
    er += Number(g.er) || 0;
    k += Number(g.k) || 0;
    bb += Number(g.bb) || 0;
  }
  if (outs === 0) return null;
  const era = ((er * 27) / outs).toFixed(2);
  return `Last ${n} starts: ${ipFromOuts(outs)} IP, ${er} ER (${era} ERA), ${k} K, ${bb} BB`;
}

/**
 * The season decomposed by month — the season aggregate's own components,
 * printed beside it so April and August stop averaging into one figure.
 *   "By month: Jun 6.00 (9.0 IP) · Jul 5.64 (22.1 IP)"
 * Rows: [{ month, era, ip }]. Null under 2 months with innings — a
 * one-month season IS the season line already.
 */
export function monthArcLine(monthRows) {
  const rows = (Array.isArray(monthRows) ? monthRows : [])
    .filter(m => m && MONTH_NAMES[m.month] && outsFromIp(m.ip) > 0)
    .sort((a, b) => a.month - b.month);
  if (rows.length < 2) return null;
  const parts = rows.map(m => {
    const era = m.era != null && m.era !== '' ? Number(m.era).toFixed(2) : '?';
    return `${MONTH_NAMES[m.month]} ${era} (${m.ip} IP)`;
  });
  return `By month: ${parts.join(' · ')}`;
}

/**
 * The career baseline — who this pitcher has been, as a number, printed
 * under the season line it contextualizes.
 *   "Career: 3.32 ERA, 920.1 IP, 149 starts, 69-36 (2018-2026)"
 * Null when there is no career beyond this season (a rookie's career line
 * would just restate his season) or no career data at all.
 */
export function careerLine(career, seasons) {
  if (!career) return null;
  const gs = Number(career.gs) || 0;
  const years = (Array.isArray(seasons) ? seasons : [])
    .map(s => Number(s.season)).filter(Number.isFinite);
  if (!years.length || gs === 0) return null;
  const first = Math.min(...years);
  const last = Math.max(...years);
  if (first === last) return null; // career == this season: nothing to add
  const bits = [];
  if (career.era != null && career.era !== '') bits.push(`${Number(career.era).toFixed(2)} ERA`);
  if (career.ip != null) bits.push(`${career.ip} IP`);
  bits.push(`${gs} starts`);
  if (career.w != null && career.l != null) bits.push(`${career.w}-${career.l}`);
  return `Career: ${bits.join(', ')} (${first}-${last})`;
}

/**
 * SAMPLE CONTEXT: long-layoff return. Fires when both recent prior seasons
 * were tiny (< 60 IP) after an established workload (a season of 100+ IP
 * before them) — the season aggregate then spans his first starts back.
 * States the innings history and, when the season started late, the first
 * start date. Provenance facts only, same register as the team-change flag.
 */
export function longLayoffFlag({ name, label, seasons, season, firstStartDate }) {
  const rows = (Array.isArray(seasons) ? seasons : [])
    .map(s => ({ season: Number(s.season), outs: outsFromIp(s.ip) ?? 0, ip: s.ip }))
    .filter(s => Number.isFinite(s.season) && s.season < season);
  if (!rows.length) return null;
  const recent = rows.filter(s => s.season >= season - 2);
  const earlier = rows.filter(s => s.season < season - 2);
  if (!recent.length || !earlier.length) return null;
  if (Math.max(...recent.map(s => s.outs)) >= 60 * 3) return null;   // recent seasons not tiny
  if (Math.max(...earlier.map(s => s.outs)) < 100 * 3) return null;  // never established before
  const recentBits = recent
    .sort((a, b) => a.season - b.season)
    .map(s => `${s.ip} IP in ${s.season}`).join(' and ');
  const estOuts = earlier.map(s => s.outs);
  const estIp = `${ipFromOuts(Math.min(...estOuts))}-${ipFromOuts(Math.max(...estOuts))}`;
  const estYears = `${Math.min(...earlier.map(s => s.season))}-${Math.max(...earlier.map(s => s.season))}`;
  let line = `${name} (${label}): threw ${recentBits} after ${estIp} IP seasons ${estYears}.`;
  if (firstStartDate) {
    const d = new Date(`${firstStartDate}T12:00:00Z`);
    const md = Number.isNaN(d.getTime()) ? firstStartDate
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    line += ` His first ${season} start came ${md}.`;
  }
  line += ` ${season} season-long numbers span only the starts since.`;
  return line;
}

/**
 * DISTORTION FLAG arithmetic (founder GO, Aug 5 2026 PM): does removing ONE
 * start move the starts-only ERA by >= 0.75? ONE game by construction —
 * there is no "outside those two starts" state, so the flag can never
 * launder a bad stretch: when the outside number is still ugly, that IS the
 * honest answer to "was it just one bad night?". Pure math; the scout
 * attaches the game's official story where one exists.
 */
export function singleStartDistortion(starts) {
  const rows = (Array.isArray(starts) ? starts : []).filter(g => outsFromIp(g.ip) != null);
  if (rows.length < 4) return null;
  let outs = 0, er = 0;
  for (const g of rows) { outs += outsFromIp(g.ip); er += Number(g.er) || 0; }
  if (outs <= 0) return null;
  const base = (er * 27) / outs;
  let worst = null, without = base;
  for (const g of rows) {
    const o = outs - outsFromIp(g.ip);
    if (o <= 0) continue;
    const w = ((er - (Number(g.er) || 0)) * 27) / o;
    if (w < without) { without = w; worst = g; }
  }
  if (!worst || base - without < 0.75) return null;
  return { base, without, worst, startCount: rows.length };
}

/**
 * SAMPLE CONTEXT: a mid-season gap between starts (IL stint, demotion, role
 * change — the flag states the gap, never guesses the reason). Fires on a
 * ≥21-day gap between consecutive starts this season; the All-Star break
 * never reaches that. The season aggregate then spans work from both sides
 * of the gap (Aug 5, the Bieber case: a 5.74 season ERA carrying pre-IL
 * work plus one 0.2 IP disaster, with the return visible only if the news
 * happened to say it).
 */
export function midSeasonGapFlag({ name, label, startDates, season }) {
  const dates = (Array.isArray(startDates) ? startDates : []).filter(Boolean).sort();
  if (dates.length < 2) return null;
  let gapDays = 0, gapFrom = null, gapTo = null;
  for (let i = 1; i < dates.length; i++) {
    const days = Math.round((new Date(`${dates[i]}T12:00:00Z`) - new Date(`${dates[i - 1]}T12:00:00Z`)) / 86400000);
    if (days > gapDays) { gapDays = days; gapFrom = dates[i - 1]; gapTo = dates[i]; }
  }
  if (gapDays < 21) return null;
  const fmt = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? iso
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  };
  const since = dates.filter(d => d >= gapTo).length;
  return `${name} (${label}): ${gapDays}-day gap between starts ${fmt(gapFrom)} → ${fmt(gapTo)}; ` +
    `${since} start${since === 1 ? '' : 's'} since ${fmt(gapTo)}. ` +
    `${season} season-long numbers span both sides of the gap.`;
}

/**
 * SAMPLE CONTEXT: essentially all career starts are this season. Fires for
 * rookies and converted arms (≤ 4 starts before this season) — the season
 * splits then accumulate from his first MLB starts onward.
 */
export function earlyCareerFlag({ name, label, careerGs, seasonGs }) {
  const cg = Number(careerGs) || 0;
  const sg = Number(seasonGs) || 0;
  if (sg < 5 || cg < sg) return null;      // too early to say anything / bad data
  const prior = cg - sg;
  if (prior > 4) return null;              // real prior track record exists
  const lead = prior === 0
    ? `All ${cg} of his career MLB starts have come this season.`
    : `${sg} of his ${cg} career MLB starts have come this season.`;
  return `${name} (${label}): ${lead} Season-long splits and rate stats accumulate from his first MLB starts onward.`;
}

/**
 * TEAM-CHANGE FLAGS (Aug 10 2026 — replaces the raw-stats derivation that
 * flagged EVERY starter as "first start for [club]" from Aug 6-9).
 *
 * Constraints this shape encodes:
 *   - /mlb/v1/stats rows carry NO team ids — team_name (a display-name
 *     string) is the only club attribution, so both sides of the club join
 *     go through foldName.
 *   - Rows must be the chrono wrapper's (regular-season, STATUS_FINAL) —
 *     raw fetches include spring training and inflate start counts.
 *   - Silence beats guessing: a start row with no team_name, or a home
 *     check with any missing _game.homeId, mutes the claim it feeds
 *     rather than bending it.
 *
 * rows: getMlbPlayerGameRowsChrono rows (games_started, team_name, _game.homeId)
 * clubId: current club's BDL team id · clubNames: current club name variants
 */
export function teamChangeFlags({ name, label, season, clubId, clubNames, rows }) {
  if (!name || !label || clubId == null || !Array.isArray(rows)) return [];
  const clubKeys = new Set((clubNames || []).map(foldName).filter(Boolean));
  if (clubKeys.size === 0) return [];

  const starts = rows.filter((r) => Number(r?.games_started) > 0);
  if (starts.length === 0) return [];

  let current = 0, other = 0, unknown = 0, homeAtVenue = 0, homeUnknown = 0;
  for (const r of starts) {
    const key = foldName(r?.team_name);
    if (!key) { unknown += 1; continue; }
    if (!clubKeys.has(key)) { other += 1; continue; }
    current += 1;
    const homeId = r?._game?.homeId;
    if (homeId == null) homeUnknown += 1;
    else if (homeId === clubId) homeAtVenue += 1;
  }

  const flags = [];
  const total = starts.length;
  if (current === 0 && other > 0 && unknown === 0) {
    flags.push(`${name} (${label}): first start for ${label} — all ${total} of his ${season} starts came with another club.`);
  }
  if (current > 0 && other > 0 && unknown === 0) {
    const majorityNote = other > current
      ? ' — most of the sample is NOT from the current team or ballpark.'
      : '.';
    flags.push(
      `${name} (${label}): ${current}/${total} ${season} starts with ${label}, ${other} with prior team. ` +
      `BDL season stats / home-away splits / ERA are aggregated across both teams${majorityNote}`
    );
  }
  if (current > 0 && homeUnknown === 0 && homeAtVenue <= 1) {
    flags.push(
      `${name} (${label}): ${homeAtVenue} home start${homeAtVenue === 1 ? '' : 's'} at current team venue this season. ` +
      `Any "home ERA" figure is built on essentially zero sample at this park.`
    );
  }
  return flags;
}
