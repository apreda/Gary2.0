import { ballDontLieService } from '../../../../ballDontLieService.js';
import { isGameCompleted } from '../statRouterCommon.js';

// A team's 20 most recent games this season. BDL lists a season oldest first, so a 20-row page was October
// (audit, Oct 13 2026); read the whole season and keep the newest.
export const recentSeasonGames = async (bdlSport, teamId, season, count = 20) => {
  const games = await ballDontLieService.getGames(bdlSport, { team_ids: [teamId], seasons: [season], per_page: 100, paginateAll: true });
  return (games || []).filter((g) => isGameCompleted(g.status))
    .sort((a, b) => Date.parse(b.datetime || b.date) - Date.parse(a.datetime || a.date)).slice(0, count);
};
