import { ballDontLieService } from './ballDontLieService.js';
import { MlbRequiredDataError } from './mlbDataReadiness.js';

const normalized = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const etDate = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const matchesClub = (mlb, bdl, side) => {
  const team = bdl[`${side}_team`] || (side === 'away' ? bdl.visitor_team : null);
  return [team?.display_name, team?.full_name, bdl[`${side}_team_name`], team?.name]
    .some(name => name && normalized(name) === normalized(mlb.teams?.[side]?.team?.name));
};

/** Join completed StatsAPI games to BDL boxes by matchup and date/time.
 * BDL MLB ignores NBA's start_date/end_date; dates[] is the supported filter.
 * A calendar date alone cannot identify either club's game or a doubleheader.
 */
export async function loadMlbRecentBoxScores(clubs, service = ballDontLieService) {
  try {
    const requested = clubs.flatMap(({ teamId, games }) => (games || []).slice(-4)
      .map(game => ({ teamId, game })));
    if (!requested.length) return { byGame: new Map(), gameCount: 0, recordCount: 0 };
    const dates = [...new Set(requested.flatMap(({ game }) => {
      const date = game.officialDate || etDate(game.gameDate);
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return [date, next.toISOString().slice(0, 10)];
    }))];
    const games = await service.getGames('baseball_mlb', {
      dates, team_ids: [...new Set(clubs.map(club => club.teamId))],
      per_page: 100, paginateAll: true,
    });
    const matched = new Map();
    for (const { game } of requested) {
      if (!game.gamePk) throw new Error('recent StatsAPI game has no gamePk');
      const candidates = [...new Map(games.filter(row => row.id != null
        && Number.isFinite(Date.parse(row.date))
        && etDate(row.date) === (game.officialDate || etDate(game.gameDate))
        && matchesClub(game, row, 'home') && matchesClub(game, row, 'away'))
        .map(row => [String(row.id), row])).values()];
      const exact = candidates.filter(row => Date.parse(row.date) === Date.parse(game.gameDate));
      const matches = exact.length ? exact : candidates;
      if (matches.length !== 1) throw new Error(`recent game ${game.gamePk} resolved to ${matches.length} BDL games`);
      matched.set(String(game.gamePk), matches[0]);
    }
    const gameIds = [...new Set([...matched.values()].map(game => game.id))];
    const stats = await service.getMlbGameStats({ gameIds, throwOnError: true });
    const byGame = new Map();
    for (const [gamePk, game] of matched) {
      byGame.set(gamePk, stats.filter(row => String(row.game_id) === String(game.id)));
    }
    for (const { game, teamId } of requested) {
      const rows = byGame.get(String(game.gamePk)).filter(row => String(row.team?.id) === String(teamId));
      if (!rows.length || rows.some(row => !row.player?.id)) {
        throw new Error(`recent game ${game.gamePk} missing named box stats for BDL team ${teamId}`);
      }
    }
    return { byGame, gameCount: gameIds.length, recordCount: [...byGame.values()].reduce((n, rows) => n + rows.length, 0) };
  } catch (error) {
    throw new MlbRequiredDataError(`recent box scores: ${error.message}`);
  }
}
