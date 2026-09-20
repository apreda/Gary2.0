import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY, cacheMap } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';
import { fetchBdlPages } from '../bdlPagination.js';
import { summarizeNflPlayerGameLogs } from './nflLogSummary.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const nflPlayersMethods = {

  /**
   * NFL player per-game stats for specific game_ids
   */
  async getNflPlayerGameStats({ playerId, gameIds } = {}, ttlMinutes = 5) {
    try {
      if (!playerId || !Array.isArray(gameIds) || gameIds.length === 0) return [];
      const key = `nfl_player_game_stats_${playerId}_${gameIds.slice(0, 10).join(',')}`;
      return await getCachedOrFetch(key, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/stats${buildQuery({ player_ids: [playerId], game_ids: gameIds.slice(0, 50), per_page: 100 })}`;
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNflPlayerGameStats', e);
      console.error('[Ball Don\'t Lie] nfl getNflPlayerGameStats error:', e.message);
      return [];
    }
  },

  /**
   * Get NFL player stats for specific game IDs (for playoff box scores)
   * Returns key performers: QB, leading rusher, top receivers
   * @param {Array<number>} gameIds - Array of game IDs
   * @returns {Promise<Object>} - Map of gameId -> { teamId -> { qb, rb, receivers } }
   */
  async getNflPlayerStatsByGameIds(gameIds, ttlMinutes = 30) {
    try {
      if (!gameIds || gameIds.length === 0) return {};
      
      const cacheKey = `nfl_player_stats_games_${gameIds.sort().join(',')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 [Ball Don't Lie] Fetching NFL player stats for ${gameIds.length} games`);
        
        // Build query with game_ids array
        const params = new URLSearchParams();
        gameIds.forEach(id => params.append('game_ids[]', id));
        params.append('per_page', '100');
        
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/stats?${params.toString()}`;
        const resp = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const stats = resp.data?.data || [];
        
        // Group by game_id -> team_id -> key players
        const statsByGame = {};
        
        for (const stat of stats) {
          const gameId = stat.game?.id;
          const teamId = stat.team?.id;
          const teamName = stat.team?.full_name;
          if (!gameId || !teamId) continue;
          
          if (!statsByGame[gameId]) statsByGame[gameId] = {};
          if (!statsByGame[gameId][teamId]) {
            statsByGame[gameId][teamId] = {
              teamName,
              qb: null,
              rushers: [],
              receivers: [],
              defenders: [],
              // Aggregate defensive stats for the team
              teamDefense: {
                sacks: 0,
                interceptions: 0,
                fumbleRecoveries: 0,
                passesDefended: 0,
                tacklesForLoss: 0
              }
            };
          }
          
          const teamStats = statsByGame[gameId][teamId];
          const playerName = `${stat.player?.first_name || ''} ${stat.player?.last_name || ''}`.trim();
          
          // QB: has passing attempts
          if (stat.passing_attempts > 0) {
            teamStats.qb = {
              name: playerName,
              completions: stat.passing_completions || 0,
              attempts: stat.passing_attempts || 0,
              yards: stat.passing_yards || 0,
              tds: stat.passing_touchdowns || 0,
              ints: stat.passing_interceptions || 0,
              rushYards: stat.rushing_yards || 0,
              rushAttempts: stat.rushing_attempts || 0,
              fumbles: stat.fumbles_lost || 0
            };
          }
          
          // Rushers: has rushing attempts (non-QB or significant volume)
          if (stat.rushing_attempts > 3 && (!teamStats.qb || playerName !== teamStats.qb.name)) {
            teamStats.rushers.push({
              name: playerName,
              attempts: stat.rushing_attempts || 0,
              yards: stat.rushing_yards || 0,
              tds: stat.rushing_touchdowns || 0,
              fumbles: stat.fumbles_lost || 0
            });
          }
          
          // Receivers: has receptions
          if (stat.receptions > 0) {
            teamStats.receivers.push({
              name: playerName,
              receptions: stat.receptions || 0,
              yards: stat.receiving_yards || 0,
              tds: stat.receiving_touchdowns || 0
            });
          }
          
          // Defensive playmakers: has interceptions, sacks, or significant tackles
          const hasDefensiveStats = (stat.defensive_interceptions > 0) || 
                                   (stat.defensive_sacks > 0) || 
                                   (stat.fumbles_recovered > 0) ||
                                   (stat.total_tackles >= 8);
          
          if (hasDefensiveStats) {
            teamStats.defenders.push({
              name: playerName,
              position: stat.player?.position_abbreviation || stat.player?.position || '?',
              tackles: stat.total_tackles || 0,
              soloTackles: stat.solo_tackles || 0,
              sacks: stat.defensive_sacks || 0,
              interceptions: stat.defensive_interceptions || 0,
              intYards: stat.interception_yards || 0,
              intTds: stat.interception_touchdowns || 0,
              passesDefended: stat.passes_defended || 0,
              tacklesForLoss: stat.tackles_for_loss || 0,
              fumblesRecovered: stat.fumbles_recovered || 0,
              qbHits: stat.qb_hits || 0
            });
          }
          
          // Aggregate team defensive stats
          teamStats.teamDefense.sacks += (stat.defensive_sacks || 0);
          teamStats.teamDefense.interceptions += (stat.defensive_interceptions || 0);
          teamStats.teamDefense.fumbleRecoveries += (stat.fumbles_recovered || 0);
          teamStats.teamDefense.passesDefended += (stat.passes_defended || 0);
          teamStats.teamDefense.tacklesForLoss += (stat.tackles_for_loss || 0);
        }
        
        // Sort and trim for each team
        for (const gameId of Object.keys(statsByGame)) {
          for (const teamId of Object.keys(statsByGame[gameId])) {
            const team = statsByGame[gameId][teamId];
            // Sort rushers by yards, keep top 2
            team.rushers = team.rushers.sort((a, b) => b.yards - a.yards).slice(0, 2);
            // Sort receivers by yards, keep top 3
            team.receivers = team.receivers.sort((a, b) => b.yards - a.yards).slice(0, 3);
            // Sort defenders by impact (INTs > sacks > tackles), keep top 3
            team.defenders = team.defenders.sort((a, b) => {
              // Prioritize INTs, then sacks, then tackles
              const aScore = (a.interceptions * 100) + (a.sacks * 50) + (a.fumblesRecovered * 50) + a.tackles;
              const bScore = (b.interceptions * 100) + (b.sacks * 50) + (b.fumblesRecovered * 50) + b.tackles;
              return bScore - aScore;
            }).slice(0, 3);
          }
        }
        
        console.log(`🏈 [Ball Don't Lie] Retrieved player stats for ${Object.keys(statsByGame).length} games`);
        return statsByGame;
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNflPlayerStatsByGameIds', e);
      console.error('[Ball Don\'t Lie] getNflPlayerStatsByGameIds error:', e.message);
      return {};
    }
  },

  /**
   * NFL player season stats (offense focus)
   */
  async getNflPlayerSeasonStats({ playerId, season, postseason = false } = {}, ttlMinutes = 10) {
    try {
      if (!playerId || !season) return [];
      const cacheKey = `nfl_player_season_stats_${playerId}_${season}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/season_stats${buildQuery({ player_ids: [playerId], season, postseason })}`;
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNflPlayerSeasonStats', e);
      console.error('[Ball Don\'t Lie] nfl getNflPlayerSeasonStats error:', e.message);
      return [];
    }
  },

  /**
   * Get NFL player game logs (last N games) for prop analysis
   * Similar to NBA's getNbaPlayerGameLogsBatch - includes consistency, trends, splits
   * @param {Array<number>} playerIds - Array of BDL player IDs
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {number} numGames - Number of recent games to fetch (default 5)
   * @returns {Object} - Map of playerId -> game log data with stats and trends
   */
  async getNflPlayerGameLogsBatch(playerIds, season = null, numGames = 5, ttlMinutes = 15, options = {}) {
    const asOf = options.asOf ?? new Date();
    if (!season) {
      const date = new Date(asOf);
      season = date.getUTCMonth() < 7 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
    }
    try {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return {};
      const uniqueIds = [...new Set(playerIds.filter(id => id != null).map(String))];
      const seasonType = [1, 2, 3].includes(Number(options.seasonType)) ? Number(options.seasonType) : 2;
      const rawByPlayer = {};
      const missing = [];
      const playerKey = id => `nfl_player_game_rows_v2_${id}_${season}_${seasonType}`;
      for (const id of uniqueIds) {
        const cached = cacheMap.get(playerKey(id));
        if (cached && Date.now() < cached.expiry) rawByPlayer[id] = cached.data;
        else missing.push(id);
      }
      const fetchRows = async ids => getCachedOrFetch(
        `nfl_player_game_rows_batch_v2_${[...ids].sort().join('-')}_${season}_${seasonType}`,
        () => fetchBdlPages(async cursor => {
          const query = { player_ids: ids, seasons: [season], season_type: seasonType, per_page: 100 };
          if (cursor != null) query.cursor = cursor;
          const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/stats${buildQuery(query)}`;
          return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
        }, { label: 'NFL player game logs' }), ttlMinutes);
      const remember = (ids, rows) => {
        const expiry = Date.now() + ttlMinutes * 60_000;
        for (const id of ids) {
          const raw = rows.filter(row => String(row?.player?.id ?? row?.player_id) === id);
          rawByPlayer[id] = raw;
          cacheMap.set(playerKey(id), { data: raw, expiry });
        }
      };
      if (missing.length) {
        try {
          remember(missing, await fetchRows(missing));
        } catch (error) {
          // Retry individual filters only when the provider rejects the batch
          // shape. An outage, malformed page or rate limit must not fan out.
          if (missing.length < 2 || ![400, 422].includes(error?.response?.status)) throw error;
          const failures = [];
          await Promise.all(missing.map(async id => {
            try { remember([id], await fetchRows([id])); }
            catch (failure) {
              failures.push(failure);
              console.warn(`[Ball Don't Lie] NFL game logs unavailable for player ${id}: ${failure.message}`);
            }
          }));
          if (failures.length && options.throwOnError) throw failures[0];
        }
      }
      // Cache complete raw seasons, not last-N summaries. Different cutoffs
      // and window sizes reuse transport without borrowing each other's sample.
      const results = {};
      for (const id of uniqueIds) {
        const logs = summarizeNflPlayerGameLogs(rawByPlayer[id] || [], numGames, { asOf, season, playerId: id });
        if (logs) results[id] = logs;
      }
      console.log(`[Ball Don't Lie] NFL game logs: fetched for ${Object.keys(results).length}/${uniqueIds.length} players`);
      return results;
    } catch (error) {
      recordPickDataFailure('BDL:getNflPlayerGameLogsBatch', error);
      console.error(`[Ball Don't Lie] NFL player logs unavailable: ${error.message}`);
      if (options.throwOnError) throw error;
      return {};
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NFL PLAYER PROPS (Ball Don't Lie API)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get NFL player props from Ball Don't Lie API
   * Supports: passing_yards, rushing_yards, receiving_yards, receptions, anytime_td, etc.
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors)
   * @returns {Promise<Array>} - Array of player prop objects
   */
  async getNflPlayerProps(gameId, options = {}) {
    try {
      if (!gameId) {
        console.warn('[Ball Don\'t Lie] NFL player props requires game_id');
        return [];
      }

      const cacheKey = `nfl_player_props_${gameId}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { game_id: gameId };
        if (options.player_id) params.player_id = options.player_id;
        if (options.prop_type) params.prop_type = options.prop_type;
        if (options.vendors) params.vendors = options.vendors;

        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/odds/player_props${buildQuery(params)}`;
        console.log(`[Ball Don't Lie] Fetching NFL player props: ${url}`);

        const response = await bdlHttp.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const props = response.data?.data || [];
        console.log(`[Ball Don't Lie] Retrieved ${props.length} NFL player props for game ${gameId}`);
        return props.map(row => ({ ...row, _gary_observed_at: new Date().toISOString() }));
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
      recordPickDataFailure('BDL:getNflPlayerProps', error);
      const status = error?.response?.status;
      const msg = error?.response?.data?.error || error.message;
      console.error(`[Ball Don't Lie] NFL player props error: ${status} - ${msg}`);
      return [];
    }
  },

  /**
   * Get NFL players by IDs to resolve player names
   * @param {Array<number>} playerIds - Array of player IDs
   * @returns {Promise<Object>} - Map of player_id to player info
   */
  async getNflPlayersByIds(playerIds) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 100);
      const cacheKey = `nfl_players_${uniqueIds.sort().join(',')}`;

      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/players${buildQuery({ player_ids: uniqueIds, per_page: 100 })}`;
        console.log(`[Ball Don't Lie] Fetching ${uniqueIds.length} NFL players`);

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
            position: player.position,
            team: player.team?.full_name || player.team?.name || 'Unknown'
          };
        }

        console.log(`[Ball Don't Lie] Resolved ${Object.keys(playerMap).length} NFL player names`);
        return playerMap;
      }, 60); // Cache for 60 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNflPlayersByIds', error);
      console.error(`[Ball Don't Lie] NFL players error:`, error?.response?.data || error.message);
      return {};
    }
  },
};
