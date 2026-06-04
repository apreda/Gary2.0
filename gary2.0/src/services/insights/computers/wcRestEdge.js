// gary2.0/src/services/insights/computers/wcRestEdge.js
//
// LANE: wcRestEdge  (category token emitted: situational — iOS REST & FATIGUE lane)
// "Recovery gaps between World Cup fixtures. The schedule guarantees at least three
//  days between a side's matches, but the draw produces UNEVEN gaps the market
//  underweights — one side arriving on three days' rest while the other has had
//  five is a recovery edge that compounds over the group stage."
//
// RESEARCH BACK-DROP: a turnaround of fewer than four days measurably degrades
// physical output in tournament football; FIFA's 2026 calendar guarantees >= 3
// days, so the meaningful variable is the DIFFERENTIAL between the two sides'
// rest, not the absolute number. We surface a fixture only when that differential
// is >= 2 days.
//
// RUNS IN BOTH SLATE SHAPES (identical RAW FIFA match objects):
//   * PREVIEW: ctx = { date, season:2026, league:'wc', games: ALL 104 fixtures,
//       slateGameIds, preview:true, helpers }. We consider every fixture.
//   * MATCH DAY: ctx.games = only today's fixtures. To compute "days since each
//       side's previous match" we still need the WHOLE schedule, so when ctx.games
//       does not already contain the full fixture list we fetch it once via
//       getMatches({ seasons:[2026] }). The today-slate is the set we EMIT for;
//       the full list is only the lookup table for prior matches.
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-04 — quoted,
// not guessed):
//   * RAW MATCH (ctx.games[i]): { id, datetime (ISO UTC), status, stage:{name},
//       group:{name 'Group A'..'Group L'},
//       home_team:{id,name,abbreviation,country_code}, away_team:{...} }.
//   * In group MD1 a side has NO prior tournament match -> we skip that fixture
//     (no rest to compare). Team ids are stable across the matches endpoint.
//
// ROW SHAPE: ONE row per qualifying fixture. game = 'AWY @ HOM' (3-letter codes),
// game_id = the fixture id, value = '+Nd' (the rest differential in days), tone
// CAUTION (framed off the short-rest side). relevance = 55 + 6*diff, capped 80.
//
// Defensive contract: any missing piece -> skip that fixture silently and never
// throw. Empty slate / no schedule -> []. Emits a one-line examined/emitted summary.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore } from '../shared.js';

const wc = fifaWorldCupService;

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DIFF_DAYS = 2;   // emit only when the rest gap is this large or larger
const WINDOW_DAYS = 7;     // normal mode: only fixtures within the next 7 days
const RELEVANCE_BASE = 55;
const RELEVANCE_PER = 6;   // +6 per day of differential
const RELEVANCE_CAP = 80;

export async function computeWcRestEdge(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  if (!games.length) {
    console.log('[wcRestEdge] examined 0, emitted 0');
    return [];
  }

  const refDate = parseDateStr(ctx?.date);

  // The full fixture list is the lookup table for each side's PREVIOUS match.
  // In preview the slate already IS the full list; on a match day it is only
  // today's fixtures, so fetch the whole schedule once (defensively).
  const fullSchedule = await resolveFullSchedule(games);

  // Index: team id -> that team's fixtures, chronologically ascending.
  const fixturesByTeam = indexFixturesByTeam(fullSchedule);

  // The fixtures we EMIT for. PREVIEW: every fixture in the slate (the rest-gap
  // signal is rare across the even 2026 schedule, so we do NOT window it away).
  // MATCH DAY: today's fixtures, bounded to the next WINDOW_DAYS of ctx.date so a
  // stray future fixture in a small slate can't sneak in.
  const isPreview = ctx?.preview === true || games.length >= 60;
  const candidates = isPreview ? selectAll(games) : selectCandidates(games, refDate);

  const rows = [];
  const stats = { examined: 0, emitted: 0 };

  for (const match of candidates) {
    stats.examined += 1;
    try {
      const row = buildRestRow(match, fixturesByTeam);
      if (row) rows.push(row);
    } catch (err) {
      console.error('[wcRestEdge] fixture error:', err?.message || err);
      // continue to next fixture
    }
  }

  stats.emitted = rows.length;
  console.log(`[wcRestEdge] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

function buildRestRow(match, fixturesByTeam) {
  const home = match?.home_team;
  const away = match?.away_team;
  const kickoff = parseIso(match?.datetime);
  if (!home?.id || !away?.id || !kickoff) return null;

  const homeRest = restDaysBefore(home.id, kickoff, fixturesByTeam);
  const awayRest = restDaysBefore(away.id, kickoff, fixturesByTeam);
  // Both sides need a PRIOR tournament match — MD1 has none, so skip.
  if (homeRest == null || awayRest == null) return null;

  const diff = Math.abs(homeRest - awayRest);
  if (diff < MIN_DIFF_DAYS) return null;

  const homeShort = homeRest < awayRest;
  const shortName = homeShort ? home.name : away.name;
  const shortRest = homeShort ? homeRest : awayRest;
  const longName = homeShort ? away.name : home.name;
  const longRest = homeShort ? awayRest : homeRest;

  const when = prettyDate(match.datetime);
  const whenClause = when ? ` in the ${when} meeting` : '';
  const headline = `${shortName} arrive on ${shortRest} days' rest; ${longName} have had ${longRest}`;
  const detail =
    `${shortName} come into the fixture on ${dayStr(shortRest)}' rest while ${longName} have had ` +
    `${dayStr(longRest)}' — a ${diff}-day recovery gap${whenClause}.`;

  return makeRow({
    category: 'situational',
    headline,
    detail,
    game: wcGameLabel(match),
    value: `+${diff}d`,
    tone: TONES.CAUTION, // framed off the short-rest side
    relevance_score: clampScore(Math.min(RELEVANCE_CAP, RELEVANCE_BASE + RELEVANCE_PER * diff)),
    game_id: match.id,
  });
}

// --- rest computation ------------------------------------------------------

/**
 * Whole days between a team's previous tournament match and `kickoff`. Reads the
 * team's fixtures (ascending), takes the latest one strictly BEFORE kickoff, and
 * floors the gap to whole days. Returns null when the team has no prior fixture
 * (group MD1) or no parseable previous datetime.
 */
function restDaysBefore(teamId, kickoff, fixturesByTeam) {
  const list = fixturesByTeam.get(String(teamId));
  if (!Array.isArray(list) || !list.length) return null;
  let prev = null;
  for (const m of list) {
    const dt = parseIso(m?.datetime);
    if (!dt) continue;
    if (dt.getTime() < kickoff.getTime()) prev = dt; // list is ascending; keep latest earlier
    else break;
  }
  if (!prev) return null;
  return Math.floor((kickoff.getTime() - prev.getTime()) / DAY_MS);
}

// --- slate / schedule resolution -------------------------------------------

/**
 * Resolve the FULL fixture list. If the passed slate already looks like the whole
 * tournament (preview, ~all 104), reuse it; otherwise fetch the season's matches
 * once so we can look up each side's previous game. On any failure, fall back to
 * the slate we were given (rest simply won't resolve for MD1-only inputs).
 */
async function resolveFullSchedule(games) {
  // Heuristic: the preview slate carries the whole tournament. A match-day slate
  // is a handful of fixtures. Anything below a clear threshold -> fetch the rest.
  if (games.length >= 60) return games;
  try {
    const all = await wc.getMatches({ seasons: [2026] });
    if (Array.isArray(all) && all.length) return all;
  } catch {
    // fall through
  }
  return games;
}

/**
 * Index team id -> that team's fixtures, sorted ascending by datetime, so the
 * "previous match" scan is a simple ordered walk.
 */
function indexFixturesByTeam(schedule) {
  const byTeam = new Map();
  for (const m of schedule || []) {
    if (!m?.datetime) continue;
    for (const team of [m.home_team, m.away_team]) {
      if (!team?.id) continue;
      const k = String(team.id);
      if (!byTeam.has(k)) byTeam.set(k, []);
      byTeam.get(k).push(m);
    }
  }
  for (const list of byTeam.values()) {
    list.sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
  }
  return byTeam;
}

/** Every nameable fixture in the slate (preview considers the whole tournament). */
function selectAll(games) {
  return games.filter((m) => m?.home_team?.id && m?.away_team?.id);
}

/**
 * The fixtures we emit rows for on a MATCH DAY. When a ref date is available, bound
 * to the next WINDOW_DAYS so a stray future fixture can't sneak into a small slate.
 * No ref date -> consider the whole slate as given.
 */
function selectCandidates(games, refDate) {
  if (!refDate) return games.filter((m) => m?.home_team?.id && m?.away_team?.id);
  const out = [];
  for (const m of games) {
    if (!m?.home_team?.id || !m?.away_team?.id) continue;
    const dt = parseIso(m?.datetime);
    if (!dt) continue;
    const days = (dt.getTime() - refDate.getTime()) / DAY_MS;
    if (days >= -1 && days <= WINDOW_DAYS) out.push(m); // include same-day (>= -1 for tz slack)
  }
  return out;
}

// --- formatting + small utils ----------------------------------------------

/** "3 days" / "1 day". */
function dayStr(n) {
  return `${n} day${n === 1 ? '' : 's'}`;
}

/** ISO UTC -> "June 19" (UTC calendar day). Empty string when unparseable. */
function prettyDate(iso) {
  const d = parseIso(iso);
  if (!d) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Parse an ISO datetime string to a Date, or null. */
function parseIso(iso) {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a YYYY-MM-DD ctx.date to a UTC midnight Date, or null. */
function parseDateStr(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const mt = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!mt) return parseIso(dateStr);
  const d = new Date(Date.UTC(Number(mt[1]), Number(mt[2]) - 1, Number(mt[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

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

export default { computeWcRestEdge };
