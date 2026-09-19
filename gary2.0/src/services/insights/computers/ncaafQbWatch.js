import { getNcaafGameContext } from '../../ncaafGameContext.js';
import { cleanNcaafPlayerRows } from '../../agentic/scoutReport/sports/ncaafPlayerEvidence.js';
// Both named starters come from dated reporting, joined to BDL rosters.
// Passing stats describe that player; they never select or imply a starter.
// BDL dated game rows determine the stated season and sample.

import { makeRow, TONES } from '../shared.js';
import { gamesWithRowsToday, runWithinBudget } from '../ncaafLaneLedger.js';

/** Minimum sample for a meaningful rate; identity does not depend on it. */
export const MIN_ATTEMPTS = 15;

function finite(value) {
  const n = value == null || value === '' ? NaN : Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, decimals) {
  return Number(Number(value).toFixed(decimals));
}

function teamAbbr(team) {
  return team?.abbreviation || team?.college || team?.name || 'TEAM';
}

/** Sum a passer's per-game rows into the plate's numbers; null under the floor. */
function aggregate(rows, season, prior) {
  const thrown = rows.filter((r) => (finite(r?.passing_attempts) ?? 0) > 0);
  const attempts = thrown.reduce((s, r) => s + finite(r.passing_attempts), 0);
  if (attempts < MIN_ATTEMPTS) return null;
  if (thrown.some(r => ['passing_completions', 'passing_yards', 'passing_touchdowns', 'passing_interceptions'].some(field => finite(r[field]) === null))) return null;
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

async function gameRows({ game, season, bdl, helpers, date }) {
  const context = await getNcaafGameContext({ game, date, bdl });
  if (!context.sides) return [];
  const sides = ['away', 'home'].map(key => ({ key, team: key === 'home' ? game.home_team : game.away_team ?? game.visitor_team, evidence: context.sides[key] }));
  const ids = sides.map(s => s.evidence?.quarterback?.player_id).filter(id => id != null);
  if (!ids.length) return [];
  const cutoff = new Date(Math.min(Date.now(), Date.parse(game.date || game.commence_time || `${date}T23:59:59Z`)));
  const currentRaw = await bdl.getNcaafPlayerGameStats({ playerIds: ids, season }) || [];
  const current = cleanNcaafPlayerRows(currentRaw, { season, playerIds: ids, asOf: cutoff }).rows;
  const rows = [];
  for (const side of sides) {
    const qb = side.evidence?.quarterback;
    if (!qb) continue;
    let line = aggregate(current.filter(r => String(r.player.id) === String(qb.player_id) && String(r.team?.id) === String(side.team.id)), season, false);
    if (!line) {
      const prior = await bdl.getNcaafPlayerGameStats({ playerIds: [qb.player_id], season: season - 1 }) || [];
      line = aggregate(cleanNcaafPlayerRows(prior, { season: season - 1, playerIds: [qb.player_id], asOf: cutoff }).rows, season - 1, true);
    }
    const abbr = teamAbbr(side.team), school = side.team.college || side.team.full_name || abbr;
    const report = qb.sources.map(id => side.evidence.sources.find(s => s.id === id)).filter(Boolean);
    const intro = `${qb.name} is ${abbr}'s ${qb.status} starting quarterback. ${qb.note || ''}`;
    const detail = `${intro}${line ? ` ${line.season}${line.prior ? ' prior-season' : ''} line: ${line.text} over ${line.games} games${line.prior && line.team ? ` for ${line.team}` : ''}.` : ' No verified passing sample is available yet.'}`;
    rows.push(makeRow({ category: 'quarterback', headline: `${qb.name} is ${abbr}'s ${qb.status} starter`,
      detail, game: helpers.gameLabel(game), value: line ? `${line.ypa.toFixed(2)} Y/A` : qb.status.toUpperCase(),
      tone: TONES.NEUTRAL, relevance_score: 75, player_id: qb.player_id, team_id: side.team.id, game_id: game.id,
      meta: { source: 'ncaaf_game_context_v1', qb: qb.name, qb_status: qb.status, school, abbr, side: side.key,
        team_id: side.team.id, sources: report, source_collected_at: context.observed_at, through: date,
        read: detail, stats_season: line?.season ?? null, prior_season_line: line?.prior ?? null,
        passing: line ? { yards: line.yards, pct: line.pct, ypa: line.ypa, td: line.td, ints: line.ints,
          games: line.games, attempts: line.attempts, season: line.season, prior: line.prior } : null },
    }));
  }
  return rows;
}

/** One row per evidenced starting quarterback, including a debut with no stats. */
export async function computeNcaafQbWatch(ctx) {
  const { games, season, bdl, helpers, date } = ctx;
  const league = String(ctx?.league || '').toLowerCase();
  if (league !== 'ncaaf') return [];
  if (!bdl || !Number.isInteger(Number(season)) || !(games || []).length) return [];

  const done = ctx.forceRefresh ? new Set() : await gamesWithRowsToday({ date, category: 'quarterback', source: 'ncaaf_game_context_v1', requireBothSides: true });
  const rows = await runWithinBudget({
    games, done, label: 'ncaafQbWatch',
    work: (game) => gameRows({ game, season: Number(season), bdl, helpers, date }),
  });

  console.log(`[ncaafQbWatch] NCAAF ${date}: ${rows.length} passer row(s)`);
  return rows;
}

export default { computeNcaafQbWatch };
