// Team one-run records, computed from observed final scores for slate teams.
// Pitcher expected ERA is excluded by Gary's app-wide metric policy.
import { makeRow, TONES, scoreFromEdge, pct3 } from '../shared.js';

const MIN_ONE_RUN_GAMES = 12;
const ONE_RUN_WIN_PCT_EXTREME = 0.640;
const MAX_TEAM_ROWS = 6;
const REL_ONE_RUN_SCALE = 120;

export async function computeRegressionWatch({ games, season, bdl }) {
  try {
    const seasonIndex = await bdl.getMlbSeasonGameIndex(season);
    return oneRunRegression(seasonIndex, games, collectSlateTeamIds(games)).slice(0, MAX_TEAM_ROWS);
  } catch (err) {
    console.error('[regressionWatch] one-run index error:', err?.message || err);
    return [];
  }
}

function collectSlateTeamIds(games) {
  const ids = new Set();
  for (const g of games) {
    if (g?.home_team?.id != null) ids.add(g.home_team.id);
    if (g?.visitor_team?.id != null) ids.add(g.visitor_team.id);
  }
  return ids;
}

/** Map a team id -> the slate game (label/game_id) it appears in. */
function gameForTeamId(games, teamId) {
  for (const g of games) {
    if (g?.home_team?.id === teamId || g?.visitor_team?.id === teamId) return g;
  }
  return null;
}

/**
 * Surface teams whose ONE-RUN record win% is extreme. Jul 30: BDL standings
 * NEVER carried a one-run field under any name — the old existence-checked
 * probe meant this signal was silently dead since Jun 19. The record is now
 * COMPUTED from the season game index (final scores, margin exactly 1,
 * regular season only) — real data, same surfacing gates.
 */
function oneRunRegression(seasonIndex, games, slateTeamIds) {
  if (!seasonIndex || typeof seasonIndex.values !== 'function') return [];
  const tallies = new Map(); // teamId -> { w, l }
  for (const g of seasonIndex.values()) {
    if (g.status !== 'STATUS_FINAL' || g.seasonType === 'spring_training') continue;
    const hr = Number(g.homeRuns), ar = Number(g.awayRuns);
    if (!Number.isFinite(hr) || !Number.isFinite(ar) || Math.abs(hr - ar) !== 1) continue;
    for (const [tid, won] of [[g.homeId, hr > ar], [g.awayId, ar > hr]]) {
      if (tid == null || !slateTeamIds.has(tid)) continue;
      const t = tallies.get(tid) || { w: 0, l: 0 };
      won ? t.w++ : t.l++;
      tallies.set(tid, t);
    }
  }

  const out = [];
  for (const [teamId, { w, l }] of tallies) {
    const gp = w + l;
    if (gp < MIN_ONE_RUN_GAMES) continue;
    const wp = w / gp;
    if (Math.abs(wp - 0.5) < (ONE_RUN_WIN_PCT_EXTREME - 0.5)) continue;

    const game = gameForTeamId(games, teamId);
    if (!game) continue;

    const lucky = wp > 0.5;
    const side = game.home_team?.id === teamId ? game.home_team : game.visitor_team;
    const teamName = side?.full_name || side?.display_name || side?.name || 'Team';
    out.push(
      makeRow({
        category: 'regressionWatch',
        headline: `${teamName} are ${w}-${l} in one-run games (${pct3(wp)} win%)`,
        detail:
          `${teamName} own a ${w}-${l} record in one-run games — a ${pct3(wp)} ` +
          `win rate that is largely high-variance and tends to regress toward .500. ` +
          `Their overall record may ${lucky ? 'overstate' : 'understate'} their ` +
          `true strength relative to where the market prices them.`,
        game: game.home_team && game.visitor_team
          ? `${game.visitor_team.abbreviation || game.visitor_team.name} @ ${game.home_team.abbreviation || game.home_team.name}`
          : 'TBD',
        value: `${w}-${l}`,
        tone: lucky ? TONES.CAUTION : TONES.EDGE,
        spark: [w, l],
        relevance_score: scoreFromEdge(Math.abs(wp - 0.5), { scale: REL_ONE_RUN_SCALE, base: 40 }),
        team_id: teamId,
        game_id: game.id,
      }),
    );
  }
  return out.sort((a, b) => b.relevance_score - a.relevance_score);
}
