// Grounded NFL quarterback lane — the named starters and their real lines.
//
// Source contract: BDL roster depth names each side's QB1; BDL season_stats
// carries his actual passing line. Through the preseason the current season
// has no rows yet, so the lane reads the PRIOR season and says so in the same
// sentence — a labeled last-year line is honest, an unlabeled one is not.
// A quarterback with no line in either season (a rookie) still gets his row:
// the roster facts (experience, college) are real data too.
// NFL-only: roster depth is an NFL feed.

import { makeRow, TONES } from '../shared.js';
import { attachLaneReads, detailFact } from '../laneReads.js';

function fixed(value, decimals = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(decimals).replace(/\.0+$|(?<=\.[0-9])0+$/g, '');
}

function passingLine(stat) {
  if (!stat) return null;
  const pct = fixed(stat.passing_completion_pct);
  const ypa = fixed(stat.yards_per_pass_attempt, 2);
  const yards = Number(stat.passing_yards);
  const td = Number(stat.passing_touchdowns);
  const ints = Number(stat.passing_interceptions);
  const games = Number(stat.games_played);
  const parts = [];
  if (Number.isFinite(yards)) parts.push(`${yards} passing yards`);
  if (pct != null) parts.push(`${pct}% completions`);
  if (ypa != null) parts.push(`${ypa} yards per attempt`);
  if (Number.isFinite(td) && Number.isFinite(ints)) parts.push(`${td}-${ints} TD-INT`);
  if (!parts.length) return null;
  return { text: parts.join(', '), games: Number.isFinite(games) ? games : null, ypa, pct, td, ints };
}

async function seasonLineFor(bdl, playerId, season) {
  if (!playerId) return null;
  const current = (await bdl.getNflPlayerSeasonStats({ playerId, season })) || [];
  const currentLine = passingLine(current[0]);
  if (currentLine) return { ...currentLine, season, prior: false };
  const prior = (await bdl.getNflPlayerSeasonStats({ playerId, season: season - 1 })) || [];
  const priorLine = passingLine(prior[0]);
  if (priorLine) return { ...priorLine, season: season - 1, prior: true };
  return null;
}

/**
 * One row per named starting quarterback on the slate. The headline names the
 * start; the detail carries his real line with its season named; the meta
 * records exactly which season the numbers came from.
 */
export async function computeFootballQbWatch(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league !== 'nfl') return [];

  const rows = [];
  for (const game of games || []) {
    const awayTeam = game?.away_team ?? game?.visitor_team;
    const homeTeam = game?.home_team;
    if (game?.id == null || !awayTeam?.id || !homeTeam?.id) continue;

    let depth = null;
    try {
      depth = await bdl.getNflRosterDepth(
        homeTeam.full_name ?? homeTeam.name,
        awayTeam.full_name ?? awayTeam.name,
        season,
      );
    } catch (err) {
      console.warn(`[footballQbWatch] roster depth failed for game ${game.id}: ${err?.message || err}`);
      continue;
    }

    const sides = [
      { key: 'away', team: awayTeam, players: depth?.away || [] },
      { key: 'home', team: homeTeam, players: depth?.home || [] },
    ];

    for (const side of sides) {
      const qb = side.players.find((p) => String(p?.position).toUpperCase() === 'QB' && Number(p?.depth) === 1);
      if (!qb?.name) continue;
      const abbr = side.team.abbreviation || side.team.name || 'TEAM';

      let line = null;
      try {
        line = await seasonLineFor(bdl, qb.id, season);
      } catch (err) {
        console.warn(`[footballQbWatch] season stats failed for ${qb.name}: ${err?.message || err}`);
      }

      const rosterBits = [qb.experience, qb.college ? `out of ${qb.college}` : null].filter(Boolean).join(', ');
      const injuryNote = qb.injuryStatus
        ? ` He is listed ${String(qb.injuryStatus).toLowerCase()} on the injury report.`
        : '';

      const detail = line
        ? `${line.prior ? `His ${line.season} season line` : `His ${line.season} line so far`}: ${line.text}${line.games ? ` over ${line.games} game${line.games === 1 ? '' : 's'}` : ''}.${injuryNote}`
        : `${rosterBits ? `${rosterBits[0].toUpperCase()}${rosterBits.slice(1)}. ` : ''}No ${season} or ${season - 1} passing line on file yet.${injuryNote}`;

      rows.push(makeRow({
        category: 'quarterback',
        headline: `${qb.name} starts at quarterback for ${abbr}`,
        detail,
        game: helpers.gameLabel(game),
        value: line?.ypa != null ? `${line.ypa} Y/A` : (line?.pct != null ? `${line.pct} PCT` : 'QB1'),
        tone: TONES.NEUTRAL,
        relevance_score: Math.min(88, 52 + (line ? 14 : 0) + (qb.injuryStatus ? 10 : 0)),
        player_id: qb.id,
        team_id: side.team.id,
        game_id: game.id,
        meta: {
          source: 'balldontlie_roster_depth+season_stats',
          stats_season: line?.season ?? null,
          prior_season_line: line?.prior ?? null,
          injury_status: qb.injuryStatus || null,
          through: date,
        },
      }));
    }
  }

  await attachLaneReads('footballQbWatch', rows, detailFact, {
    ask: 'what this quarterback\'s line says about how he actually wins — arm volume, efficiency, or ball security — and what kind of test tonight\'s matchup is for that style',
  });

  console.log(`[footballQbWatch] NFL ${date}: ${rows.length} starter row(s)`);
  return rows;
}

export default { computeFootballQbWatch };
