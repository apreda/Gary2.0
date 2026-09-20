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
import { footballSeasonLive } from '../footballData.js';

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
  return {
    text: parts.join(', '),
    games: Number.isFinite(games) ? games : null,
    yards: Number.isFinite(yards) ? yards : null,
    ypa: ypa != null ? Number(ypa) : null,
    pct: pct != null ? Number(pct) : null,
    td: Number.isFinite(td) ? td : null,
    ints: Number.isFinite(ints) ? ints : null,
  };
}

function joinedClauses(parts) {
  const clean = parts.filter(Boolean);
  if (clean.length <= 1) return clean[0] || '';
  if (clean.length === 2) return clean.join(' and ');
  return `${clean.slice(0, -1).join(', ')} and ${clean.at(-1)}`;
}

/**
 * Grounded prose for the visible QB take. Like the college QB lane, this is
 * deterministic from the named starter and his verified passing sample: the
 * section never depends on an optional content pass and never exposes the
 * collector's comma-separated stat dump in the prose box.
 */
export function quarterbackWriteup(row, season) {
  const meta = row?.meta || {};
  const name = meta.qb || 'The starting quarterback';
  const line = meta.passing;
  const injury = meta.injury_status
    ? ` ${name} is also listed ${String(meta.injury_status).toLowerCase()} for this matchup.`
    : '';

  if (!line) {
    const status = meta.qb_status || 'projected';
    const abbr = meta.abbr || 'his team';
    return `${name} is the ${status} starter for ${abbr}, but no ${season} or ${season - 1} passing sample is on file. With no verified line to compare, this is a quarterback designation rather than a performance profile.${injury}`;
  }

  const games = Number(line.games);
  const lineSeason = Number(line.season) || season;
  const scope = line.prior
    ? `In ${lineSeason}`
    : games === 1
      ? `In his first ${lineSeason} game`
      : Number.isFinite(games) && games > 1
        ? `Through ${games} games in ${lineSeason}`
        : `In ${lineSeason}`;
  const measures = joinedClauses([
    Number.isFinite(Number(line.yards)) ? `threw for ${line.yards} passing yards` : null,
    Number.isFinite(Number(line.pct)) ? `completed ${line.pct}% of his passes` : null,
    Number.isFinite(Number(line.ypa)) ? `averaged ${line.ypa} yards per attempt` : null,
  ]);
  const first = `${scope}, ${name} ${measures}.`;

  let second;
  if (Number.isFinite(Number(line.td)) && Number.isFinite(Number(line.ints))) {
    const balance = `${line.td}-${line.ints} touchdown-to-interception line`;
    if (line.prior) {
      second = `His ${balance} puts that prior-season passing production in the context of his ball security over the same sample.`;
    } else if (games === 1) {
      second = `His ${balance} comes from a one-game sample, so the relationship between completion rate and per-throw production is still an early read.`;
    } else {
      second = `His ${balance} rounds out the current sample without turning an early-season profile into a settled one.`;
    }
  } else {
    second = line.prior
      ? 'That is the available prior-season passing profile.'
      : 'The current sample is still too early to treat as a settled passing profile.';
  }
  return `${first} ${second}${injury}`;
}

async function seasonLineFor(bdl, playerId, season, seasonLive = true) {
  if (!playerId) return null;
  // BDL season_stats serves LAST season's line under this season's label until
  // a regular-season game is final (Sep 9 2026, the morning of Week 1: Drake
  // Maye showed a 17-game "2026 line so far"). Until the season is live the
  // prior season is the only honest source, read under its own name.
  if (seasonLive) {
    const current = (await bdl.getNflPlayerSeasonStats({ playerId, season })) || [];
    const currentLine = passingLine(current[0]);
    if (currentLine) return { ...currentLine, season, prior: false };
  }
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

  const seasonLive = await footballSeasonLive(bdl, season);

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
      // Use the same current-depth selection as Gary's game scout. The old
      // QB1-only lane displayed ruled-out players as confirmed starters.
      const qb = typeof bdl.getStartingQBFromDepthChart === 'function'
        ? await bdl.getStartingQBFromDepthChart(side.team.id, season, 'americanfootball_nfl')
        : side.players.filter((p) => String(p?.position).toUpperCase() === 'QB')
          .sort((a, b) => Number(a.depth) - Number(b.depth))
          .find((p) => !/^(o|out|ir|pup|inactive|suspended)$/i.test(p.injuryStatus || ''));
      if (!qb?.name) continue;
      const abbr = side.team.abbreviation || side.team.name || 'TEAM';

      let line = null;
      try {
        line = await seasonLineFor(bdl, qb.id, season, seasonLive);
      } catch (err) {
        console.warn(`[footballQbWatch] season stats failed for ${qb.name}: ${err?.message || err}`);
      }

      const rosterBits = [qb.experience, qb.college ? `out of ${qb.college}` : null].filter(Boolean).join(', ');
      const injuryNote = qb.injuryStatus
        ? ` He is listed ${String(qb.injuryStatus).toLowerCase()} on the injury report.`
        : '';

      // The sentence names him — the plate and the take show the detail on its
      // own, where "His" had no antecedent (Sep 9 2026).
      const surname = qb.name;
      const detail = line
        ? `${line.prior ? `${surname}'s ${line.season} season line` : `${surname}'s ${line.season} line so far`}: ${line.text}${line.games ? ` over ${line.games} game${line.games === 1 ? '' : 's'}` : ''}.${injuryNote}`
        : `${rosterBits ? `${rosterBits[0].toUpperCase()}${rosterBits.slice(1)}. ` : ''}No ${season} or ${season - 1} passing line on file yet.${injuryNote}`;

      rows.push(makeRow({
        category: 'quarterback',
        headline: `${qb.name} is the projected starting quarterback for ${abbr}`,
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
          // THE QUARTERBACKS plates (founder, Sep 3 2026 — MLB's ARMS shows the
          // two starters by name, so does this): the starter, his side, and
          // the line as numbers. The sentence above stays the prose form.
          qb: qb.name,
          qb_status: 'projected',
          abbr,
          side: side.key,
          team_id: side.team.id,
          passing: line
            ? { yards: line.yards, pct: line.pct, ypa: line.ypa, td: line.td, ints: line.ints,
                games: line.games, season: line.season, prior: Boolean(line.prior) }
            : null,
        },
      }));
    }
  }

  // A write-up is part of this section's display contract. Keep the exact
  // collector line behind it for auditability, then publish the grounded
  // prose for every named starter on the uncapped football slate.
  for (const row of rows) {
    const computedDetail = row.meta?.computed_detail || row.detail;
    const read = quarterbackWriteup(row, season);
    row.meta = {
      ...(row.meta || {}),
      computed_detail: computedDetail,
      read,
      research_copy_version: 'grounded-quarterback-writeup-v1',
    };
    row.detail = read;
  }

  console.log(`[footballQbWatch] NFL ${date}: ${rows.length} starter row(s)`);
  return rows;
}

export default { computeFootballQbWatch };
