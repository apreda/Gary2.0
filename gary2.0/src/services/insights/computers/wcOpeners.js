// gary2.0/src/services/insights/computers/wcOpeners.js
//
// LANE: wcOpeners  (category token emitted: owned)
// "The opening fixtures: for each match in the next few days, any prior World Cup
//  meeting between the two nations (eras matter — the edition year is stated) plus
//  the consensus market line. Shown in the pre-tournament / rest-day Hub."
//
// PREVIEW MODE: orchestrator passes ctx = { date, season:2026, league:'wc',
// games: ALL 2026 fixtures, slateGameIds, preview:true, helpers }. We pick the
// next 3 calendar days of fixtures from ctx.date — or, when ctx.date is before the
// June 11 kickoff, the FIRST 3 days of the tournament.
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-04 — quoted,
// not guessed):
//   * RAW MATCH (ctx.games[i]): { id, datetime (ISO UTC), status 'scheduled',
//       home_team:{id,name,abbreviation}, away_team:{...} }.
//   * getMatches({ seasons:[2018,2022,2026], teamIds:[a,b] }) -> matches involving
//       EITHER nation across the listed editions. TEAM IDS ARE STABLE ACROSS
//       EDITIONS (verified: Argentina = id 37 in 2018/2022/2026). We narrow to the
//       strict head-to-head (one side a, the other b) and read 90' via
//       getRegulationScore() (full-time fallback for ET/penalty knockouts).
//   * getOdds({ matchIds:[id] }) + selectConsensusOdds(rows) ->
//       { vendor, moneyline:{home,draw,away}, spread, total }. 3-way moneyline.
//
// DATA LIMITATION (IMPORTANT): the BDL FIFA dataset only carries the 2018, 2022
// and 2026 editions. Two nations that last met at an EARLIER World Cup (1998,
// 2010, etc.) will show NO prior meeting here, so this lane LEGITIMATELY SKIPS
// most pairs and emits only a handful of rows — by design, never fabricated. A
// supplemental data source (full World Cup history) could widen this later.
//
// Each emitted row tags its real upcoming fixture (game = 'AWY @ HOM', game_id =
// match id) so it deep-links.
//
// Defensive contract: any missing piece -> skip that match silently and never
// throw. No fixtures -> []. Emits a one-line examined/emitted summary.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore, pickVariant } from '../shared.js';

const wc = fifaWorldCupService;

// Tunables.
const H2H_EDITIONS = [2018, 2022, 2026]; // editions the FIFA service supports
const WINDOW_DAYS = 3;                    // next N calendar days of fixtures
const TOURNAMENT_START = '2026-06-11';    // first match day
const MAX_ROWS = 6;
const SCORE_BASE = 58;
const SCORE_IMMINENT = 66;                // within 24h of kickoff
const IMMINENT_MS = 24 * 60 * 60 * 1000;

export async function computeWcOpeners(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) {
    console.log('[wcOpeners] examined 0, emitted 0');
    return [];
  }

  const windowDates = pickWindowDates(ctx?.date, games);
  const fixtures = games
    .filter((m) => m?.datetime && windowDates.has(String(m.datetime).slice(0, 10)))
    .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));

  const rows = [];
  const stats = { examined: 0, emitted: 0 };

  for (const match of fixtures) {
    if (rows.length >= MAX_ROWS) break;
    stats.examined += 1;
    try {
      const row = await openerRowForMatch(match);
      if (row) rows.push(row);
    } catch (err) {
      console.error('[wcOpeners] match error:', err?.message || err);
      // continue to next match
    }
  }

  stats.emitted = rows.length;
  console.log(`[wcOpeners] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

async function openerRowForMatch(match) {
  const matchId = match?.id;
  if (matchId == null) return null;
  const home = match.home_team;
  const away = match.away_team;
  if (!home?.id || !away?.id) return null; // TBD slot — skip

  // All matches involving either nation, narrowed to the strict head-to-head and
  // to completed games that are not this upcoming fixture.
  let pool = [];
  try {
    pool = (await wc.getMatches({ seasons: H2H_EDITIONS, teamIds: [home.id, away.id] })) || [];
  } catch {
    return null;
  }

  const meetings = pool.filter((m) => {
    if (!m || m.status !== 'completed') return false;
    if (m.id === matchId) return false;
    const ids = [m.home_team?.id, m.away_team?.id];
    return ids.includes(home.id) && ids.includes(away.id);
  });

  // No prior World Cup meeting in the available editions -> SKIP (no fabrication).
  if (!meetings.length) return null;

  // Tally W-D-L from the (2026) HOME side's perspective, and keep the most recent
  // meeting's edition + scoreline for the headline ("met at the 20XX World Cup").
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let counted = 0;
  let recent = null;

  const ordered = [...meetings].sort((a, b) => String(b.datetime || '').localeCompare(String(a.datetime || '')));
  for (const m of ordered) {
    const res = h2hResult(m, home.id, away.id);
    if (!res) continue;
    counted += 1;
    if (res.winnerId === null) draws += 1;
    else if (res.winnerId === home.id) homeWins += 1;
    else if (res.winnerId === away.id) awayWins += 1;
    if (!recent) recent = { ...res, year: m.season?.year ?? null };
  }

  if (!counted || !recent) return null;

  const label = wcGameLabel(match);
  const headline = buildHeadline(home, away, recent, counted);
  let detail = buildDetail(home, away, { homeWins, draws, awayWins, counted, recent });

  // Append the consensus 2026 market line when available.
  const marketClause = await buildMarketClause(matchId, home, away);
  if (marketClause) detail = `${detail} ${marketClause}`;

  const score = relevanceFor(match);

  return makeRow({
    category: 'owned',
    headline,
    detail,
    game: label,
    // Prior series W-D-L from the 2026 home side's perspective.
    value: `${homeWins}-${draws}-${awayWins}`,
    tone: TONES.NEUTRAL, // historical context — descriptive, not directional
    relevance_score: clampScore(score),
    game_id: matchId,
  });
}

/** Consensus 3-way match odds clause for the 2026 fixture. */
async function buildMarketClause(matchId, home, away) {
  const odds = await safe(() => wc.getOdds({ matchIds: [matchId] }), []);
  const forMatch = Array.isArray(odds) ? odds.filter((o) => o.match_id === matchId) : [];
  const consensus = wc.selectConsensusOdds(forMatch);
  const ml = consensus?.moneyline;
  if (!ml) return '';
  const bits = [];
  if (ml.home != null) bits.push(`${home.name} ${fmtOdds(ml.home)}`);
  if (ml.draw != null) bits.push(`the draw ${fmtOdds(ml.draw)}`);
  if (ml.away != null) bits.push(`${away.name} ${fmtOdds(ml.away)}`);
  if (bits.length < 2) return '';
  return `The 2026 market opens ${bits.join(' / ')}.`;
}

// --- result resolution -----------------------------------------------------

/**
 * Resolve a completed H2H meeting from the 2026 home side's perspective.
 * Returns { winnerId (team id | null for draw), year, homeGoals, awayGoals }
 * where homeGoals/awayGoals are the 2026-home / 2026-away nation's goals in that
 * historical meeting (oriented, not raw home/away of that match). null when
 * unreadable.
 */
function h2hResult(m, homeId, awayId) {
  const reg = wc.getRegulationScore(m);
  const mHome = m.home_team?.id;
  const mAway = m.away_team?.id;
  if (mHome == null || mAway == null) return null;

  // Orient the 90' score onto the 2026 home/away nations.
  let oriented = null;
  if (reg.home != null && reg.away != null) {
    oriented = orient(reg.home, reg.away, mHome, homeId);
  }

  // Winner precedence: 90' regulation -> full-time incl. ET -> penalties.
  if (reg.home != null && reg.away != null && reg.home !== reg.away) {
    const winnerMatchSide = reg.home > reg.away ? mHome : mAway;
    return { winnerId: winnerMatchSide, year: m.season?.year ?? null, ...oriented };
  }
  const fh = num(m.home_score);
  const fa = num(m.away_score);
  if (fh != null && fa != null && fh !== fa) {
    const winnerMatchSide = fh > fa ? mHome : mAway;
    return { winnerId: winnerMatchSide, year: m.season?.year ?? null, ...(oriented || orient(fh, fa, mHome, homeId)) };
  }
  if (m.has_penalty_shootout) {
    const ph = num(m.home_score_penalties);
    const pa = num(m.away_score_penalties);
    if (ph != null && pa != null && ph !== pa) {
      const winnerMatchSide = ph > pa ? mHome : mAway;
      return { winnerId: winnerMatchSide, year: m.season?.year ?? null, ...(oriented || {}) };
    }
  }
  // Genuine draw (level after available tiebreaks).
  if (oriented) return { winnerId: null, year: m.season?.year ?? null, ...oriented };
  if (fh != null && fa != null) return { winnerId: null, year: m.season?.year ?? null, ...orient(fh, fa, mHome, homeId) };
  return null;
}

/** Orient a match's (mHomeGoals, mAwayGoals) onto the 2026 home/away nations. */
function orient(mHomeGoals, mAwayGoals, matchHomeId, the2026HomeId) {
  const homeIsMatchHome = matchHomeId === the2026HomeId;
  return {
    homeGoals: homeIsMatchHome ? mHomeGoals : mAwayGoals,
    awayGoals: homeIsMatchHome ? mAwayGoals : mHomeGoals,
  };
}

// --- copy + scoring --------------------------------------------------------

function buildHeadline(home, away, recent, counted) {
  const a = home.name || 'One side';
  const b = away.name || 'the other';
  const yr = recent.year;
  if (counted === 1) {
    const score = scorelinePhrase(recent);
    if (yr && score) return `${a} and ${b} last met at the ${yr} World Cup — ${score}`;
    if (yr) return `${a} and ${b} met at the ${yr} World Cup`;
    return `${a} and ${b} have a World Cup history`;
  }
  return `${a} and ${b} have ${counted} World Cup meetings`;
}

function buildDetail(home, away, { homeWins, draws, awayWins, counted, recent }) {
  const a = home.name || 'One side';
  const b = away.name || 'the other';
  const ledger = `${homeWins}-${draws}-${awayWins}`;
  const drawClause = draws > 0 ? ` and ${draws} draw${draws === 1 ? '' : 's'}` : '';
  const meetingsWord = `${counted} World Cup meeting${counted === 1 ? '' : 's'}`;

  let lead;
  if (counted === 1) {
    const yr = recent.year ? `${recent.year} ` : '';
    const score = scorelinePhrase(recent);
    lead = score
      ? `Their lone ${yr}World Cup meeting finished ${score}.`
      : `They have one prior World Cup meeting.`;
  } else {
    const variants = [
      `Across ${meetingsWord}, ${a} hold a ${ledger} edge over ${b}${drawClause ? ` (${draws} drawn)` : ''}.`,
      `${a} lead the World Cup series ${homeWins}-${awayWins} against ${b} in ${meetingsWord}${drawClause}.`,
      `Their World Cup history runs ${homeWins} wins for ${a}, ${awayWins} for ${b}${drawClause}, over ${meetingsWord}.`,
    ];
    lead = pickVariant(variants, `${a}|${b}`);
  }
  return lead;
}

/** "1-1" / "Mexico won 2-0" style from the oriented goals on the recent meeting. */
function scorelinePhrase(recent) {
  const hg = recent.homeGoals;
  const ag = recent.awayGoals;
  if (hg == null || ag == null) return '';
  if (hg === ag) return `${hg}-${ag}`;
  // State the scoreline plainly without naming a winner side (orientation is
  // home/away of the 2026 fixture, which may differ from the historical billing).
  return `${hg}-${ag}`;
}

function relevanceFor(match) {
  const kickoff = parseIso(match?.datetime);
  if (!kickoff) return SCORE_BASE;
  const ms = kickoff.getTime() - Date.now();
  return ms >= 0 && ms <= IMMINENT_MS ? SCORE_IMMINENT : SCORE_BASE;
}

// --- window selection ------------------------------------------------------

/**
 * The set of YYYY-MM-DD strings for the next WINDOW_DAYS of fixtures. When
 * ctx.date is before the tournament start, anchor on the tournament's first day
 * so the pre-tournament Hub previews the opening fixtures.
 */
function pickWindowDates(ctxDate, games) {
  let anchor = String(ctxDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) {
    anchor = earliestFixtureDate(games) || TOURNAMENT_START;
  }
  // Before kickoff -> anchor on the tournament's first match day.
  if (anchor < TOURNAMENT_START) {
    anchor = earliestFixtureDate(games) || TOURNAMENT_START;
  }
  const set = new Set();
  const base = parseDateStr(anchor);
  if (!base) return set;
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    set.add(ymd(d));
  }
  return set;
}

function earliestFixtureDate(games) {
  let best = null;
  for (const m of games || []) {
    const d = m?.datetime ? String(m.datetime).slice(0, 10) : null;
    if (d && (!best || d < best)) best = d;
  }
  return best;
}

// --- small utils -----------------------------------------------------------

/** "AWY @ HOM" using 3-letter FIFA codes (split on ' @ ' by the iOS tokenizer). */
function wcGameLabel(match) {
  return `${fifaCode(match?.away_team)} @ ${fifaCode(match?.home_team)}`;
}

/** 3-letter FIFA code: abbreviation -> country_code -> first 3 of name uppercased. */
function fifaCode(team) {
  const code = team?.abbreviation || team?.country_code;
  if (code) return String(code).toUpperCase().slice(0, 3);
  return String(team?.name || 'TBD').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'TBD';
}

/** American odds with explicit sign. */
function fmtOdds(o) {
  const v = Number(o);
  if (!Number.isFinite(v)) return String(o);
  return v > 0 ? `+${v}` : `${v}`;
}

/** ISO datetime -> Date or null. */
function parseIso(iso) {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD -> UTC midnight Date or null. */
function parseDateStr(dateStr) {
  const mt = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mt) return null;
  const d = new Date(Date.UTC(Number(mt[1]), Number(mt[2]) - 1, Number(mt[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date -> YYYY-MM-DD (UTC). */
function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Coerce a value to a finite number, or null. */
function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/** Run an async producer, returning fallback on any throw. */
async function safe(fn, fallback) {
  try {
    const v = await fn();
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export default { computeWcOpeners };
