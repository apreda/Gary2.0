// Team one-run records, computed from observed final scores for slate teams.
// Pitcher expected ERA is excluded by Gary's app-wide metric policy.
import { makeRow, TONES, scoreFromEdge, pct3 } from '../shared.js';
import { oneRunResearchDetail, observedCount, RESEARCH_FACTS_VERSION } from '../researchFacts.js';

const MIN_ONE_RUN_GAMES = 12;
const ONE_RUN_WIN_PCT_EXTREME = 0.640;
const MAX_TEAM_ROWS = 6;
const REL_ONE_RUN_SCALE = 120;

export async function computeRegressionWatch({ games, season, date, bdl }) {
  if (!Array.isArray(games) || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')
    || String(season) !== date.slice(0, 4)) return [];
  try {
    const seasonIndex = await bdl.getMlbSeasonGameIndex(season, 60, { throwOnError: true });
    return oneRunRegression(seasonIndex, games, collectSlateTeamIds(games), season, date).slice(0, MAX_TEAM_ROWS);
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
function oneRunRegression(seasonIndex, games, slateTeamIds, season, date) {
  if (!seasonIndex || typeof seasonIndex.values !== 'function') return [];
  const tallies = new Map(); // exact team -> one-run / other final-game records
  const incomplete = new Set();
  const etDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
  const slateIds = new Set(games.map(game => String(game.id)));
  for (const [gameId, g] of seasonIndex) {
    if (g.status !== 'STATUS_FINAL' || g.seasonType !== 'regular' || g.postseason === true || slateIds.has(String(gameId))) continue;
    const instant = typeof g.date === 'string' && g.date.includes('T') ? Date.parse(g.date) : NaN;
    const gameDate = Number.isFinite(instant) ? etDate.format(new Date(instant)) : null;
    if (gameDate && (gameDate >= date || gameDate.slice(0, 4) !== String(season))) continue;
    const hr = observedCount(g.homeRuns), ar = observedCount(g.awayRuns);
    if (!gameDate || hr === null || ar === null || hr === ar) {
      for (const tid of [g.homeId, g.awayId]) if (slateTeamIds.has(tid)) incomplete.add(tid);
      continue;
    }
    for (const [tid, won] of [[g.homeId, hr > ar], [g.awayId, ar > hr]]) {
      if (tid == null || !slateTeamIds.has(tid)) continue;
      const t = tallies.get(tid) || { w: 0, l: 0, ow: 0, ol: 0, ids: [], through: gameDate };
      if (Math.abs(hr - ar) === 1) won ? t.w++ : t.l++;
      else won ? t.ow++ : t.ol++;
      t.ids.push(gameId);
      if (gameDate > t.through) t.through = gameDate;
      tallies.set(tid, t);
    }
  }

  const out = [];
  for (const [teamId, { w, l, ow, ol, ids, through }] of tallies) {
    if (incomplete.has(teamId)) continue;
    const gp = w + l;
    if (gp < MIN_ONE_RUN_GAMES) continue;
    const wp = w / gp;
    if (Math.abs(wp - 0.5) < (ONE_RUN_WIN_PCT_EXTREME - 0.5)) continue;

    const game = gameForTeamId(games, teamId);
    if (!game) continue;

    const side = game.home_team?.id === teamId ? game.home_team : game.visitor_team;
    const teamName = side?.full_name || side?.display_name || side?.name || 'Team';
    const meta = { kind: 'one_run_record', season, team_name: teamName,
      one_run_wins: w, one_run_losses: l, other_wins: ow, other_losses: ol,
      source: 'BALLDONTLIE completed regular-season games', source_game_ids: ids,
      through_date: through, history_before: date, research_facts_version: RESEARCH_FACTS_VERSION,
      source_collected_at: new Date().toISOString() };
    const detail = oneRunResearchDetail(meta);
    if (!detail) continue;
    Object.assign(meta, { computed_detail: detail, computed_detail_kind: 'measured_research', evidence: detail, read: detail });
    out.push(
      makeRow({
        category: 'regressionWatch',
        headline: `${teamName} are ${w}-${l} in one-run games (${pct3(wp)} win rate)`,
        detail,
        game: game.home_team && game.visitor_team
          ? `${game.visitor_team.abbreviation || game.visitor_team.name} @ ${game.home_team.abbreviation || game.home_team.name}`
          : 'TBD',
        value: `${w}-${l}`,
        tone: TONES.NEUTRAL,
        spark: [w, l],
        relevance_score: scoreFromEdge(Math.abs(wp - 0.5), { scale: REL_ONE_RUN_SCALE, base: 40 }),
        team_id: teamId,
        game_id: game.id,
        meta,
      }),
    );
  }
  return out.sort((a, b) => b.relevance_score - a.relevance_score);
}
