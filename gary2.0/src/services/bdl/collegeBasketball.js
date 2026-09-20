import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, bdlHttp, API_KEY, buildQuery } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const collegeBasketballMethods = {

  /**
   * Get NCAAB standings for specific conferences
   * @param {number} conferenceId - Conference ID from BDL
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Array>} - Array of standings for teams in that conference
   */
  async getNcaabStandings(conferenceId, season, ttlMinutes = 60) {
    try {
      if (!conferenceId || !season) return [];
      const cacheKey = `ncaab_standings_${conferenceId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/standings?conference_id=${conferenceId}&season=${season}`;
        console.log(`🏀 [Ball Don't Lie] Fetching NCAAB standings for conference ${conferenceId}, season ${season}`);
        const resp = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        return resp.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNcaabStandings', e);
      console.error('[Ball Don\'t Lie] getNcaabStandings error:', e.message);
      return [];
    }
  },

  /**
   * NCAAB player season stats (single season; filterable by player or team)
   */
  async getNcaabPlayerSeasonStats({ playerIds, playerId, teamIds, teamId, season } = {}, ttlMinutes = 10) {
    try {
      if (!season) return [];
      const pidArr = playerIds || (playerId ? [playerId] : undefined);
      const tidArr = teamIds || (teamId ? [teamId] : undefined);
      const cacheKey = `ncaab_player_season_stats_${(pidArr || []).join('-')}_${(tidArr || []).join('-')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const query = { season, per_page: 100 };
        if (Array.isArray(pidArr) && pidArr.length) query['player_ids[]'] = pidArr.slice(0, 100);
        if (Array.isArray(tidArr) && tidArr.length) query['team_ids[]'] = tidArr.slice(0, 100);
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/player_season_stats${buildQuery(query)}`;
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNcaabPlayerSeasonStats', e);
      console.error('[Ball Don\'t Lie] ncaab getNcaabPlayerSeasonStats error:', e.message);
      return [];
    }
  },

  /**
   * NCAAB player game logs - returns actual per-game box scores
   * Uses /ncaab/v1/player_stats with player_ids[] and date filtering
   * @param {number} playerId - BDL player ID
   * @param {number} numGames - Number of recent games to fetch
   * @returns {Promise<Object|null>} - Per-game stats with averages, consistency, splits, trends
   */
  async getNcaabPlayerGameLogs(playerId, numGames = 10) {
    try {
      if (!playerId) return null;

      const cacheKey = `ncaab_game_logs_${playerId}_${numGames}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch last 45 days of per-game stats to capture enough games (NCAAB ~2-3 games/week)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 45);

        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/player_stats${buildQuery({
          player_ids: [playerId],
          start_date: startDate.toISOString().slice(0, 10),
          end_date: endDate.toISOString().slice(0, 10),
          per_page: 50
        })}`;

        const response = await bdlHttp.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const allStats = response.data?.data || [];
        if (allStats.length === 0) {
          console.log(`[Ball Don't Lie] No NCAAB per-game stats found for player ${playerId}`);
          return null;
        }

        // Filter for games where player actually played and sort by date (most recent first)
        const games = allStats
          .filter(g => g.min && parseInt(g.min) > 0)
          .sort((a, b) => new Date(b.game?.date) - new Date(a.game?.date))
          .slice(0, numGames);

        if (games.length === 0) return null;

        // Extract individual game stats
        const gameStats = games.map(g => ({
          date: g.game?.date,
          opponent: g.game?.home_team?.id === g.team?.id
            ? (g.game?.visitor_team?.name || g.game?.visitor_team?.full_name || 'OPP')
            : (g.game?.home_team?.name || g.game?.home_team?.full_name || 'OPP'),
          isHome: g.game?.home_team?.id === g.team?.id,
          pts: g.pts || 0,
          reb: g.reb || ((g.oreb || 0) + (g.dreb || 0)),
          ast: g.ast || 0,
          stl: g.stl || 0,
          blk: g.blk || 0,
          fg3m: g.fg3m || 0,
          fgm: g.fgm || 0,
          fga: g.fga || 0,
          min: parseInt(g.min) || 0,
          pra: (g.pts || 0) + (g.reb || ((g.oreb || 0) + (g.dreb || 0))) + (g.ast || 0),
          turnover: g.turnover || 0
        }));

        // Calculate averages
        const gp = gameStats.length;
        const totals = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fg3m: 0, min: 0, pra: 0 };
        for (const g of gameStats) {
          totals.pts += g.pts;
          totals.reb += g.reb;
          totals.ast += g.ast;
          totals.stl += g.stl;
          totals.blk += g.blk;
          totals.fg3m += g.fg3m;
          totals.min += g.min;
          totals.pra += g.pra;
        }
        const avgs = {
          pts: totals.pts / gp,
          reb: totals.reb / gp,
          ast: totals.ast / gp,
          stl: totals.stl / gp,
          blk: totals.blk / gp,
          fg3m: totals.fg3m / gp,
          min: totals.min / gp,
          pra: totals.pra / gp
        };

        // Standard deviations for consistency
        const calcStdDev = (values, mean) => {
          const sqDiffs = values.map(v => Math.pow(v - mean, 2));
          return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
        };
        const stdDevs = {
          pts: calcStdDev(gameStats.map(g => g.pts), avgs.pts),
          reb: calcStdDev(gameStats.map(g => g.reb), avgs.reb),
          ast: calcStdDev(gameStats.map(g => g.ast), avgs.ast),
          fg3m: calcStdDev(gameStats.map(g => g.fg3m), avgs.fg3m),
          pra: calcStdDev(gameStats.map(g => g.pra), avgs.pra)
        };

        // Consistency scores (1 - CV)
        const consistency = {
          pts: avgs.pts > 0 ? Math.max(0, 1 - (stdDevs.pts / avgs.pts)).toFixed(2) : '0.00',
          reb: avgs.reb > 0 ? Math.max(0, 1 - (stdDevs.reb / avgs.reb)).toFixed(2) : '0.00',
          ast: avgs.ast > 0 ? Math.max(0, 1 - (stdDevs.ast / avgs.ast)).toFixed(2) : '0.00',
          fg3m: avgs.fg3m > 0 ? Math.max(0, 1 - (stdDevs.fg3m / avgs.fg3m)).toFixed(2) : '0.00',
          pra: avgs.pra > 0 ? Math.max(0, 1 - (stdDevs.pra / avgs.pra)).toFixed(2) : '0.00'
        };

        // Home/away splits
        const homeGames = gameStats.filter(g => g.isHome);
        const awayGames = gameStats.filter(g => !g.isHome);
        const splits = {
          home: homeGames.length > 0 ? {
            games: homeGames.length,
            pts: (homeGames.reduce((s, g) => s + g.pts, 0) / homeGames.length).toFixed(1),
            reb: (homeGames.reduce((s, g) => s + g.reb, 0) / homeGames.length).toFixed(1),
            ast: (homeGames.reduce((s, g) => s + g.ast, 0) / homeGames.length).toFixed(1)
          } : null,
          away: awayGames.length > 0 ? {
            games: awayGames.length,
            pts: (awayGames.reduce((s, g) => s + g.pts, 0) / awayGames.length).toFixed(1),
            reb: (awayGames.reduce((s, g) => s + g.reb, 0) / awayGames.length).toFixed(1),
            ast: (awayGames.reduce((s, g) => s + g.ast, 0) / awayGames.length).toFixed(1)
          } : null
        };

        console.log(`[Ball Don't Lie] Got ${gp} NCAAB game logs for player ${playerId}: ${avgs.pts.toFixed(1)} PPG`);

        return {
          playerId,
          gamesAnalyzed: gp,
          games: gameStats,
          averages: {
            pts: avgs.pts.toFixed(1),
            reb: avgs.reb.toFixed(1),
            ast: avgs.ast.toFixed(1),
            stl: avgs.stl.toFixed(1),
            blk: avgs.blk.toFixed(1),
            fg3m: avgs.fg3m.toFixed(1),
            min: avgs.min.toFixed(1),
            pra: avgs.pra.toFixed(1)
          },
          stdDevs: {
            pts: stdDevs.pts.toFixed(1),
            reb: stdDevs.reb.toFixed(1),
            ast: stdDevs.ast.toFixed(1),
            fg3m: stdDevs.fg3m.toFixed(1),
            pra: stdDevs.pra.toFixed(1)
          },
          consistency,
          splits,
          lastGame: gameStats[0] || null
        };
      }, 15); // Cache for 15 minutes
    } catch (e) {
      recordPickDataFailure('BDL:getNcaabPlayerGameLogs', e);
      console.error('[Ball Don\'t Lie] getNcaabPlayerGameLogs error:', e.message);
      return null;
    }
  },

  /**
   * Fetch NCAAB bracket data from BDL.
   */
  async getNcaabBracket(season, ttlMinutes = 60) {
    const cacheKey = `ncaab_bracket_${season}`;
    return await getCachedOrFetch(cacheKey, async () => {
      console.log(`🏀 [Ball Don't Lie] Fetching NCAAB bracket for season ${season}`);
      let allEntries = [];
      let cursor = null;
      for (let page = 0; page < 5; page++) {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/bracket?season=${season}&per_page=100${cursor ? '&cursor=' + cursor : ''}`;
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const data = response.data?.data || [];
        allEntries.push(...data);
        cursor = response.data?.meta?.next_cursor;
        if (!cursor) break;
      }
      console.log(`🏀 [Ball Don't Lie] NCAAB bracket: ${allEntries.length} total entries`);
      return allEntries;
    }, ttlMinutes);
  },
};
