// gary2.0/src/services/insights/computers/wcH2h.js
//
// LANE: wcH2h  (category token emitted: owned)
// "One nation has historically owned this matchup at the World Cup — a lopsided
//  head-to-head ledger between the two sides across editions."
//
// SCOPE: 2026 FIFA World Cup. league === 'wc'. ctx.games = the day's RAW FIFA
// match objects from fifaWorldCupService.getMatchesForDate(dateStr).
//
// DATA SHAPES (confirmed live against the FIFA BDL API on 2026-06-04 — quoted,
// not guessed):
//   * RAW MATCH object (ctx.games[i]): {
//       id, datetime (ISO UTC), status ('scheduled'|'completed'), stage:{name},
//       group:{name}, home_team:{id,name,abbreviation,country_code},
//       away_team:{...}, season:{year}, half-score fields for getRegulationScore.
//     }
//   * getMatches({ seasons:[2018,2022,2026], teamIds:[a,b] }): returns the
//     matches involving EITHER of those team ids across the listed editions.
//     TEAM IDS ARE STABLE ACROSS EDITIONS (verified: Argentina = id 37 in 2018,
//     2022 and 2026). To get the true HEAD-TO-HEAD we pass BOTH ids and then
//     keep only matches where one side is `a` and the other is `b`.
//   * getRegulationScore(match) -> { home, away } (90' only, excludes ET; null
//     when no usable score). We resolve the H2H winner from the 90' result and,
//     when level at 90', fall back to full-time / penalties via the match flags.
//
// NOTE ON DATA AVAILABILITY: the FIFA service only carries 2018 / 2022 / 2026
// editions. Pre-tournament (June 2026) there is no 2026 head-to-head yet, so
// this lane only fires for nation pairs that have met in 2018 or 2022. When the
// two sides have fewer than MIN_MEETINGS prior meetings (the common case), the
// lane skips defensively — that is expected and fine.
//
// Defensive contract: any missing piece -> skip that match silently and never
// throw. Empty slate -> return []. Emits a one-line summary for diagnosability.

import fifaWorldCupService from '../../fifaWorldCupService.js';
import { makeRow, TONES, clampScore, pickVariant } from '../shared.js';

const wc = fifaWorldCupService;

// Tunables.
const H2H_EDITIONS = [2018, 2022, 2026]; // editions the FIFA service supports
const MIN_MEETINGS = 2;                   // need a real H2H sample (defensive skip below)
const RELEVANCE_BASE = 55;
const RELEVANCE_PER = 5;                  // +5 per prior meeting
const RELEVANCE_CAP = 85;

export async function computeWcH2h(ctx) {
  const games = Array.isArray(ctx?.games) ? ctx.games : [];
  const rows = [];
  const stats = { examined: 0, emitted: 0 };

  for (const match of games) {
    try {
      const row = await h2hRowForMatch(match, stats);
      if (row) rows.push(row);
    } catch (err) {
      console.error('[wcH2h] match error:', err?.message || err);
      // continue to next match
    }
  }

  stats.emitted = rows.length;
  console.log(`[wcH2h] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

async function h2hRowForMatch(match, stats) {
  const matchId = match?.id;
  if (matchId == null) return null;

  const home = match.home_team;
  const away = match.away_team;
  if (!home?.id || !away?.id) return null; // TBD knockout slot — skip
  if (stats) stats.examined += 1;

  const label = wcGameLabel(match);

  // All matches involving either nation across editions, then narrow to the
  // strict head-to-head (one side home.id, the other away.id) and to completed
  // games that are NOT the upcoming fixture itself.
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

  // Defensive skip when there is not a real H2H sample (the common pre-tournament
  // case, since only 2018/2022 editions exist before 2026 kicks off).
  if (meetings.length < MIN_MEETINGS) return null;

  // Tally from the HOME side's perspective (90' regulation result; level games
  // fall back to full-time incl. ET, then penalties — same precedence the
  // service uses for advancement).
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let counted = 0;

  for (const m of meetings) {
    const winnerId = decideWinner(m);
    if (winnerId === undefined) continue; // unreadable result — skip
    counted += 1;
    if (winnerId === null) draws += 1;
    else if (winnerId === home.id) homeWins += 1;
    else if (winnerId === away.id) awayWins += 1;
  }

  if (counted < MIN_MEETINGS) return null;

  // Only surface when there is an actual edge to one side; a perfectly even
  // ledger (equal wins) is not an "owned" story.
  if (homeWins === awayWins) return null;

  const dominantIsHome = homeWins > awayWins;
  const owner = dominantIsHome ? home : away;
  const victim = dominantIsHome ? away : home;
  const ownerWins = dominantIsHome ? homeWins : awayWins;
  const otherWins = dominantIsHome ? awayWins : homeWins;

  const ownerName = owner.name || 'One side';
  const victimName = victim.name || 'the other';

  return makeRow({
    category: 'owned',
    headline: `${ownerName} have the edge on ${victimName} at the World Cup`,
    detail: buildDetail({ ownerName, victimName, ownerWins, otherWins, draws, counted }),
    game: label,
    value: `${ownerWins}-${draws}-${otherWins}`,
    // tone good when the side that owns the series is at HOME in this fixture
    // (their edge aligns with home billing); neutral otherwise — never bad,
    // since "owned" is descriptive history, not a negative signal.
    tone: dominantIsHome ? TONES.EDGE : TONES.NEUTRAL,
    relevance_score: clampScore(
      Math.min(RELEVANCE_CAP, RELEVANCE_BASE + RELEVANCE_PER * counted),
    ),
    team_id: owner.id,
    game_id: matchId,
  });
}

/**
 * Decide the winner team id of a completed match.
 * Returns: a team id (winner), null (genuine draw — level after all tiebreaks),
 * or undefined (result unreadable — caller skips).
 * Precedence: 90' regulation -> full-time incl. extra time -> penalties.
 */
function decideWinner(match) {
  const homeId = match.home_team?.id;
  const awayId = match.away_team?.id;
  if (homeId == null || awayId == null) return undefined;

  const reg = wc.getRegulationScore(match);
  if (reg.home != null && reg.away != null) {
    if (reg.home !== reg.away) return reg.home > reg.away ? homeId : awayId;
    // Level at 90' — check extra time / penalties for a knockout decision.
    const fh = num(match.home_score);
    const fa = num(match.away_score);
    if (fh != null && fa != null && fh !== fa) return fh > fa ? homeId : awayId;
    if (match.has_penalty_shootout) {
      const ph = num(match.home_score_penalties);
      const pa = num(match.away_score_penalties);
      if (ph != null && pa != null && ph !== pa) return ph > pa ? homeId : awayId;
    }
    return null; // genuine draw (group-stage level result)
  }

  // No regulation score available — fall back to full-time totals if present.
  const fh = num(match.home_score);
  const fa = num(match.away_score);
  if (fh != null && fa != null) {
    if (fh !== fa) return fh > fa ? homeId : awayId;
    return null;
  }
  return undefined;
}

/** Coerce a value to a finite number, or null. */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

/**
 * Plain, factual detail. States the head-to-head ledger and sample. Three
 * deterministic variants keyed off the owner name so a slate doesn't read
 * machine-stamped.
 */
function buildDetail({ ownerName, victimName, ownerWins, otherWins, draws, counted }) {
  const drawClause = draws > 0 ? ` with ${draws} draw${draws === 1 ? '' : 's'}` : '';
  const meetingsWord = `${counted} World Cup meeting${counted === 1 ? '' : 's'}`;

  const variants = [
    `In ${meetingsWord}, ${ownerName} have won ${ownerWins} to ${victimName}'s ${otherWins}${drawClause}.`,
    `${ownerName} lead the World Cup series ${ownerWins}-${otherWins} over ${victimName} across ${meetingsWord}${drawClause}.`,
    `Their World Cup history runs ${ownerWins} wins for ${ownerName} against ${otherWins} for ${victimName} in ${meetingsWord}${drawClause}.`,
  ];
  return pickVariant(variants, String(ownerName));
}

export default { computeWcH2h };
