// THE QUARTERBACKS, for college — the passing leader per side and his real
// line (NCAAF Picks page parity, founder Sep 3-4 2026: "that needs to be the
// Quarterbacks like it is for NFL, not the teams").
//
// Truth sources (verified live Sep 4 2026):
//   * BDL /ncaaf/v1/players/active — who is on the team NOW (a transfer-in
//     is here; a departed passer is not).
//   * BDL /ncaaf/v1/player_stats (seasons[]) — the per-game rows: who has
//     thrown, when, and how much. The season line is the SUM of these.
// The season-totals endpoint is deliberately NOT read: before Week 1 its
// "2026" rows carried full prior-season lines (Beck 352 attempts for a Miami
// that had not kicked off), so a "this season" line off it was a lie.
//
// College publishes no depth chart, so the plate names the side's PASSING
// LEADER by attempts, above a floor — the words never call him the starter
// (the college starting-QB policy). Before a team's first game the current
// season has no rows, so the lane reads the PRIOR season for the quarterbacks
// on THIS season's active roster and says so, naming the school he threw
// for when it was another one. A side with no line above the floor in either
// season writes nothing.
//
// Fetch discipline: three BDL requests a minute account-wide, so the lane
// works games in kickoff order inside a time budget and skips games that
// already carry its rows today (ncaafLaneLedger). NCAAF-owned: never reads an
// NFL feed (league isolation law).

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import { playerName } from '../ncaafNames.js';
import { gamesWithRowsToday, runWithinBudget } from '../ncaafLaneLedger.js';

/** A passing leader has to have thrown a real share — one game's worth. */
export const MIN_ATTEMPTS = 15;
/** Rosters do not change inside a day; share them across the day's passes. */
const ROSTER_TTL_MINUTES = 360;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, decimals) {
  return Number(Number(value).toFixed(decimals));
}

function teamAbbr(team) {
  return team?.abbreviation || team?.college || team?.name || 'TEAM';
}

function isQuarterback(p) {
  return String(p?.position_abbreviation || p?.position || '').toUpperCase() === 'QB';
}

/** Sum a passer's per-game rows into the plate's numbers; null under the floor. */
function aggregate(rows, season, prior) {
  const thrown = rows.filter((r) => (finite(r?.passing_attempts) ?? 0) > 0);
  const attempts = thrown.reduce((s, r) => s + finite(r.passing_attempts), 0);
  if (attempts < MIN_ATTEMPTS) return null;
  const completions = thrown.reduce((s, r) => s + (finite(r.passing_completions) ?? 0), 0);
  const yards = thrown.reduce((s, r) => s + (finite(r.passing_yards) ?? 0), 0);
  const td = thrown.reduce((s, r) => s + (finite(r.passing_touchdowns) ?? 0), 0);
  const ints = thrown.reduce((s, r) => s + (finite(r.passing_interceptions) ?? 0), 0);
  const pct = round((completions / attempts) * 100, 1);
  const ypa = round(yards / attempts, 2);
  // The school he threw for, off the rows themselves (a transfer's prior year).
  const teams = [...new Set(thrown.map((r) => r?.team?.abbreviation).filter(Boolean))];
  return {
    text: `${yards} passing yards, ${pct.toFixed(1)}% completions, ${ypa.toFixed(2)} yards per attempt, ${td}-${ints} TD-INT`,
    attempts, yards, pct, ypa, td, ints, games: thrown.length, season, prior,
    team: teams.length === 1 ? teams[0] : null,
  };
}

/** The roster quarterback with the most attempts among the per-game rows. */
function leader(rows, quarterbacks, season, prior) {
  const byId = new Map(quarterbacks.map((q) => [String(q.id), q]));
  const grouped = new Map();
  for (const r of rows || []) {
    const id = String(r?.player?.id);
    if (!byId.has(id)) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(r);
  }
  let best = null;
  for (const [id, group] of grouped) {
    const line = aggregate(group, season, prior);
    if (line && (!best || line.attempts > best.line.attempts)) best = { qb: byId.get(id), line };
  }
  return best;
}

async function rosterQuarterbacks(bdl, team) {
  const roster = (await bdl.getNcaafTeamPlayers(team.id, ROSTER_TTL_MINUTES)) || [];
  return roster.filter((p) => p?.id != null && isQuarterback(p) && playerName(p));
}

async function gameRows({ game, season, bdl, helpers, date }) {
  const awayTeam = game?.away_team ?? game?.visitor_team;
  const homeTeam = game?.home_team;
  if (!awayTeam?.id || !homeTeam?.id) return [];

  let sides;
  try {
    sides = [
      { key: 'away', team: awayTeam, quarterbacks: await rosterQuarterbacks(bdl, awayTeam) },
      { key: 'home', team: homeTeam, quarterbacks: await rosterQuarterbacks(bdl, homeTeam) },
    ];
  } catch (err) {
    console.warn(`[ncaafQbWatch] rosters failed for game ${game.id}: ${err?.message || err}`);
    return [];
  }
  const allIds = sides.flatMap((s) => s.quarterbacks.map((q) => q.id));
  if (!allIds.length) return [];

  // One per-game call for both sides' quarterbacks this season.
  const current = (await bdl.getNcaafPlayerGameStats({ playerIds: allIds, season })) || [];

  const rows = [];
  for (const side of sides) {
    if (!side.quarterbacks.length) continue;
    let found = leader(current, side.quarterbacks, season, false);
    if (!found) {
      // No line yet this season: last season, for THIS roster's quarterbacks only.
      const prior = (await bdl.getNcaafPlayerGameStats({
        playerIds: side.quarterbacks.map((q) => q.id), season: season - 1,
      })) || [];
      found = leader(prior, side.quarterbacks, season - 1, true);
    }
    if (!found) continue;

    const { qb, line } = found;
    const name = playerName(qb);
    const abbr = teamAbbr(side.team);
    const school = side.team.college || side.team.full_name || abbr;
    const games = ` over ${line.games} game${line.games === 1 ? '' : 's'}`;
    const priorTeam = line.prior && line.team && line.team !== abbr ? line.team : null;

    rows.push(makeRow({
      category: 'quarterback',
      headline: line.prior
        ? `${name} is ${abbr}'s returning passer on ${line.season} numbers`
        : `${name} leads ${abbr}'s passing this season`,
      detail: line.prior
        ? `${name} (${school}): ${line.season} season line${priorTeam ? `, thrown for ${priorTeam}` : ''}: ${line.text}${games}. He is on ${school}'s active roster this season; the current season has no passing line for him yet.`
        : `${name} (${school}): ${line.season} line so far: ${line.text}${games}.`,
      game: helpers.gameLabel(game),
      value: `${line.ypa.toFixed(2)} Y/A`,
      tone: TONES.NEUTRAL,
      relevance_score: line.prior ? 60 : 68,
      player_id: qb.id,
      team_id: side.team.id,
      game_id: game.id,
      meta: {
        source: 'balldontlie_ncaaf_players_active+player_stats',
        stats_season: line.season,
        prior_season_line: line.prior,
        prior_team: priorTeam,
        through: date,
        // THE QUARTERBACKS plates (the ARMS layout): the passer, his side,
        // and the line as numbers. The sentence above stays the prose form.
        qb: name,
        school,
        abbr,
        side: side.key,
        team_id: side.team.id,
        passing: {
          yards: line.yards, pct: line.pct, ypa: line.ypa, td: line.td, ints: line.ints,
          games: line.games, attempts: line.attempts, season: line.season, prior: line.prior,
        },
      },
    }));
  }
  return rows;
}

/**
 * One row per side with a passing line above the floor: the headline names
 * the leader and the season the numbers come from; the detail carries the
 * summed line; the meta records the plate's numbers.
 */
export async function computeNcaafQbWatch(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league !== 'ncaaf') return [];
  if (!bdl || !Number.isInteger(Number(season)) || !(games || []).length) return [];

  const done = await gamesWithRowsToday({ date, category: 'quarterback' });
  const rows = await runWithinBudget({
    games, done, label: 'ncaafQbWatch',
    work: (game) => gameRows({ game, season: Number(season), bdl, helpers, date }),
  });

  await attachLaneReads('ncaafQbWatch', rows, detailFact, {
    ask: 'what this passer\'s line says about how his offense actually moves the ball — volume, efficiency, or ball security — and what kind of test this matchup is for that',
  });

  console.log(`[ncaafQbWatch] NCAAF ${date}: ${rows.length} passer row(s)`);
  return rows;
}

export default { computeNcaafQbWatch };
