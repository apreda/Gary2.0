import { getPlayLedger, teamLedger, starterTimeline } from '../../../nflPlayLedger.js';
import { resolveSeasonContext, gradeSplits, PHASES } from '../../../nflSeasonPhase.js';
import { nflverseCode } from '../../../nflverseService.js';

/**
 * The bridge between the season play ledger and the stat tokens.
 *
 * Tokens should not know how the ledger is built, cached, or which season it
 * is allowed to speak for. They ask for a matchup and get back both teams'
 * graded splits plus a stated basis, or a clean null.
 *
 * NFL ONLY. nflverse does not cover college; NCAAF's equivalent comes from
 * CollegeFootballData and lives in footballAdvancedNcaaf.js. A token that
 * serves both leagues must branch, and must never hand an NCAAF team to this
 * module and read the empty result as "this team has no tendencies".
 */

const IN_FLIGHT = new Map();

/** One ledger load per season per process, even under concurrent tokens. */
function loadOnce(season) {
  const key = String(season);
  if (!IN_FLIGHT.has(key)) {
    IN_FLIGHT.set(key, getPlayLedger(season).catch((error) => ({
      unavailable: true, reason: `Play ledger failed for ${season}: ${error.message}`
    })));
  }
  return IN_FLIGHT.get(key);
}

/**
 * Both teams' advanced splits for a matchup.
 *
 * @returns {Promise<null|{basis:string, phase:string, note:string, season:number,
 *          home:Object|null, away:Object|null, homeCode:string, awayCode:string,
 *          ledger:Object}>} null when the league is not NFL or no code resolves.
 */
export async function advancedPair(bdlSport, home, away, season) {
  if (bdlSport !== 'americanfootball_nfl') return null;
  const homeCode = nflverseCode(home?.full_name || home?.name);
  const awayCode = nflverseCode(away?.full_name || away?.name);
  if (!homeCode || !awayCode) return null;

  const ctx = await resolveSeasonContext(season, loadOnce, [homeCode, awayCode]);
  if (!ctx.ledger) {
    return {
      basis: ctx.basis, phase: ctx.phase, note: ctx.note, season: ctx.season,
      home: null, away: null, homeCode, awayCode, ledger: null
    };
  }

  const grade = (code) => {
    const entry = teamLedger(ctx.ledger, code);
    if (!entry) return null;
    return { offense: gradeSplits(entry.offense), defense: gradeSplits(entry.defense) };
  };

  // On a prior-season basis the ledger IS the prior season, so the label has
  // to name the year the numbers come from rather than the year being played.
  const dataSeason = ctx.basis === 'prior_season' ? ctx.priorSeason : ctx.season;

  return {
    basis: ctx.basis,
    phase: ctx.phase,
    note: ctx.note,
    season: ctx.season,
    data_season: dataSeason,
    home: grade(homeCode),
    away: grade(awayCode),
    homeCode,
    awayCode,
    ledger: ctx.ledger,
    priorLedger: ctx.priorLedger,
    priorSeason: ctx.priorSeason
  };
}

/**
 * Pull one named split for both sides into a token-shaped payload.
 *
 * @param {Object} pair     result of advancedPair
 * @param {string} splitKey e.g. 'goal_to_go'
 * @param {'offense'|'defense'} side
 */
export function splitPayload(pair, splitKey, side) {
  const read = (team) => {
    const s = team?.[side]?.splits?.[splitKey];
    if (!s) return null;
    return s;
  };
  return { home: read(pair?.home), away: read(pair?.away) };
}

/**
 * The provenance line every advanced token carries, so a number from last
 * season can never be mistaken for this one.
 */
export function basisLine(pair) {
  if (!pair) return null;
  if (!pair.ledger) return pair.note;
  const source = `Computed from ${pair.data_season} play-by-play (nflverse), every snap from scrimmage.`;
  return pair.basis === 'current' ? `${source} ${pair.note}` : `${source} ${pair.note}`;
}

/**
 * Roster continuity — whether a season average blends more than one starter.
 *
 * The founder's Aug 25 point: if a team turned a corner in Week 4, a season
 * average describes a team that no longer exists. Cleveland's 2025 offensive
 * numbers blend Flacco, Gabriel and Sanders — three different teams wearing
 * the same average.
 */
export function continuityFor(pair, which) {
  const code = which === 'home' ? pair?.homeCode : pair?.awayCode;
  const timeline = starterTimeline(pair?.ledger, code);
  if (!timeline || timeline.length === 0) return null;

  const byQb = new Map();
  for (const row of timeline) {
    if (!byQb.has(row.qb)) byQb.set(row.qb, []);
    byQb.get(row.qb).push(row.week);
  }
  const starters = [...byQb.entries()].map(([qb, weeks]) => ({
    quarterback: qb,
    games: weeks.length,
    weeks: weeks.sort((a, b) => a - b)
  })).sort((a, b) => b.games - a.games);

  const latest = timeline[timeline.length - 1];
  if (starters.length === 1) {
    return {
      quarterbacks_used: 1,
      starter: starters[0].quarterback,
      note: `${starters[0].quarterback} started all ${starters[0].games} games, so the season numbers describe one team.`
    };
  }
  return {
    quarterbacks_used: starters.length,
    starters,
    most_recent_starter: latest.qb,
    // This is the warning, and it is deliberately blunt.
    note: `SEASON AVERAGES BLEND ${starters.length} STARTING QUARTERBACKS — `
      + starters.map((s) => `${s.quarterback} (${s.games})`).join(', ')
      + `. The most recent starter is ${latest.qb} (week ${latest.week}). A full-season rate for this offence describes no team that will take the field; weigh the ${latest.qb} weeks separately.`
  };
}

/** Per-game strip: how the offence and defence went, game by game. */
export function gameByGame(pair, which, limit = 6) {
  const code = which === 'home' ? pair?.homeCode : pair?.awayCode;
  const timeline = starterTimeline(pair?.ledger, code);
  if (!timeline) return null;
  return timeline.slice(-limit).reverse().map((row) => ({
    week: row.week,
    quarterback: row.qb,
    ...(row.share < 0.85 ? { note: 'more than one quarterback took snaps in this game' } : {})
  }));
}

export function isColdStart(pair) {
  return pair?.phase === PHASES.NOT_STARTED || pair?.phase === PHASES.EARLY;
}

/** Test seam. */
export function _resetAdvancedCache() {
  IN_FLIGHT.clear();
}
