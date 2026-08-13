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
 * The season decomposed by venue (founder GO, Aug 12 — the Baz miss: his
 * 4-11 rode a road half the desk never printed, while the other starter's
 * home split arrived by press luck). Every ledger row already carries
 * isHome; this is the two halves as bare arithmetic, team record included.
 *   "Home/Road: 12 home starts — 2.51 ERA, team 8-4 · 11 road — 5.09 ERA, team 3-8"
 * Rows: full-season getPitcherLastStarts ledger (oldest→newest). Null when
 * the season has fewer than 2 starts or every start is on one side AND that
 * side is the season line already (single-venue seasons still print, they
 * ARE the story). Sides with zero starts are simply omitted.
 */
export function homeRoadLine(starts) {
  if (!Array.isArray(starts) || starts.length < 2) return null;
  const MALFORMED = Symbol('malformed');
  const eraOf = (rows) => {
    let outs = 0, er = 0;
    for (const g of rows) {
      const o = outsFromIp(g.ip);
      if (o == null) return null;
      outs += o;
      er += Number(g.er) || 0;
    }
    return outs === 0 ? null : ((er * 27) / outs).toFixed(2);
  };
  const half = (rows, label) => {
    if (!rows.length) return null; // a side with no starts is simply omitted
    const era = eraOf(rows);
    if (era == null) return MALFORMED; // one bad row poisons the WHOLE line —
    // printing only the clean side would read as "all his starts are there"
    const decided = rows.filter((g) => g.win != null);
    const w = decided.filter((g) => g.win).length;
    const rec = decided.length ? `, team ${w}-${decided.length - w}` : '';
    // THE AGGREGATE'S OWN CONTEXT (founder, Aug 12: "no naked numbers" — a
    // split without when/who is half a fact): the half's recent window and
    // its most recent start, so "3.82 road" arrives with which roads, when.
    let recent = '';
    if (rows.length >= 4) {
      const last3era = eraOf(rows.slice(-3));
      if (last3era != null) recent += `, last 3 ${label}: ${last3era}`;
    }
    const latest = rows[rows.length - 1];
    if (latest?.date && latest?.opponent) {
      recent += ` (most recent ${latest.date} ${label === 'home' ? 'vs' : '@'} ${latest.opponent})`;
    }
    return `${rows.length} ${label} start${rows.length === 1 ? '' : 's'} — ${era} ERA${rec}${recent}`;
  };
  const halves = [
    half(starts.filter((g) => g.isHome === true), 'home'),
    half(starts.filter((g) => g.isHome === false), 'road'),
  ];
  if (halves.includes(MALFORMED)) return null;
  const segs = halves.filter(Boolean);
  if (!segs.length) return null;
  return `Home/Road: ${segs.join(' · ')}`;
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

// (careerLine REMOVED — founder ruling, Aug 10 2026: no career stats on
// the desk. Who-a-pitcher-is arrives as written via the press layer.)

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
  // CURRENT-FRAMED OUTPUT (founder, Aug 10: "why show past years?"). The
  // prior-season IP shape above still decides WHEN this fires — but the
  // line itself states only the current-season fact; the why-he-was-gone
  // arrives as reported through the press layer, the fan's way.
  if (!firstStartDate) return null;
  return `${name} (${label}): first ${season} start came ${shortDate(firstStartDate)} — season-long numbers span only the starts since.`;
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
  const since = dates.filter(d => d >= gapTo).length;
  return `${name} (${label}): ${gapDays}-day gap between starts ${shortDate(gapFrom)} → ${shortDate(gapTo)}; ` +
    `${since} start${since === 1 ? '' : 's'} since ${shortDate(gapTo)}. ` +
    `${season} season-long numbers span both sides of the gap.`;
}

/** "2026-06-23" → "Jun 23" (UTC-noon anchored; unparseable input passes through). */
function shortDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso)
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * INLINE SEASON QUALIFIER (Aug 10 2026, founder GO — "fuse the qualifier
 * into the line so the aggregate can't be quoted without its context").
 * Rides inside the season line's "(N starts)" parenthetical. Two clauses,
 * both current-season facts only — no prior-year recitation:
 *   - a first start after May 1 (return, call-up, conversion — the season
 *     number spans a partial season either way);
 *   - the one-start ERA distortion exclusion, when it fires.
 * Returns "; ..." for direct append, or '' when nothing applies.
 */
export function seasonLineQualifier({ season, firstStartDate, starts } = {}) {
  const bits = [];
  if (firstStartDate && season && String(firstStartDate) > `${season}-05-01`) {
    bits.push(`first start ${shortDate(firstStartDate)}`);
  }
  const dist = singleStartDistortion(starts);
  if (dist) {
    const g = dist.worst;
    bits.push(`${dist.without.toFixed(2)} outside ${shortDate(g.date)} ${g.isHome ? 'vs' : '@'} ${g.opponent}`);
  }
  return bits.length ? `; ${bits.join('; ')}` : '';
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

/**
 * MATCHUP RECENCY (founder GO, Aug 10 night — the Gray/Toronto exercise):
 * a starter's most recent start against TONIGHT'S opponent, surfaced as
 * its own line when it happened inside the last 30 days. The fact was
 * already in the ledger the night it mattered and got read past — this
 * makes it load-bearing. Not a weighting: a buried fact un-buried, for
 * every game, silently absent when there's nothing.
 */
export function matchupRecencyLine({ oppNick, starts, today, withinDays = 30 }) {
  if (!oppNick || !Array.isArray(starts) || !starts.length) return null;
  const word = String(oppNick).toLowerCase();
  const row = [...starts].reverse().find(g => String(g?.opponent || '').toLowerCase().endsWith(word));
  if (!row?.date) return null;
  const todayMs = new Date(`${String(today || '').slice(0, 10)}T12:00:00Z`).getTime();
  const rowMs = new Date(`${String(row.date).slice(0, 10)}T12:00:00Z`).getTime();
  if (!Number.isFinite(todayMs) || !Number.isFinite(rowMs)) return null;
  const days = Math.round((todayMs - rowMs) / 86400000);
  if (days < 0 || days > withinDays) return null;
  const d = new Date(`${String(row.date).slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const bits = [`${row.ip}IP`, `${row.h}H`, `${row.er}ER`];
  if (row.k) bits.push(`${row.k}K`);
  if (row.bb) bits.push(`${row.bb}BB`);
  if (row.hr) bits.push(`${row.hr}HR`);
  if (row.pitches) bits.push(`${row.pitches}p`);
  const result = row.win == null ? '' : row.win ? ' (team W)' : ' (team L)';
  return `Most recent look vs ${oppNick} (${d}, ${days}d ago): ${bits.join(' ')}${result}`;
}
