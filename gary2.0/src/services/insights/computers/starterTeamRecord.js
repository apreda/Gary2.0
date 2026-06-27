// gary2.0/src/services/insights/computers/starterTeamRecord.js
//
// LANE: starterTeamRecord  (category token emitted: starter_team_record)
// TEAM angle — "the Pirates are 0-8 in Paul Skenes' last 8 starts."
// The hard-to-find connection a bettor relies on: a team that can't (or always
// does) win when tonight's probable starter is on the mound, regardless of how
// the pitcher himself throws.
//
// Approach (documented BDL methods only — no new external API):
//   - For each slate game, take BOTH probable starters from getMlbLineups(gameId)
//     (pitcher per side; the starterForm.js path proves this resolves live), with
//     the side's team id off the normalized game.
//   - getMlbPlayerGameRowsChrono(playerId, season): his completed-game rows
//     oldest -> newest (STATUS_FINAL, non-spring). ip > 0 rows = his starts;
//     tonight's slate game excluded. Take the last WINDOW_STARTS game_ids.
//   - getGames('baseball_mlb', { team_ids:[teamId], seasons:[season] }): the
//     starter's TEAM's games (finals carry home/visitor scores + ids). Map
//     game_id -> did the starter's team WIN. Intersect with his start game_ids
//     to get the team's W/L in his starts. (team_ids naturally scopes to the
//     current team, so a mid-season trade just counts his starts for THIS team.)
//
// Surface only a lopsided record (|wins - losses| >= SURFACE_DIFF over a
// >= MIN_STARTS sample) — that's the angle; a 4-4 split is noise.
//
// Tone: COLD when the team LOSES in his starts (snakebit / fade-the-team),
// HOT when it WINS (back-the-team). value = the record string ("0-8").
//
// TEAM-subject row: team_id + game_id set, player_id OMITTED (firstInning.js is
// the reference team-scoped emitter). game_id is ALWAYS the SLATE game's id, so
// the orchestrator's slate-membership gate keeps it; the pitcher id rides meta.
//
// Defensive: any missing piece -> skip that starter silently; never throws.

import { makeRow, TONES, scoreFromEdge, parseIpThirds } from '../shared.js';

// Tunables.
const WINDOW_STARTS = 8;     // "his last 8 starts"
const MIN_STARTS = 5;        // need a real sample of resolved starts
const SURFACE_DIFF = 4;      // |wins - losses| over the window to be an angle
const MAX_ROWS = 6;          // slate-wide cap, most-lopsided first
const RELEVANCE_SCALE = 14;

export async function computeStarterTeamRecord(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const candidates = [];
  const stats = { examined: 0, emitted: 0 };

  for (const game of games) {
    try {
      candidates.push(...(await forGame(
        game, { season, bdl, gameLabel: helpers.gameLabel, stats },
      )));
    } catch (err) {
      console.error('[starterTeamRecord] game error:', err?.message || err);
    }
  }

  candidates.sort((a, b) => b.relevance_score - a.relevance_score);
  const rows = candidates.slice(0, MAX_ROWS);
  stats.emitted = rows.length;
  console.log(`[starterTeamRecord] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

async function forGame(game, { season, bdl, gameLabel, stats }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  if (String(game?.status || '').toUpperCase().includes('FINAL')) return [];
  const label = gameLabel(game);

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  const sides = [
    { abbr: game?.home_team?.abbreviation, teamId: game?.home_team?.id, teamName: game?.home_team?.name },
    { abbr: game?.visitor_team?.abbreviation, teamId: game?.visitor_team?.id, teamName: game?.visitor_team?.name },
  ];

  const out = [];
  for (const { abbr, teamId, teamName } of sides) {
    const pitcher = abbr ? lineups[abbr]?.pitcher : null;
    const playerId = pitcher?.playerId;
    if (playerId == null || teamId == null) continue;
    if (stats) stats.examined += 1;

    // His start game_ids, oldest -> newest, excluding tonight's game.
    let chrono = [];
    try {
      chrono = (await bdl.getMlbPlayerGameRowsChrono(playerId, season)) || [];
    } catch (err) {
      console.error('[starterTeamRecord] chrono error:', err?.message || err);
      continue;
    }
    const startIds = chrono
      .filter((r) => r.game_id !== gameId && parseIpThirds(r.ip) > 0)
      .map((r) => r.game_id);
    if (startIds.length < MIN_STARTS) continue;
    const windowIds = startIds.slice(-WINDOW_STARTS);

    // Derive W/L from the SAME season game index the chrono uses (matching id
    // space + final runs). getGames is first-page-only (25 spring games) and
    // unusable for a team's full-season finals.
    let index;
    try {
      index = await bdl.getMlbSeasonGameIndex(season);
    } catch (err) {
      console.error('[starterTeamRecord] game index error:', err?.message || err);
      continue;
    }
    const results = [];
    for (const id of windowIds) {
      const g = index.get(id);
      if (!g || !String(g.status || '').toUpperCase().includes('FINAL')) continue;
      const hr = Number(g.homeRuns);
      const ar = Number(g.awayRuns);
      if (!Number.isFinite(hr) || !Number.isFinite(ar) || hr === ar) continue;
      const isHome = g.homeId === teamId;
      if (!isHome && g.awayId !== teamId) continue;
      const teamRuns = isHome ? hr : ar;
      const oppRuns = isHome ? ar : hr;
      results.push(teamRuns > oppRuns);
    }
    if (results.length < MIN_STARTS) continue;
    const wins = results.filter(Boolean).length;
    const losses = results.length - wins;
    const diff = Math.abs(wins - losses);
    if (diff < SURFACE_DIFF) continue;

    // Current streak in his starts (consecutive same result, most recent back).
    const last = results[results.length - 1];
    let streak = 0;
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i] === last) streak += 1; else break;
    }

    const teamLosing = losses > wins;
    const name = pitcher.name || 'the starter';
    const team = teamName || abbr || 'The team';
    const n = results.length;
    const record = `${wins}-${losses}`;

    const headline = `${team} ${record} in ${name}'s last ${n} starts`;
    const streakClause = streak >= 3
      ? ` — ${teamLosing ? 'losers' : 'winners'} of his last ${streak} in a row`
      : '';
    const detail = `${team} are ${record} in ${name}'s last ${n} starts this season${streakClause}. He starts tonight.`;

    out.push(makeRow({
      category: 'starterTeamRecord',
      headline,
      detail,
      game: label,
      value: record,
      tone: teamLosing ? TONES.COLD : TONES.HOT,
      relevance_score: scoreFromEdge(diff + (streak === n ? 2 : 0), { scale: RELEVANCE_SCALE, base: 50 }),
      team_id: teamId,
      game_id: gameId,            // SLATE game id — slate-membership gate
      meta: {
        kind: 'starter_team_record',
        pitcher: name,
        pitcher_id: playerId,
        wins,
        losses,
        starts: n,
        streak,
        streak_kind: teamLosing ? 'loss' : 'win',
      },
    }));
  }
  return out;
}

export default { computeStarterTeamRecord };
