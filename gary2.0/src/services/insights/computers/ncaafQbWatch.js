// THE QUARTERBACKS, for college — the passing leader per side and his real
// line (NCAAF Picks page parity, founder Sep 3-4 2026: "that needs to be the
// Quarterbacks like it is for NFL, not the teams").
//
// Source contract: BDL /ncaaf/v1/players/active names the side's roster;
// /ncaaf/v1/player_season_stats carries each passer's season line. College
// publishes no depth chart, so the plate names the side's PASSING LEADER on
// this season's numbers — the words never call him the starter (the college
// starting-QB policy: a passing leader is evidence, not a confirmed start).
// Before a team's first game the current season has no rows, so the lane
// reads the PRIOR season for the quarterbacks on THIS season's active roster
// and says so in the same sentence — a labeled last-year line is honest, an
// unlabeled one is not, and a transferred-out passer never wins the plate.
// A side with no line in either season writes nothing.
//
// NCAAF-owned: this file never reads an NFL feed (league isolation law).

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';
import { playerName } from '../ncaafNames.js';

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

/** The season row as the numbers the plate prints; null when he never threw. */
function passingLine(stat, season, prior) {
  const attempts = finite(stat?.passing_attempts);
  const yards = finite(stat?.passing_yards);
  if (!attempts || attempts <= 0 || yards == null) return null;
  const completions = finite(stat?.passing_completions);
  const td = finite(stat?.passing_touchdowns);
  const ints = finite(stat?.passing_interceptions);
  const ypg = finite(stat?.passing_yards_per_game);
  const pct = completions != null ? round((completions / attempts) * 100, 1) : null;
  const ypa = round(yards / attempts, 2);
  // BDL's college season row carries yards and yards per game, not games:
  // the game count is the exact quotient of the two, never a guess.
  const games = ypg && ypg > 0 ? Math.round(yards / ypg) : null;

  const parts = [`${yards} passing yards`];
  if (pct != null) parts.push(`${pct.toFixed(1)}% completions`);
  parts.push(`${ypa.toFixed(2)} yards per attempt`);
  if (td != null && ints != null) parts.push(`${td}-${ints} TD-INT`);

  return {
    text: parts.join(', '),
    attempts, yards, pct, ypa, td, ints, games, season, prior,
  };
}

/** The roster quarterback with the most attempts among the season rows. */
function leader(rows, quarterbacks, season, prior) {
  const byId = new Map(quarterbacks.map((q) => [String(q.id), q]));
  let best = null;
  for (const row of rows || []) {
    const qb = byId.get(String(row?.player?.id));
    if (!qb) continue;
    const line = passingLine(row, season, prior);
    if (!line) continue;
    if (!best || line.attempts > best.line.attempts) best = { qb, line };
  }
  return best;
}

async function sideLeader(bdl, team, season) {
  const roster = (await bdl.getNcaafTeamPlayers(team.id)) || [];
  const quarterbacks = roster.filter((p) => p?.id != null && isQuarterback(p));
  if (!quarterbacks.length) return null;

  const current = (await bdl.getNcaafPlayerSeasonStats({ teamId: team.id, season })) || [];
  const now = leader(current, quarterbacks, season, false);
  if (now) return now;

  // No current line yet: last season, for THIS roster's quarterbacks only.
  const prior = (await bdl.getNcaafPlayerSeasonStats({
    playerIds: quarterbacks.map((q) => q.id), season: season - 1,
  })) || [];
  return leader(prior, quarterbacks, season - 1, true);
}

/**
 * One row per side with a passing line on file: the headline names the
 * leader and the season the numbers come from; the detail carries the line;
 * the meta records the plate's numbers.
 */
export async function computeNcaafQbWatch(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league !== 'ncaaf') return [];
  if (!bdl || !Number.isInteger(Number(season))) return [];

  const rows = [];
  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id) continue;

    for (const side of [{ key: 'away', team: awayTeam }, { key: 'home', team: homeTeam }]) {
      let found = null;
      try {
        found = await sideLeader(bdl, side.team, Number(season));
      } catch (err) {
        console.warn(`[ncaafQbWatch] ${teamAbbr(side.team)} passer lookup failed: ${err?.message || err}`);
        continue;
      }
      if (!found) continue;
      const { qb, line } = found;
      const name = playerName(qb);
      if (!name) continue;
      const abbr = teamAbbr(side.team);
      const games = line.games ? ` over ${line.games} game${line.games === 1 ? '' : 's'}` : '';

      rows.push(makeRow({
        category: 'quarterback',
        headline: line.prior
          ? `${name} is ${abbr}'s returning passer on ${line.season} numbers`
          : `${name} leads ${abbr}'s passing this season`,
        detail: line.prior
          ? `His ${line.season} season line: ${line.text}${games}. He is on ${abbr}'s active roster this season; the current season has no passing line for him yet.`
          : `His ${line.season} line so far: ${line.text}${games}.`,
        game: helpers.gameLabel(game),
        value: `${line.ypa.toFixed(2)} Y/A`,
        tone: TONES.NEUTRAL,
        relevance_score: line.prior ? 60 : 68,
        player_id: qb.id,
        team_id: side.team.id,
        game_id: game.id,
        meta: {
          source: 'balldontlie_ncaaf_players+player_season_stats',
          stats_season: line.season,
          prior_season_line: line.prior,
          through: date,
          // THE QUARTERBACKS plates (the ARMS layout): the passer, his side,
          // and the line as numbers. The sentence above stays the prose form.
          qb: name,
          abbr,
          side: side.key,
          team_id: side.team.id,
          passing: {
            yards: line.yards, pct: line.pct, ypa: line.ypa, td: line.td, ints: line.ints,
            games: line.games, season: line.season, prior: line.prior,
          },
        },
      }));
    }
  }

  await attachLaneReads('ncaafQbWatch', rows, detailFact, {
    ask: 'what this passer\'s line says about how his offense actually moves the ball — volume, efficiency, or ball security — and what kind of test this matchup is for that',
  });

  console.log(`[ncaafQbWatch] NCAAF ${date}: ${rows.length} passer row(s)`);
  return rows;
}

export default { computeNcaafQbWatch };
