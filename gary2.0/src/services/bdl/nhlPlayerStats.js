import { getCurrentNhlSeason } from './normalization.js';
import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const nhlPlayerStatsMethods = {

  // NOTE: NHL Player Season Stats is defined later in the file (around line 4109)
  // as the canonical implementation. JS object-literal duplicate keys: the later
  // definition wins, so this one is dead — kept as a no-op stub to avoid
  // breaking any reference until it can be cleanly removed.

  /**
   * NHL Player Stats Leaders
   * GET /nhl/v1/player_stats/leaders?season=<season>&type=<type>
   * Returns league leaders for a specific stat type
   * @param {number} season - Season year
   * @param {string} type - Stat type (points, goals, assists, etc.)
   * @returns {Array} - Array of leader objects
   */
  // Renamed Aug 19 2026: this array-returning variant was silently shadowed
  // by the later map-returning getNhlPlayerStatsLeaders (duplicate object
  // key — same class as the props-name outage). agentLoop's LEADERS branch
  // is its caller and now reaches it under the unambiguous name.
  async getNhlPlayerStatsLeadersByType(season = getCurrentNhlSeason(), type = 'points', ttlMinutes = 60) {
    try {
      const cacheKey = `nhl_player_stats_leaders_${season}_${type}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/player_stats/leaders${buildQuery({ season, type })}`;
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNhlPlayerStatsLeadersByType', e);
      console.error('[Ball Don\'t Lie] nhl getNhlPlayerStatsLeaders error:', e.message);
      return [];
    }
  },

  /**
   * Get NHL player season stats for a specific player.
   * Endpoint: GET /nhl/v1/players/:id/season_stats?season=YYYY[&postseason=true]
   *
   * Per BDL OpenAPI spec (May 2026), this endpoint accepts an optional
   * `postseason` boolean. Pass `true` during playoff games to get the
   * postseason sample instead of the regular-season baseline.
   *
   * Returns: goals, assists, points, shots, time_on_ice_per_game,
   * power_play_points, etc.
   * @param {number} playerId - BDL player ID
   * @param {number} season - Season year (e.g., 2025 for 2025-26 season)
   * @param {boolean} postseason - If true, request postseason stats
   * @returns {Promise<Object>} - Player season stats as key-value object
   */
  async getNhlPlayerSeasonStats(playerId, season, postseason = false) {
    try {
      if (!playerId || !season) {
        console.warn('[Ball Don\'t Lie] NHL player season stats requires playerId and season');
        return null;
      }

      const cacheKey = `nhl_player_season_stats_${playerId}_${season}_${postseason ? 'post' : 'reg'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const postseasonParam = postseason ? '&postseason=true' : '';
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players/${playerId}/season_stats?season=${season}${postseasonParam}`;
        console.log(`[Ball Don't Lie] Fetching NHL player season stats: ${url}`);

        const response = await bdlHttp.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const statsArray = response.data?.data || [];
        
        // Convert array of {name, value} to object for easier access
        const statsObj = { playerId, season };
        for (const stat of statsArray) {
          if (stat.name && stat.value !== undefined) {
            statsObj[stat.name] = stat.value;
          }
        }

        // Calculate per-game averages for key props
        const gp = statsObj.games_played || 1;
        statsObj.shots_per_game = statsObj.shots ? (statsObj.shots / gp).toFixed(2) : null;
        statsObj.goals_per_game = statsObj.goals ? (statsObj.goals / gp).toFixed(2) : null;
        statsObj.assists_per_game = statsObj.assists ? (statsObj.assists / gp).toFixed(2) : null;
        statsObj.points_per_game = statsObj.points ? (statsObj.points / gp).toFixed(2) : null;
        statsObj.pp_points_per_game = statsObj.power_play_points ? (statsObj.power_play_points / gp).toFixed(2) : null;

        console.log(`[Ball Don't Lie] Got season stats for player ${playerId}: ${gp} GP, ${statsObj.shots || 0} shots, ${statsObj.goals || 0} goals`);
        return statsObj;
      }, 30); // Cache for 30 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNhlPlayerSeasonStats', error);
      const status = error?.response?.status;
      if (status === 404) {
        console.log(`[Ball Don't Lie] No NHL season stats found for player ${playerId}`);
        return null;
      }
      console.error(`[Ball Don't Lie] NHL player season stats error:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Get NHL player stats leaders for props context
   * Fetches top players in key stat categories to give Gary ranking context
   * E.g., "Kucherov is #1 in points, top-5 in goals"
   * @param {number} season - Season year
   * @param {Array<number>} playerIds - Optional: filter to specific players to get their rankings
   * @returns {Promise<Object>} - Map of playerId to their rankings in each category
   */
  async getNhlPlayerStatsLeaders(season, playerIds = []) {
    try {
      if (!season) return {};

      const cacheKey = `nhl_player_leaders_${season}_${playerIds.length > 0 ? playerIds.sort().join(',') : 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[Ball Don't Lie] Fetching NHL player stats leaders for ${season} season...`);
        
        // Key stats for prop analysis: goals, assists, points, shots
        const statTypes = ['goals', 'assists', 'points', 'shots'];
        
        // Fetch all leaders in parallel
        const leaderResults = await Promise.all(
          statTypes.map(type => 
            this.getLeadersGeneric('icehockey_nhl', { season, type, postseason: false })
          )
        );

        // Build a map of playerId -> { rank in each stat }
        const playerRankings = {};
        
        statTypes.forEach((type, idx) => {
          const leaders = leaderResults[idx] || [];
          leaders.forEach((entry, rank) => {
            const pid = entry.player?.id;
            if (!pid) return;
            
            // If we have specific playerIds to filter, skip others (for now, store all)
            if (!playerRankings[pid]) {
              playerRankings[pid] = {
                playerId: pid,
                playerName: entry.player?.full_name || `${entry.player?.first_name || ''} ${entry.player?.last_name || ''}`.trim(),
                position: entry.player?.position_code,
                rankings: {}
              };
            }
            
            playerRankings[pid].rankings[type] = {
              rank: rank + 1, // 1-indexed rank
              value: entry.value
            };
          });
        });

        // If specific playerIds requested, filter to just those
        if (playerIds.length > 0) {
          const filtered = {};
          for (const pid of playerIds) {
            if (playerRankings[pid]) {
              filtered[pid] = playerRankings[pid];
            }
          }
          console.log(`[Ball Don't Lie] Got NHL leader rankings for ${Object.keys(filtered).length}/${playerIds.length} requested players`);
          return filtered;
        }

        console.log(`[Ball Don't Lie] Got NHL leader rankings for ${Object.keys(playerRankings).length} players across ${statTypes.length} stat categories`);
        return playerRankings;
      }, 60); // Cache for 60 minutes (rankings don't change frequently)
    } catch (error) {
      recordPickDataFailure('BDL:getNhlPlayerStatsLeaders', error);
      console.error(`[Ball Don't Lie] NHL player stats leaders error:`, error.message);
      return {};
    }
  },


  /**
   * Get NHL player game logs with enhanced stats for prop analysis
   * Includes: individual game stats, consistency metrics, hit rates, home/away splits
   * @param {number} playerId - Player ID
   * @param {number} numGames - Number of recent games (default 10)
   * @param {Object} propLines - Optional prop lines to calculate hit rates { shots: 2.5, points: 0.5 }
   * @returns {Promise<Object>} - Enhanced game log data
   */
  async getNhlPlayerGameLogs(playerId, numGames = 10, propLines = {}) {
    try {
      if (!playerId) return null;

      const cacheKey = `nhl_game_logs_${playerId}_${numGames}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Get dates for last 30 days
        const dates = [];
        for (let i = 1; i <= 30; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          dates.push(d.toISOString().slice(0, 10));
        }

        const boxScores = await this.getNhlRecentBoxScores(dates.slice(0, 14), { player_ids: [playerId] });
        
        if (!boxScores || boxScores.length === 0) return null;

        // Filter to this player and sort by date
        const games = boxScores
          .filter(bs => bs.player?.id === playerId && bs.time_on_ice)
          .sort((a, b) => new Date(b.game?.game_date) - new Date(a.game?.game_date))
          .slice(0, numGames);

        if (games.length === 0) return null;

        // Extract individual game stats
        const gameStats = games.map(g => {
          // Parse TOI
          let toiMins = 0;
          if (g.time_on_ice) {
            const [mins, secs] = g.time_on_ice.split(':').map(Number);
            toiMins = mins + (secs / 60);
          }
          
          return {
            date: g.game?.game_date,
            opponent: g.game?.home_team?.id === g.team?.id 
              ? g.game?.away_team?.abbreviation 
              : g.game?.home_team?.abbreviation,
            isHome: g.game?.home_team?.id === g.team?.id,
            sog: g.shots_on_goal || 0,
            goals: g.goals || 0,
            assists: g.assists || 0,
            points: g.points || 0,
            ppGoals: g.power_play_goals || 0,
            ppAssists: g.power_play_assists || 0,
            toi: toiMins
          };
        });

        // Calculate averages
        const totals = { sog: 0, goals: 0, assists: 0, points: 0, ppGoals: 0, ppAssists: 0, toi: 0 };
        for (const g of gameStats) {
          totals.sog += g.sog;
          totals.goals += g.goals;
          totals.assists += g.assists;
          totals.points += g.points;
          totals.ppGoals += g.ppGoals;
          totals.ppAssists += g.ppAssists;
          totals.toi += g.toi;
        }
        const gp = gameStats.length;
        const avgs = {
          sog: totals.sog / gp,
          goals: totals.goals / gp,
          assists: totals.assists / gp,
          points: totals.points / gp,
          ppPoints: (totals.ppGoals + totals.ppAssists) / gp,
          toi: totals.toi / gp
        };

        // Calculate standard deviations
        const calcStdDev = (values, mean) => {
          const sqDiffs = values.map(v => Math.pow(v - mean, 2));
          return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
        };

        const stdDevs = {
          sog: calcStdDev(gameStats.map(g => g.sog), avgs.sog),
          goals: calcStdDev(gameStats.map(g => g.goals), avgs.goals),
          assists: calcStdDev(gameStats.map(g => g.assists), avgs.assists),
          points: calcStdDev(gameStats.map(g => g.points), avgs.points)
        };

        // Consistency scores
        const consistency = {
          sog: avgs.sog > 0 ? Math.max(0, 1 - (stdDevs.sog / avgs.sog)).toFixed(2) : '0.00',
          goals: avgs.goals > 0 ? Math.max(0, 1 - (stdDevs.goals / avgs.goals)).toFixed(2) : '0.00',
          assists: avgs.assists > 0 ? Math.max(0, 1 - (stdDevs.assists / avgs.assists)).toFixed(2) : '0.00',
          points: avgs.points > 0 ? Math.max(0, 1 - (stdDevs.points / avgs.points)).toFixed(2) : '0.00'
        };

        // Home/away splits
        const homeGames = gameStats.filter(g => g.isHome);
        const awayGames = gameStats.filter(g => !g.isHome);
        const splits = {
          home: homeGames.length > 0 ? {
            games: homeGames.length,
            sog: (homeGames.reduce((s, g) => s + g.sog, 0) / homeGames.length).toFixed(1),
            points: (homeGames.reduce((s, g) => s + g.points, 0) / homeGames.length).toFixed(2)
          } : null,
          away: awayGames.length > 0 ? {
            games: awayGames.length,
            sog: (awayGames.reduce((s, g) => s + g.sog, 0) / awayGames.length).toFixed(1),
            points: (awayGames.reduce((s, g) => s + g.points, 0) / awayGames.length).toFixed(2)
          } : null
        };

        // Calculate hit rates for prop lines
        const hitRates = {};
        if (propLines.shots !== undefined) {
          const hits = gameStats.filter(g => g.sog > propLines.shots).length;
          hitRates.shots = { line: propLines.shots, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.goals !== undefined) {
          const hits = gameStats.filter(g => g.goals > propLines.goals).length;
          hitRates.goals = { line: propLines.goals, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.assists !== undefined) {
          const hits = gameStats.filter(g => g.assists > propLines.assists).length;
          hitRates.assists = { line: propLines.assists, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.points !== undefined) {
          const hits = gameStats.filter(g => g.points > propLines.points).length;
          hitRates.points = { line: propLines.points, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }

        console.log(`[Ball Don't Lie] Got ${gp} NHL game logs for player ${playerId}`);

        return {
          playerId,
          gamesAnalyzed: gp,
          games: gameStats,
          averages: {
            sog: avgs.sog.toFixed(1),
            goals: avgs.goals.toFixed(2),
            assists: avgs.assists.toFixed(2),
            points: avgs.points.toFixed(2),
            ppPoints: avgs.ppPoints.toFixed(2),
            toi: avgs.toi.toFixed(1)
          },
          stdDevs: {
            sog: stdDevs.sog.toFixed(2),
            goals: stdDevs.goals.toFixed(2),
            assists: stdDevs.assists.toFixed(2),
            points: stdDevs.points.toFixed(2)
          },
          consistency,
          splits,
          hitRates,
          lastGame: gameStats[0] || null
        };
      }, 15); // Cache for 15 minutes
    } catch (e) {
      recordPickDataFailure('BDL:getNhlPlayerGameLogs', e);
      console.error('[Ball Don\'t Lie] getNhlPlayerGameLogs error:', e.message);
      return null;
    }
  },

  /**
   * Batch fetch NHL player season stats for multiple players.
   * Loops over the existing getNhlPlayerSeasonStats singular function.
   */
  async getNhlPlayersSeasonStatsBatch(playerIds, season) {
    if (!playerIds || playerIds.length === 0) return {};
    const results = {};
    for (const pid of playerIds) {
      try {
        const stats = await this.getNhlPlayerSeasonStats(pid, season);
        if (stats && (Array.isArray(stats) ? stats.length > 0 : true)) {
          results[pid] = stats;
        }
      } catch (e) {
        // Skip failed individual fetches
      }
    }
    return results;
  },

  /**
   * Batch fetch NHL player game logs for multiple players.
   * Loops over the existing getNhlPlayerGameLogs singular function.
   */
  async getNhlPlayerGameLogsBatch(playerIds, numGames = 10) {
    if (!playerIds || playerIds.length === 0) return {};
    const results = {};
    for (const pid of playerIds) {
      try {
        const logs = await this.getNhlPlayerGameLogs(pid, numGames);
        if (logs) {
          results[pid] = logs;
        }
      } catch (e) {
        // Skip failed individual fetches
      }
    }
    return results;
  },
};
