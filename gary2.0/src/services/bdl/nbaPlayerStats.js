import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, API_KEY, BDL_TIMEOUT_MS, bdlHttp, initApi } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';
import { fetchBdlPages } from '../bdlPagination.js';
import { nbaSeason } from '../../utils/dateUtils.js';
import { decodeBdlRows } from '../bdlResponse.js';
import { summarizeNbaPlayerGameLogs } from '../playerGameLogFacts.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const nbaPlayerStatsMethods = {

  /**
   * League leaders (per stat type/season)
   */
  async getLeaders(params = {}, ttlMinutes = 10) {
    try {
      if (!params?.stat_type || !params?.season) {
        throw new Error('stat_type and season are required for getLeaders');
      }
      const cacheKey = `leaders_${params.stat_type}_${params.season}_${JSON.stringify({ ...params, stat_type: undefined, season: undefined })}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/v1/leaders${buildQuery(params)}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: AbortSignal.timeout(BDL_TIMEOUT_MS) });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getLeaders', e);
      console.error('[Ball Don\'t Lie] getLeaders error:', e.message);
      return [];
    }
  },

  /**
   * NBA Season Averages by category/type (players)
   * Example path: /nba/v1/season_averages/{category}?type=base|advanced|...
   */
  async getNbaSeasonAverages({ category = 'general', type = 'base', season, season_type = 'regular', player_ids } = {}, ttlMinutes = 10) {
    try {
      if (!season) return [];
      const cacheKey = `nba_season_averages_${category}_${type}_${season}_${season_type}_${Array.isArray(player_ids) ? player_ids.join('-') : 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const path = `nba/v1/season_averages/${encodeURIComponent(category)}`;
        const ids = Array.isArray(player_ids) ? [...new Set(player_ids)] : [];
        const batches = ids.length ? Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, (i + 1) * 100)) : [null];
        const rows = [];
        for (const batch of batches) {
          rows.push(...await fetchBdlPages(async cursor => {
            const params = { season, season_type, type, per_page: 100 };
            if (batch) params['player_ids[]'] = batch;
            if (cursor != null) params.cursor = cursor;
            return (await bdlHttp.get(`${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`, { headers: { Authorization: API_KEY } })).data;
          }, { label: `NBA ${type} season averages`, maxPages: 30 }));
        }
        return rows;
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNbaSeasonAverages', e);
      console.error('[Ball Don\'t Lie] nba getNbaSeasonAverages error:', e.message);
      return [];
    }
  },

  /**
   * Get NBA box scores for a specific date
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} - Array of box score data with full player stats
   */
  async getNbaBoxScores(date, ttlMinutes = 10) {
    try {
      if (!date) return [];
      
      const cacheKey = `nba_box_scores_${date}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/box_scores?date=${date}`;
        console.log(`[Ball Don't Lie] Fetching NBA box scores for ${date}`);
        
        const resp = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        return Array.isArray(resp?.data?.data) ? resp.data.data : [];
      }, ttlMinutes);
    } catch (e) {
      recordPickDataFailure('BDL:getNbaBoxScores', e);
      console.error('[Ball Don\'t Lie] getNbaBoxScores error:', e.message);
      return [];
    }
  },

  /**
   * Get NBA player season stats formatted for props analysis
   * ENHANCED: Now fetches base stats + usage/advanced stats in parallel
   * Returns: pts, reb, ast, stl, blk, fg3m (threes), min + usage_pct, ts_pct, efg_pct, etc.
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Object>} - Map of playerId to season stats
   */
  async getNbaPlayerSeasonStatsForProps(playerIds, season) {
    try {
      if (!playerIds || playerIds.length === 0 || !season) {
        return {};
      }

      const uniqueIds = [...new Set(playerIds)].slice(0, 50);
      const cacheKey = `nba_props_season_stats_v2_${season}_${uniqueIds.sort().join(',')}`;
      
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[Ball Don't Lie] Fetching NBA season stats (base + usage) for ${uniqueIds.length} players (${season} season)...`);
        
        // Fetch base AND usage/advanced stats in parallel for richer context
        const [baseAverages, usageAverages] = await Promise.all([
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'base',
            season,
            season_type: 'regular',
            player_ids: uniqueIds
          }),
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'usage',
            season,
            season_type: 'regular',
            player_ids: uniqueIds
          })
        ]);

        if ((!baseAverages || baseAverages.length === 0) && (!usageAverages || usageAverages.length === 0)) {
          console.log('[Ball Don\'t Lie] No NBA season averages found');
          return {};
        }

        // Build usage stats lookup by player ID
        const usageMap = {};
        for (const usg of (usageAverages || [])) {
          if (usg.player?.id) {
            usageMap[usg.player.id] = usg.stats || {};
          }
        }
        console.log(`[Ball Don't Lie] Got usage stats for ${Object.keys(usageMap).length} players`);

        // Build map of playerId -> stats (merge base + usage)
        const statsMap = {};
        for (const avg of (baseAverages || [])) {
          if (!avg.player?.id) continue;
          
          const playerId = avg.player.id;
          const stats = avg.stats || {};
          const usage = usageMap[playerId] || {};
          
          statsMap[playerId] = {
            playerId,
            playerName: `${avg.player.first_name} ${avg.player.last_name}`,
            position: avg.player.position,
            season: avg.season,
            gp: stats.gp || 0, // Games played this season
            // Core stats for props
            ppg: stats.pts?.toFixed(1) || null,
            rpg: stats.reb?.toFixed(1) || null,
            apg: stats.ast?.toFixed(1) || null,
            spg: stats.stl?.toFixed(1) || null,
            bpg: stats.blk?.toFixed(1) || null,
            tpg: stats.fg3m?.toFixed(1) || null, // threes per game
            mpg: stats.min?.toFixed(1) || null,
            fgPct: stats.fg_pct ? (stats.fg_pct * 100).toFixed(1) : null,
            fg3Pct: stats.fg3_pct ? (stats.fg3_pct * 100).toFixed(1) : null,
            ftPct: stats.ft_pct ? (stats.ft_pct * 100).toFixed(1) : null,
            // Combo stats
            pra: stats.pts && stats.reb && stats.ast ? 
              (stats.pts + stats.reb + stats.ast).toFixed(1) : null,
            prCombo: stats.pts && stats.reb ? (stats.pts + stats.reb).toFixed(1) : null,
            paCombo: stats.pts && stats.ast ? (stats.pts + stats.ast).toFixed(1) : null,
            raCombo: stats.reb && stats.ast ? (stats.reb + stats.ast).toFixed(1) : null,
            // ENHANCED: Usage & Advanced stats for props context
            usagePct: usage.usg_pct ? (usage.usg_pct * 100).toFixed(1) : null,
            trueShooting: usage.ts_pct ? (usage.ts_pct * 100).toFixed(1) : null,
            effectiveFgPct: usage.efg_pct ? (usage.efg_pct * 100).toFixed(1) : null,
            assistPct: usage.ast_pct ? (usage.ast_pct * 100).toFixed(1) : null,
            reboundPct: usage.reb_pct ? (usage.reb_pct * 100).toFixed(1) : null,
            turnoverPct: usage.tov_pct ? (usage.tov_pct * 100).toFixed(1) : null,
            // Team-share percentages (% of team's total in each category)
            pctPts: usage.pct_pts ? (usage.pct_pts * 100).toFixed(1) : null,
            pctFga: usage.pct_fga ? (usage.pct_fga * 100).toFixed(1) : null,
            pctReb: usage.pct_reb ? (usage.pct_reb * 100).toFixed(1) : null,
            pctAst: usage.pct_ast ? (usage.pct_ast * 100).toFixed(1) : null,
            pctFta: usage.pct_fta ? (usage.pct_fta * 100).toFixed(1) : null,
            // Raw values for calculations
            raw: {
              pts: stats.pts,
              reb: stats.reb,
              ast: stats.ast,
              stl: stats.stl,
              blk: stats.blk,
              fg3m: stats.fg3m,
              min: stats.min,
              turnover: stats.turnover,
              // Usage raw
              usg_pct: usage.usg_pct,
              ts_pct: usage.ts_pct,
              efg_pct: usage.efg_pct
            }
          };
        }

        console.log(`[Ball Don't Lie] Got NBA season stats for ${Object.keys(statsMap).length}/${uniqueIds.length} players (with usage data)`);
        const missingIds = uniqueIds.filter(id => !statsMap[id]);
        if (missingIds.length > 0) {
          console.log(`[Ball Don't Lie] Missing season stats for player ID(s): ${missingIds.join(', ')} — likely two-way/inactive`);
        }
        return statsMap;
      }, 30); // Cache for 30 minutes
    } catch (e) {
      recordPickDataFailure('BDL:getNbaPlayerSeasonStatsForProps', e);
      console.error('[Ball Don\'t Lie] nba getNbaPlayerSeasonStatsForProps error:', e.message);
      return {};
    }
  },

  /**
   * Get advanced stats - supports filtering by game_ids, player_ids, seasons
   * @param {Object|Array} options - Options object or legacy array of game IDs
   * @param {Array} options.game_ids - Array of game IDs
   * @param {Array} options.player_ids - Array of player IDs
   * @param {Array} options.seasons - Array of seasons
   * @param {number} options.per_page - Results per page (default 25)
   * @returns {Promise<Array>} - Array of advanced stats
   */
  async getNbaAdvancedStats(options = {}) {
    try {
      // Handle legacy call format (just an array of game IDs)
      if (Array.isArray(options)) {
        options = { game_ids: options };
      }

      const { game_ids = [], player_ids = [], seasons = [], per_page = 25 } = options;
      const cacheKey = `nba_advanced_stats_g${game_ids.join('_')}_p${player_ids.join('_')}_s${seasons.join('_')}`;

      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA advanced stats - games: ${game_ids.length}, players: ${player_ids.length}, seasons: ${seasons.length}`);
        const client = initApi();

        const params = { per_page };
        if (game_ids.length > 0) params.game_ids = game_ids;
        if (player_ids.length > 0) params.player_ids = player_ids;
        if (seasons.length > 0) params.seasons = seasons;

        const response = await client.nba.getAdvancedStats(params);

        return response.data || [];
      }, 10); // 10 min cache
    } catch (error) {
      recordPickDataFailure('BDL:getNbaAdvancedStats', error);
      console.error('Error fetching NBA advanced stats:', error);
      return [];
    }
  },

  // ==================== ENHANCED GAME LOGS FOR PROPS ====================

  /**
   * Get NBA player game logs with enhanced stats for prop analysis
   * Includes: individual game stats, consistency metrics, hit rates, home/away splits
   * @param {number} playerId - Player ID
   * @param {number} numGames - Number of recent games (default 10)
   * @param {Object} propLines - Optional prop lines to calculate hit rates { points: 24.5, rebounds: 8.5 }
   * @returns {Promise<Object>} - Enhanced game log data
   */
  async getNbaPlayerGameLogs(playerId, numGames = 10, propLines = {}, options = {}) {
    try {
      if (!playerId) return null;
      const asOf = new Date(options.asOf ?? Date.now());
      if (!Number.isFinite(asOf.getTime())) return null;
      const season = options.season == null ? nbaSeason(asOf) : Number(options.season);
      if (!Number.isInteger(season)) return null;
      const endDate = asOf.toISOString().slice(0, 10);
      // Cache transport rows, not a summary tied to a sample size, cutoff or
      // prop line. Recompute those per request, including on a cache hit.
      const cacheKey = `nba_player_game_rows_${playerId}_${season}_${endDate}`;
      const rows = await getCachedOrFetch(cacheKey, async () => {
        const all = [];
        let cursor;
        const seenCursors = new Set();
        // One player's full season fits comfortably in five 100-row pages.
        // A malformed/repeated cursor must not publish a truncated sample.
        for (let page = 0; page < 5; page++) {
          const url = `${BALLDONTLIE_API_BASE_URL}/v1/stats${buildQuery({
            player_ids: [playerId], seasons: [season], end_date: endDate,
            per_page: 100, ...(cursor != null ? { cursor } : {}),
          })}`;
          const response = await bdlHttp.get(url, { headers: { Authorization: API_KEY } });
          all.push(...decodeBdlRows(response.data, 'NBA player game logs'));
          const next = response.data?.meta?.next_cursor;
          if (next == null) return all;
          if (seenCursors.has(String(next))) throw new Error('NBA player game logs: repeated cursor');
          seenCursors.add(String(next));
          cursor = next;
        }
        throw new Error('NBA player game logs: incomplete pagination');
      }, 15);
      return summarizeNbaPlayerGameLogs(rows, { playerId, season, asOf, numGames, propLines });
    } catch (e) {
      recordPickDataFailure('BDL:getNbaPlayerGameLogs', e);
      console.error("[Ball Don't Lie] getNbaPlayerGameLogs error:", e.message);
      // Research must receive the provider failure (including 401), rather
      // than misreporting an access problem as a player with no game logs.
      if (options.throwOnError) throw e;
      return null;
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NBA PLAYER PROPS (Ball Don't Lie API)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get NBA player props from Ball Don't Lie API
   * Supports: points, rebounds, assists, threes, blocks, steals, etc.
   * @param {number} gameId - BDL game ID
   * @param {Object} options - Optional filters (player_id, prop_type, vendors)
   * @returns {Promise<Array>} - Array of player prop objects
   */
  async getNbaPlayerProps(gameId, options = {}) {
    try {
      if (!gameId) {
        console.warn('[Ball Don\'t Lie] NBA player props requires game_id');
        return [];
      }

      const cacheKey = `nba_player_props_${gameId}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { game_id: gameId, per_page: 100 };
        if (options.player_id) params.player_id = options.player_id;
        if (options.prop_type) params.prop_type = options.prop_type;
        if (options.vendors) params.vendors = options.vendors;

        // NBA player props use v2 endpoint — paginate to get all props
        const baseUrl = `${BALLDONTLIE_API_BASE_URL}/v2/odds/player_props`;
        let allProps = [];
        let nextCursor = undefined;
        let pageCount = 0;
        const maxPages = 10;

        do {
          const currentParams = { ...params };
          if (nextCursor) currentParams.cursor = nextCursor;

          const url = `${baseUrl}${buildQuery(currentParams)}`;
          console.log(`[Ball Don't Lie] Fetching NBA player props: ${url} (Page ${pageCount + 1})`);

          const response = await bdlHttp.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const props = response.data?.data || [];
          allProps = allProps.concat(props);
          nextCursor = response.data?.meta?.next_cursor;
          pageCount++;
        } while (nextCursor && pageCount < maxPages);

        console.log(`[Ball Don't Lie] Retrieved ${allProps.length} NBA player props for game ${gameId} (${pageCount} page${pageCount > 1 ? 's' : ''})`);
        return allProps.map(row => ({ ...row, _gary_observed_at: new Date().toISOString() }));
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
      recordPickDataFailure('BDL:getNbaPlayerProps', error);
      const status = error?.response?.status;
      const msg = error?.response?.data?.error || error.message;
      console.error(`[Ball Don't Lie] NBA player props error: ${status} - ${msg}`);
      return [];
    }
  },

  /**
   * Get NBA players by IDs to resolve player names
   * @param {Array<number>} playerIds - Array of player IDs
   * @returns {Promise<Object>} - Map of player_id to player info
   */
  async getNbaPlayersByIds(playerIds) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 100);
      const cacheKey = `nba_players_${uniqueIds.sort().join(',')}`;

      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/players${buildQuery({ player_ids: uniqueIds, per_page: 100 })}`;
        console.log(`[Ball Don't Lie] Fetching ${uniqueIds.length} NBA players`);

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
            team: player.team?.full_name || 'Unknown'
          };
        }

        console.log(`[Ball Don't Lie] Resolved ${Object.keys(playerMap).length} NBA player names`);
        return playerMap;
      }, 60); // Cache for 60 minutes
    } catch (error) {
      recordPickDataFailure('BDL:getNbaPlayersByIds', error);
      console.error(`[Ball Don't Lie] NBA players error:`, error?.response?.data || error.message);
      return {};
    }
  },
};
