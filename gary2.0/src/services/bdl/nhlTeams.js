import { getCurrentNhlSeason } from './normalization.js';
import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const nhlTeamsMethods = {

  /**
   * NHL Team Players (Roster)
   * GET /nhl/v1/players?team_ids[]=<ID>&seasons[]=<season>
   * Returns players for a specific team in a specific season
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Array} - Player objects with position, name, etc.
   */
  async getNhlTeamPlayers(teamId, season = getCurrentNhlSeason(), ttlMinutes = 30) {
    try {
      if (!teamId) return [];
      const cacheKey = `nhl_team_players_${teamId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        let allPlayers = [];
        let cursor = null;

        do {
          const params = {
            team_ids: [teamId],
            seasons: [season],
            per_page: 100
          };
          if (cursor) {
            params.cursor = cursor;
          }

          const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players${buildQuery(params)}`;
          const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });

          const players = response.data?.data || [];
          allPlayers = allPlayers.concat(players);

          // Check for pagination - according to docs, meta.next_cursor indicates more results
          cursor = response.data?.meta?.next_cursor || null;
        } while (cursor);

        // Filter to only players currently on this team for this season
        // Each player has a "teams" array showing their team history
        const currentPlayers = allPlayers.filter(player => {
          return player.teams && player.teams.some(teamEntry =>
            teamEntry.id === teamId && teamEntry.season === season
          );
        });

        console.log(`[Ball Don't Lie] NHL team ${teamId} season ${season}: ${currentPlayers.length} active players`);
        return currentPlayers;
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNhlTeamPlayers', e);
      console.error('[Ball Don\'t Lie] nhl getNhlTeamPlayers error:', e.message);
      return [];
    }
  },

  /**
   * Get NHL roster depth for two teams - top skaters + goalies with season stats
   * Used for scout report to show Gary the full rotation
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2025 for 2025-26 season)
   * @returns {Promise<Object>} - { home: { skaters: [...], goalies: [...] }, away: { skaters: [...], goalies: [...] } }
   */
  async getNhlRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏒 [Ball Don't Lie] Fetching NHL roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);
      
      // Get team IDs first (NHL teams)
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByNameGeneric('icehockey_nhl', homeTeamName),
        this.getTeamByNameGeneric('icehockey_nhl', awayTeamName)
      ]);
      
      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find NHL team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: { skaters: [], goalies: [] }, away: { skaters: [], goalies: [] } };
      }
      
      console.log(`🏒 [Ball Don't Lie] Team IDs: ${homeTeam.full_name} (${homeTeam.id}) vs ${awayTeam.full_name} (${awayTeam.id})`);
      
      const cacheKey = `nhl_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch players for both teams
        console.log(`🏒 [Ball Don't Lie] Fetching players for both teams...`);
        const [homePlayers, awayPlayers] = await Promise.all([
          this.getNhlTeamPlayers(homeTeam.id, season),
          this.getNhlTeamPlayers(awayTeam.id, season)
        ]);
        
        console.log(`🏒 [Ball Don't Lie] ${homeTeam.full_name}: ${homePlayers.length} players, ${awayTeam.full_name}: ${awayPlayers.length} players`);
        
        // Separate goalies from skaters
        const homeGoalies = homePlayers.filter(p => p.position_code === 'G');
        const homeSkaters = homePlayers.filter(p => p.position_code !== 'G');
        const awayGoalies = awayPlayers.filter(p => p.position_code === 'G');
        const awaySkaters = awayPlayers.filter(p => p.position_code !== 'G');
        
        // Get all player IDs for season stats fetch
        const allPlayerIds = [...homePlayers, ...awayPlayers].map(p => p.id);
        
        if (allPlayerIds.length === 0) {
          return { home: { skaters: [], goalies: [] }, away: { skaters: [], goalies: [] } };
        }
        
        // Fetch season stats for all players (in batches to avoid rate limits)
        console.log(`🏒 [Ball Don't Lie] Fetching season stats for ${allPlayerIds.length} players...`);
        const statsMap = {};
        const batchSize = 10;
        
        for (let i = 0; i < allPlayerIds.length; i += batchSize) {
          const batch = allPlayerIds.slice(i, i + batchSize);
          const batchResults = await Promise.all(
            batch.map(async (playerId) => {
              try {
                const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players/${playerId}/season_stats?season=${season}`;
                const resp = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
                const statsArray = resp.data?.data || [];
                // Convert array to object
                const stats = {};
                for (const stat of statsArray) {
                  if (stat.name && stat.value !== undefined) {
                    stats[stat.name] = stat.value;
                  }
                }
                return { playerId, stats };
              } catch (e) {
                return { playerId, stats: {} };
              }
            })
          );
          
          for (const result of batchResults) {
            statsMap[result.playerId] = result.stats;
          }
          
          // Small delay between batches
          if (i + batchSize < allPlayerIds.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
        
        console.log(`🏒 [Ball Don't Lie] Got season stats for ${Object.keys(statsMap).length} players`);
        
        // Format skater with stats
        const formatSkater = (player) => {
          const stats = statsMap[player.id] || {};
          const gp = stats.games_played || 1;
          return {
            id: player.id,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            position: player.position_code || '?',
            gp: stats.games_played || 0,
            goals: stats.goals || 0,
            assists: stats.assists || 0,
            points: stats.points || 0,
            plusMinus: stats.plus_minus || 0,
            toi: stats.time_on_ice_per_game || 0,
            shots: stats.shots || 0,
            ppPoints: stats.power_play_points || 0,
            // Per-game averages
            goalsPerGame: gp > 0 ? (stats.goals || 0) / gp : 0,
            pointsPerGame: gp > 0 ? (stats.points || 0) / gp : 0
          };
        };
        
        // Format goalie with stats
        const formatGoalie = (player) => {
          const stats = statsMap[player.id] || {};
          return {
            id: player.id,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            position: 'G',
            gp: stats.games_played || 0,
            gamesStarted: stats.games_started || 0,
            wins: stats.wins || 0,
            losses: stats.losses || 0,
            otLosses: stats.ot_losses || 0,
            gaa: stats.goals_against_average || 0,
            svPct: stats.save_pct || 0,
            shutouts: stats.shutouts || 0,
            saves: stats.saves || 0,
            goalsAgainst: stats.goals_against || 0
          };
        };
        
        // Sort skaters by time on ice (top 9) and format goalies
        const homeSkatersSorted = homeSkaters
          .map(formatSkater)
          .sort((a, b) => b.toi - a.toi)
          .slice(0, 9);
          
        const awaySkatersSorted = awaySkaters
          .map(formatSkater)
          .sort((a, b) => b.toi - a.toi)
          .slice(0, 9);
        
        const homeGoaliesFormatted = homeGoalies.map(formatGoalie).sort((a, b) => b.gamesStarted - a.gamesStarted);
        const awayGoaliesFormatted = awayGoalies.map(formatGoalie).sort((a, b) => b.gamesStarted - a.gamesStarted);
        
        console.log(`🏒 [Ball Don't Lie] Roster depth ready: ${homeTeam.full_name} (${homeSkatersSorted.length} skaters, ${homeGoaliesFormatted.length} goalies), ${awayTeam.full_name} (${awaySkatersSorted.length} skaters, ${awayGoaliesFormatted.length} goalies)`);
        
        return {
          home: {
            skaters: homeSkatersSorted,
            goalies: homeGoaliesFormatted,
            teamName: homeTeam.full_name
          },
          away: {
            skaters: awaySkatersSorted,
            goalies: awayGoaliesFormatted,
            teamName: awayTeam.full_name
          }
        };
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNhlRosterDepth', e);
      console.error('[Ball Don\'t Lie] getNhlRosterDepth error:', e.message);
      return { home: { skaters: [], goalies: [] }, away: { skaters: [], goalies: [] } };
    }
  },

  deriveNhlTeamRates(teamSeasonStats) {
    // teamSeasonStats can be either:
    //   - flat object from getTeamSeasonStats: {goals_for_per_game: 3.1, ...}
    //   - legacy array of {name, value} pairs (no longer returned, but handle gracefully)
    if (!teamSeasonStats) return {};
    let map;
    if (Array.isArray(teamSeasonStats)) {
      map = {};
      teamSeasonStats.forEach(r => {
        if (r && r.name) map[r.name] = r.value;
      });
    } else if (typeof teamSeasonStats === 'object') {
      map = teamSeasonStats;
    } else {
      return {};
    }
    return {
      ppPct: map.power_play_percentage,
      pkPct: map.penalty_kill_percentage,
      shotsForPerGame: map.shots_for_per_game,
      shotsAgainstPerGame: map.shots_against_per_game,
      faceoffWinPct: map.faceoff_win_percentage,
      goalsForPerGame: map.goals_for_per_game,
      goalsAgainstPerGame: map.goals_against_per_game
    };
  },

  /**
   * Get NHL team standings for current season
   * Uses BDL's /nhl/v1/standings endpoint
   * @param {number} season - Season year (defaults to current NHL season)
   * @returns {Promise<Array>} - Array of team standings with points, record, streaks
   */
  async getNhlStandings(season = getCurrentNhlSeason()) {
    try {
      const cacheKey = `nhl_standings_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏒 Fetching NHL standings for ${season} season`);
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/standings${buildQuery({ season })}`;
        const response = await bdlHttp.get(url, { headers: { Authorization: API_KEY } });
        
        return response.data?.data || [];
      }, 60); // Cache for 60 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNhlStandings', error);
      console.error('Error fetching NHL standings:', error.message);
      return [];
    }
  },

  // ==================== NHL PLAYER PROPS (BDL API) ====================

  /**
   * Get NHL player props from Ball Don't Lie API
   * Supports: goals, assists, points, shots_on_goal, saves, power_play_points, anytime_goal, etc.
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors)
   * @returns {Promise<Array>} - Array of player prop objects
   */
  async getNhlPlayerProps(gameId, options = {}) {
    try {
      if (!gameId) {
        console.warn('[Ball Don\'t Lie] NHL player props requires game_id');
        return [];
      }

      const cacheKey = `nhl_player_props_${gameId}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { game_id: gameId };
        if (options.player_id) params.player_id = options.player_id;
        if (options.prop_type) params.prop_type = options.prop_type;
        if (options.vendors) params.vendors = options.vendors;

        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/odds/player_props${buildQuery(params)}`;
        console.log(`[Ball Don't Lie] Fetching NHL player props: ${url}`);
        
        const response = await bdlHttp.get(url, { 
          headers: { 'Authorization': API_KEY } 
        });
        
        const props = response.data?.data || [];
        console.log(`[Ball Don't Lie] Retrieved ${props.length} NHL player props for game ${gameId}`);
        return props.map(row => ({ ...row, _gary_observed_at: new Date().toISOString() }));
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
      recordPickDataFailure('BDL:getNhlPlayerProps', error);
      const status = error?.response?.status;
      const msg = error?.response?.data?.error || error.message;
      console.error(`[Ball Don't Lie] NHL player props error: ${status} - ${msg}`);
      return [];
    }
  },

  /**
   * Get NHL games for a specific date to find game IDs
   * @param {string} dateStr - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of NHL game objects with IDs
   */
  async getNhlGamesForDate(dateStr) {
    try {
      const cacheKey = `nhl_games_${dateStr}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/games${buildQuery({ dates: [dateStr], per_page: 50 })}`;
        console.log(`[Ball Don't Lie] Fetching NHL games for ${dateStr}`);
        
        const response = await bdlHttp.get(url, { 
          headers: { 'Authorization': API_KEY } 
        });
        
        const games = response.data?.data || [];
        console.log(`[Ball Don't Lie] Found ${games.length} NHL games for ${dateStr}`);
        return games;
      }, 5); // Cache for 5 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNhlGamesForDate', error);
      console.error(`[Ball Don't Lie] NHL games error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Get NHL players by IDs to resolve player names
   * @param {Array<number>} playerIds - Array of player IDs
   * @returns {Promise<Object>} - Map of player_id to player info
   */
  async getNhlPlayersByIds(playerIds) {
    try {
      if (!playerIds || playerIds.length === 0) return {};
      
      // Dedupe and limit
      const uniqueIds = [...new Set(playerIds)].slice(0, 100);
      const cacheKey = `nhl_players_${uniqueIds.sort().join(',')}`;
      
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players${buildQuery({ player_ids: uniqueIds, per_page: 100 })}`;
        console.log(`[Ball Don't Lie] Fetching ${uniqueIds.length} NHL players`);
        
        const response = await bdlHttp.get(url, { 
          headers: { 'Authorization': API_KEY } 
        });
        
        const players = response.data?.data || [];
        
        // Build lookup map
        const playerMap = {};
        for (const player of players) {
          playerMap[player.id] = {
            id: player.id,
            name: player.full_name || `${player.first_name} ${player.last_name}`,
            position: player.position_code,
            team: player.teams?.[0]?.full_name || 'Unknown'
          };
        }
        
        console.log(`[Ball Don't Lie] Resolved ${Object.keys(playerMap).length} NHL player names`);
        return playerMap;
      }, 60); // Cache for 60 minutes (player names don't change)
    } catch (error) {
      recordPickDataFailure('BDL:getNhlPlayersByIds', error);
      console.error(`[Ball Don't Lie] NHL players error:`, error?.response?.data || error.message);
      return {};
    }
  },


  /**
   * Get NHL team goalies with their season stats
   * Fetches all goalies (position_code = "G") for given teams and their stats
   * @param {Array<number>} teamIds - Array of team IDs
   * @param {number} season - Season year (e.g., 2024)
   * @returns {Promise<Object>} - Object with home and away goalie data
   */
  async getNhlTeamGoalies(teamIds, season) {
    try {
      if (!teamIds || teamIds.length === 0) return { home: null, away: null };

      const cacheKey = `nhl_team_goalies_${teamIds.join(',')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[Ball Don't Lie] Fetching NHL goalies for teams: ${teamIds.join(', ')}`);

        const goaliesByTeam = {};

        // Fetch players for each team
        for (const teamId of teamIds) {
          const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players?team_ids[]=${teamId}&seasons[]=${season}&per_page=100`;
          const response = await bdlHttp.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const allPlayers = response.data?.data || [];
          // Filter to goalies only (position_code = "G")
          const goalies = allPlayers.filter(p => p.position_code === 'G');

          if (goalies.length > 0) {
            goaliesByTeam[teamId] = goalies;
            console.log(`[Ball Don't Lie] Found ${goalies.length} goalie(s) for team ${teamId}: ${goalies.map(g => g.full_name).join(', ')}`);
          }
        }

        // Fetch season stats for all goalies
        const allGoalieIds = Object.values(goaliesByTeam).flat().map(g => g.id);
        const goalieStats = {};

        if (allGoalieIds.length > 0) {
          console.log(`[Ball Don't Lie] Fetching season stats for ${allGoalieIds.length} goalie(s)...`);

          for (const goalieId of allGoalieIds) {
            try {
              const statsUrl = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players/${goalieId}/season_stats?season=${season}`;
              const statsResp = await bdlHttp.get(statsUrl, {
                headers: { 'Authorization': API_KEY }
              });

              const statsArray = statsResp.data?.data || [];
              const stats = {};
              for (const stat of statsArray) {
                if (stat.name && stat.value !== undefined) {
                  stats[stat.name] = stat.value;
                }
              }
              goalieStats[goalieId] = stats;
            } catch (e) {
              console.warn(`[Ball Don't Lie] Could not fetch stats for goalie ${goalieId}:`, e.message);
            }
          }
        }

        // Build result with enriched goalie data
        const result = {};
        for (const [teamId, goalies] of Object.entries(goaliesByTeam)) {
          result[teamId] = goalies.map(g => {
            const stats = goalieStats[g.id] || {};
            const gamesStarted = stats.games_started || 0;
            const gamesPlayed = stats.games_played || 0;

            return {
              id: g.id,
              name: g.full_name,
              position: g.position_code,
              teamId: parseInt(teamId),
              // Season stats
              games_played: gamesPlayed,
              games_started: gamesStarted,
              wins: stats.wins || 0,
              losses: stats.losses || 0,
              ot_losses: stats.ot_losses || 0,
              save_pct: stats.save_pct ? (stats.save_pct).toFixed(3) : null,
              goals_against_average: stats.goals_against_average ? (stats.goals_against_average).toFixed(2) : null,
              shutouts: stats.shutouts || 0,
              saves: stats.saves || 0,
              shots_against: stats.shots_against || 0
            };
          }).sort((a, b) => b.games_started - a.games_started); // Sort by games started
        }

        console.log(`[Ball Don't Lie] Goalie data compiled for ${Object.keys(result).length} team(s)`);
        return result;
      }, 30); // Cache for 30 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNhlTeamGoalies', error);
      console.error(`[Ball Don't Lie] NHL team goalies error:`, error?.response?.data || error.message);
      return {};
    }
  },

  /**
   * Get NHL box scores for recent games (for trend analysis)
   * Endpoint: GET /nhl/v1/box_scores?dates[]=YYYY-MM-DD
   * @param {Array<string>} dates - Array of dates in YYYY-MM-DD format
   * @param {Object} options - Optional filters (team_ids, player_ids)
   * @returns {Promise<Array>} - Array of box score entries
   */
  async getNhlRecentBoxScores(dates, options = {}) {
    try {
      if (!dates || dates.length === 0) return [];

      const cacheKey = `nhl_box_scores_${dates.join(',')}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        let allBoxScores = [];
        
        // Fetch box scores for each date (with pagination support)
        for (const date of dates.slice(0, 7)) { // Limit to 7 days
          let cursor = null;
          let pageCount = 0;
          const maxPages = 5;

          do {
            const params = { dates: [date], per_page: 100 };
            if (options.team_ids) params.team_ids = options.team_ids;
            if (options.player_ids) params.player_ids = options.player_ids;
            if (cursor) params.cursor = cursor;

            const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/box_scores${buildQuery(params)}`;
            const response = await bdlHttp.get(url, {
              headers: { 'Authorization': API_KEY }
            });

            const data = response.data?.data || [];
            allBoxScores = allBoxScores.concat(data);
            
            cursor = response.data?.meta?.next_cursor;
            pageCount++;

            // Rate limit protection
            if (cursor) await new Promise(resolve => setTimeout(resolve, 50));
          } while (cursor && pageCount < maxPages);
        }

        console.log(`[Ball Don't Lie] Retrieved ${allBoxScores.length} NHL box score entries for ${dates.length} days`);
        return allBoxScores;
      }, 15); // Cache for 15 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNhlRecentBoxScores', error);
      console.error(`[Ball Don't Lie] NHL box scores error:`, error?.response?.data || error.message);
      return [];
    }
  },
};
