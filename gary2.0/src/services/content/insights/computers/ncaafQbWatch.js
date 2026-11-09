import { getNcaafGameContext } from '../../../sports/ncaaf/ncaafGameContext.js';
import { cleanNcaafPlayerRows } from '../../../gary/agentic/scoutReport/sports/ncaafPlayerEvidence.js';
// Both named starters come from dated reporting, joined to BDL rosters.
// Passing stats describe that player; they never select or imply a starter.
// BDL dated game rows determine the stated season and sample.

import { makeRow, TONES } from '../shared.js';
import { gamesWithRowsToday, runWithinBudget } from '../ncaafLaneLedger.js';
import { quarterbackRecent } from '../quarterbackRecent.js';
import { toTeamResults } from '../../../gary/agentic/tools/statRouters/footballTeamGames.js';

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
function aggregate(rows, season) {
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
  return {
    text: `${yards} passing yards, ${pct.toFixed(1)}% completions, ${ypa.toFixed(2)} yards per attempt, ${td}-${ints} TD-INT`,
    attempts, yards, pct, ypa, td, ints, games: thrown.length, season,
  };
}

/** Game id -> opponent and site for both teams' games this season; college stat rows carry no teams. */
async function pairSchedule(bdl, teams, season) {
  const index = new Map();
  try {
    const games = await bdl.getGames('americanfootball_ncaaf', { team_ids: teams.map(t => t.id), seasons: [season], per_page: 100 }, 10);
    for (const team of teams) {
      for (const r of toTeamResults(games, team.id)) if (r.gameId != null) index.set(`${team.id}:${r.gameId}`, r);
    }
  } catch (err) {
    console.warn(`[ncaafQbWatch] schedule lookup failed: ${err?.message || err}`);
  }
  return index;
}

function gameFacts(r, schedule) {
  const side = schedule.get(`${r.team?.id}:${r.game?.id}`) || {};
  return {
    opp: side.opponent ?? null, oppId: side.opponentId ?? null, home: side.home ?? null,
    comp: finite(r.passing_completions), att: finite(r.passing_attempts), yds: finite(r.passing_yards),
    td: finite(r.passing_touchdowns), ints: finite(r.passing_interceptions),
    rushAtt: finite(r.rushing_attempts), rushYds: finite(r.rushing_yards), rushTd: finite(r.rushing_touchdowns),
  };
}

/** THE QUARTERBACKS write-up for each game with both starters; the plain line stays when it can't be written. */
export async function attachQuarterbackTakes(rows, write) {
  const byGame = new Map();
  for (const row of rows) {
    if (row.game_id == null || !row.meta?.side) continue;
    const pair = byGame.get(String(row.game_id)) || {};
    pair[row.meta.side] = row;
    byGame.set(String(row.game_id), pair);
  }
  const games = [...byGame].filter(([, p]) => p.away && p.home)
    .map(([id, p]) => ({ gameKey: `bdl:${id}`, matchup: `${p.away.meta.abbr} @ ${p.home.meta.abbr}`, away: p.away, home: p.home }));
  if (!games.length) return 0;
  // Loaded when there is a game to write: the writer brings the model session code with it.
  const takes = await (write ?? (await import('../../tomorrowBoard/armsTakes.js')).writeQuarterbackTakes)(games);
  for (const g of games) {
    const t = takes.get(g.gameKey);
    if (!t) continue;
    g.away.meta.read = t[0];
    g.home.meta.read = t[1];
  }
  return takes.size;
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
  const schedule = await pairSchedule(bdl, sides.map(s => s.team), season);
  const rows = [];
  for (const side of sides) {
    const qb = side.evidence?.quarterback;
    if (!qb) continue;
    const own = current.filter(r => String(r.player.id) === String(qb.player_id) && String(r.team?.id) === String(side.team.id));
    // This season only (founder, Oct 23 2026): a transfer or a starter under the
    // floor shows no line, never last year's.
    const line = aggregate(own, season);
    const opponent = sides.find(s => s.key !== side.key)?.team;
    const recent = quarterbackRecent(own.map(r => ({ ...gameFacts(r, schedule), date: r.game?.date })), {
      kickoff: game.date || game.commence_time, opponentId: opponent?.id,
    });
    const abbr = teamAbbr(side.team), school = side.team.college || side.team.full_name || abbr;
    const report = qb.sources.map(id => side.evidence.sources.find(s => s.id === id)).filter(Boolean);
    // The search's note on the starter is written for Gary's desk, not the page
    // (founder, Nov 9 2026: it read as internal commentary). The section reads
    // the quarterback's games, as MLB's reads the pitcher's starts.
    const intro = `${qb.name} is ${abbr}'s ${qb.status} starting quarterback.`;
    const detail = `${intro}${line ? ` ${line.season} line: ${line.text} over ${line.games} games.` : ' No verified passing sample is available yet.'}`;
    rows.push(makeRow({ category: 'quarterback', headline: `${qb.name} is ${abbr}'s ${qb.status} starter`,
      detail, game: helpers.gameLabel(game), value: line ? `${line.ypa.toFixed(2)} Y/A` : qb.status.toUpperCase(),
      tone: TONES.NEUTRAL, relevance_score: 75, player_id: qb.player_id, team_id: side.team.id, game_id: game.id,
      meta: { source: 'ncaaf_game_context_v1', qb: qb.name, qb_status: qb.status, school, abbr, side: side.key,
        team_id: side.team.id, sources: report, source_collected_at: context.observed_at, through: date,
        read: detail, recent, stats_season: line?.season ?? null,
        passing: line ? { yards: line.yards, pct: line.pct, ypa: line.ypa, td: line.td, ints: line.ints,
          games: line.games, attempts: line.attempts, season: line.season } : null },
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

  const written = await attachQuarterbackTakes(rows);
  console.log(`[ncaafQbWatch] NCAAF ${date}: ${rows.length} passer row(s), ${written} game write-up(s)`);
  return rows;
}

export default { computeNcaafQbWatch };
