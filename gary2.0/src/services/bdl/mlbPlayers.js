import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY } from './transport.js';
import { fetchBdlPages } from '../bdlPagination.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const mlbPlayersMethods = {

  /**
   * Active-player name index (Jul 27 2026, hub tap-through fix): normalized
   * full name -> { id, teamId, teamAbbr }. Names that collide (two active
   * players, same normalized name) map to null so a wrong card can never
   * open. Cached for a day — roster churn tolerance, not correctness.
   */
  async getMlbActivePlayerNameIndex() {
    const cacheKey = 'mlb_active_player_name_index_v1';
    return await getCachedOrFetch(cacheKey, async () => {
      const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.']/g, '').trim().toLowerCase();
      const map = new Map();
      let cursor;
      for (let page = 0; page < 20; page++) {
        const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/players/active${buildQuery({ per_page: 100, ...(cursor != null ? { cursor } : {}) })}`;
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        for (const p of (response.data?.data || [])) {
          const key = norm(p.full_name || `${p.first_name} ${p.last_name}`);
          if (!key) continue;
          if (map.has(key)) { map.set(key, null); continue; } // ambiguous — never guess
          map.set(key, { id: p.id, teamId: p.team?.id ?? null, teamAbbr: p.team?.abbreviation ?? null });
        }
        cursor = response.data?.meta?.next_cursor;
        if (cursor == null) break;
      }
      console.log(`[BDL] MLB active player name index: ${map.size} names`);
      return map;
    }, 24 * 60);
  },

  /**
   * Exact-name player lookup for names the active index misses (BDL flags
   * IL/transacted players active=false — Langeliers class, Jul 27 2026).
   * Single exact normalized match required; anything else returns null.
   */
  async findMlbPlayerIdByExactName(name) {
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.']/g, '').trim().toLowerCase();
    const key = norm(name);
    if (!key) return null;
    const cacheKey = `mlb_player_by_name_${key.replace(/\s+/g, '_')}`;
    return await getCachedOrFetch(cacheKey, async () => {
      const lastWord = key.split(' ').pop();
      const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/players${buildQuery({ search: lastWord, per_page: 100 })}`;
      const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
      const exact = (response.data?.data || []).filter(p => norm(p.full_name || `${p.first_name} ${p.last_name}`) === key);
      if (exact.length !== 1) return null; // none or ambiguous — never guess
      const p = exact[0];
      return { id: p.id, teamId: p.team?.id ?? null, teamAbbr: p.team?.abbreviation ?? null };
    }, 24 * 60);
  },

  async getMlbLineups(gameId, { throwOnError = false } = {}) {
    if (!gameId) return null;
    try {
      const cacheKey = `mlb_lineups_v2_${gameId}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[BDL] Fetching MLB lineups for game ${gameId}`);
        const entries = await fetchBdlPages(async cursor => {
          const params = { game_ids: [gameId], per_page: 100 };
          if (cursor != null) params.cursor = cursor;
          const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/lineups${buildQuery(params)}`;
          return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
        }, { label: 'MLB pregame lineup', maxPages: 5 });
        if (entries.length === 0) {
          console.log(`[BDL] No lineup data for game ${gameId} (lineups may not be posted yet)`);
          return null;
        }

        // Group by team
        const teams = {};
        for (const entry of entries) {
          const abbr = entry.team?.abbreviation;
          if (!abbr) continue;
          if (!teams[abbr]) teams[abbr] = { batters: [], pitcher: null, teamName: entry.team?.display_name || entry.team?.name };

          if (entry.is_probable_pitcher) {
            const cand = {
              name: entry.player?.full_name || `${entry.player?.first_name} ${entry.player?.last_name}`,
              position: entry.position,
              batsThrows: entry.player?.bats_throws || '',
              playerId: entry.player?.id
            };
            const prior = teams[abbr].pitcher;
            if (teams[abbr]._pitcherConflict) {
              // already poisoned by an earlier conflict — stays null
            } else if (prior && prior.playerId != null && cand.playerId != null
                       && String(prior.playerId) !== String(cand.playerId)) {
              // BDL handed us TWO different probable starters for one team (a stale +
              // an updated projection). We can't tell which is real, so REFUSE to
              // guess — null the pitcher so lineup-derived lanes (owned / platoonEdge /
              // starterForm / player intel) skip this side rather than pin a career
              // H2H or form read on the WRONG arm (live: "Henderson off George Kirby"
              // surfaced when Bryan Woo was the actual Mariners starter).
              console.warn(`[BDL] ⚠️ ${abbr} has conflicting probable starters (${prior.name} vs ${cand.name}) for game ${gameId} — nulling pitcher, won't guess`);
              teams[abbr].pitcher = null;
              teams[abbr]._pitcherConflict = true;
            } else {
              teams[abbr].pitcher = cand;
            }
          } else if (entry.batting_order != null) {
            teams[abbr].batters.push({
              name: entry.player?.full_name || `${entry.player?.first_name} ${entry.player?.last_name}`,
              position: entry.position,
              battingOrder: entry.batting_order,
              batsThrows: entry.player?.bats_throws || '',
              playerId: entry.player?.id
            });
          }
        }

        // Sort batters by order
        for (const abbr of Object.keys(teams)) {
          teams[abbr].batters.sort((a, b) => a.battingOrder - b.battingOrder);
        }

        const teamKeys = Object.keys(teams);
        console.log(`[BDL] MLB lineups: ${teamKeys.map(k => `${k} ${teams[k].batters.length} batters`).join(', ')}${teamKeys.some(k => teams[k].pitcher) ? ' + pitchers' : ''}`);
        return teams;
      }, 10); // 10 min cache
    } catch (error) {
      recordPickDataFailure('BDL:getMlbLineups', error);
      console.error(`[BDL] MLB lineups error for game ${gameId}:`, error?.response?.data || error.message);
      if (throwOnError) throw error;
      return null;
    }
  },

  /**
   * Get MLB players by IDs to resolve player names + positions
   */
  async getMlbPlayersByIds(playerIds, { throwOnError = false } = {}) {
    try {
      if (!playerIds || playerIds.length === 0) return {};
      const requestedIds = [...new Set(playerIds.map(String))].sort();
      const cacheKey = `mlb_players_by_ids_v2_${requestedIds.join(',')}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Chunk IDs and require complete pages. A failed later page cannot
        // become a cached partial identity map, including in strict callers.
        const CHUNK = 100;
        const playerMap = {};
        for (let i = 0; i < requestedIds.length; i += CHUNK) {
          const chunk = requestedIds.slice(i, i + CHUNK);
          const players = await fetchBdlPages(async cursor => {
            const query = { player_ids: chunk, per_page: 100 };
            if (cursor != null) query.cursor = cursor;
            const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/players${buildQuery(query)}`;
            return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
          }, { label: 'MLB player identities', maxPages: 10 });
          for (const player of players) {
            if (!chunk.includes(String(player.id))) continue;
            const identity = {
              name: player.full_name || `${player.first_name} ${player.last_name}`,
              position: player.position,
              batsThrows: player.bats_throws,
              team: player.team?.display_name || player.team?.name || 'Unknown',
              teamAbbr: player.team?.abbreviation || '',
              teamId: player.team?.id
            };
            if (playerMap[player.id] && JSON.stringify(playerMap[player.id]) !== JSON.stringify(identity)) {
              throw new Error(`Conflicting MLB player identity ${player.id}`);
            }
            playerMap[player.id] = identity;
          }
        }
        console.log(`[BDL] Resolved ${Object.keys(playerMap).length} of ${playerIds.length} MLB player name(s)`);
        return playerMap;
      }, 60);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbPlayersByIds', error);
      console.error(`[BDL] MLB players error:`, error?.response?.data || error.message);
      if (throwOnError) throw error;
      return {};
    }
  },

  /**
   * Get MLB player season stats (GOAT tier)
   * Returns full season: batting_avg, batting_hr, batting_rbi, batting_ops, batting_war,
   *                       pitching_era, pitching_whip, pitching_k, pitching_k_per_9, pitching_war, etc.
   */
  async getMlbPlayerSeasonStats({ season, playerIds, teamId, postseason = false, perPage = 100, throwOnError = false } = {}, ttlMinutes = 30) {
    try {
      if (!season) return [];
      // v3 also excludes malformed or nonterminal-empty collections from cache.
      const cacheKey = `mlb_season_stats_v3_${season}_${playerIds?.join(',') || ''}_${teamId || ''}_${postseason}_${perPage}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { season, per_page: perPage };
        if (playerIds?.length) params.player_ids = playerIds;
        if (teamId) params.team_id = teamId;
        if (postseason) params.postseason = postseason;
        console.log(`[BDL] Fetching MLB season stats: season=${season}, players=${playerIds?.length || 'all'}, team=${teamId || 'all'}, per_page=${perPage}`);
        const stats = await fetchBdlPages(async cursor => {
          const pageParams = cursor != null ? { ...params, cursor } : params;
          const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/season_stats${buildQuery(pageParams)}`;
          return (await bdlHttp.get(url, { headers: { Authorization: API_KEY } })).data;
        }, { label: 'MLB season stats' });
        console.log(`[BDL] Retrieved ${stats.length} MLB season stat records`);
        return stats;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbPlayerSeasonStats', error);
      console.error(`[BDL] MLB season stats error:`, error?.response?.data || error.message);
      if (throwOnError) throw error;
      return [];
    }
  },

  /**
   * Get MLB player splits (GOAT tier)
   * Returns splits by: arena, batting order, breakdown (L/R, home/away, day/night),
   *                     count, opponent, position, situation, day/month
   */
  async getMlbPlayerSplits({ playerId, season } = {}, ttlMinutes = 720) {
    try {
      if (!playerId || !season) return null;
      const cacheKey = `mlb_player_splits_${playerId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/players/splits${buildQuery({ player_id: playerId, season })}`;
        console.log(`[BDL] Fetching MLB player splits: player=${playerId}, season=${season}`);
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const data = response.data?.data || {};
        console.log(`[BDL] MLB splits loaded: ${Object.keys(data).length} categories`);
        return data;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbPlayerSplits', error);
      console.error(`[BDL] MLB player splits error:`, error?.response?.data || error.message);
      return null;
    }
  },

  /**
   * Get MLB player vs player matchups (GOAT tier)
   * Batter vs all pitchers on an opponent team (or pitcher vs all batters)
   */
  async getMlbPlayerVsPlayer({ playerId, opponentTeamId } = {}, ttlMinutes = 720) {
    try {
      if (!playerId || !opponentTeamId) return [];
      const cacheKey = `mlb_pvp_${playerId}_vs_${opponentTeamId}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/players/versus${buildQuery({ player_id: playerId, opponent_team_id: opponentTeamId })}`;
        console.log(`[BDL] Fetching MLB player vs player: player=${playerId} vs team=${opponentTeamId}`);
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const data = response.data?.data || [];
        console.log(`[BDL] MLB PvP: ${data.length} matchup records`);
        return data;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbPlayerVsPlayer', error);
      console.error(`[BDL] MLB player vs player error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * A player's completed-game stat rows in TRUE chronological order
   * (oldest → newest). Joins real game dates via the season index, keeps
   * only STATUS_FINAL non-spring games — so "last N" windows can never
   * include spring training, in-progress games, or mis-ordered rows
   * (game_id is NOT monotonic with date; June 3 2026 audit).
   * Each row gains `_game: { date, status, seasonType, postseason }`.
   */
  async getMlbPlayerGameRowsChrono(playerId, season, { throwOnError = false } = {}) {
    const [rows, index] = await Promise.all([
      this.getMlbGameStats({ playerIds: [playerId], seasons: [season], throwOnError }),
      this.getMlbSeasonGameIndex(season, 60, { throwOnError })
    ]);
    return (rows || [])
      .map(r => ({ ...r, _game: index.get(r.game_id) }))
      .filter(r => r._game
        && r._game.status === 'STATUS_FINAL'
        && r._game.seasonType !== 'spring_training')
      .sort((a, b) => String(a._game.date).localeCompare(String(b._game.date)));
  },

  // (A second getMlbPlayersByIds briefly lived here, Aug 18-19 — a duplicate
  // object key that silently SHADOWED the map-returning original above and
  // took the props board's name resolution down for a night. One name, one
  // method: the original at its definition site is the only one.)

  // ═══════════════════════════════════════════════════════════════════════════
  // MLB PITCH-TYPE STATS (GOAT tier) — per-pitch breakdowns
  // Returns: pitch_type, pitch_usage_percent, whiff_percent, chase_percent,
  // command_percent, zone_percent, ba, slg, woba, xwoba — keyed by pitch type
  // (4-seam, slider, curveball, ...). The pitcher endpoint shows how each
  // pitch performs (his slider's whiff%, his fastball's xwoba). The hitter
  // endpoint shows how a batter performs against each pitch type (his
  // xwoba vs sliders, his ba vs curveballs).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Pitcher pitch-type stats. Pass season for full-season aggregates,
   * gameIds for last-N-games breakdowns. Either can be omitted.
   * @param {Object} opts
   * @param {Array<number>} opts.playerIds  Pitcher player IDs.
   * @param {number} [opts.season]          Required for season variant.
   * @param {Array<number>} [opts.gameIds]  Required for game variant.
   * @param {number} [opts.perPage=100]
   */
  async getMlbPitcherPitchTypeStats({ playerIds = [], season, gameIds, perPage = 100 } = {}, ttlMinutes = 60) {
    try {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return [];
      const useGames = Array.isArray(gameIds) && gameIds.length > 0;
      const path = useGames
        ? '/mlb/v1/pitcher_pitch_type_game_stats'
        : '/mlb/v1/pitcher_pitch_type_season_stats';
      const params = useGames
        ? { player_ids: playerIds, game_ids: gameIds, per_page: perPage }
        : { player_ids: playerIds, season, per_page: perPage };
      const cacheKey = `mlb_pitcher_pitch_type_v2_${useGames ? 'game' : 'season'}_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[BDL] Fetching MLB pitcher pitch-type ${useGames ? 'game' : 'season'} stats for ${playerIds.length} pitcher(s)`);
        const data = [];
        let cursor;
        for (let page = 0; page < 4; page++) {
          const url = `${BALLDONTLIE_API_BASE_URL}${path}${buildQuery(cursor != null ? { ...params, cursor } : params)}`;
          const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
          data.push(...(response.data?.data || []));
          cursor = response.data?.meta?.next_cursor;
          if (cursor == null) break;
        }
        console.log(`[BDL] MLB pitcher pitch-type ${useGames ? 'game' : 'season'} stats: ${data.length} records`);
        return data;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbPitcherPitchTypeStats', error);
      console.error(`[BDL] MLB pitcher pitch-type stats error:`, error?.response?.data || error.message);
      return [];
    }
  },

  /**
   * Hitter pitch-type stats. Same param shape as the pitcher variant.
   */
  async getMlbHitterPitchTypeStats({ playerIds = [], season, gameIds, perPage = 100 } = {}, ttlMinutes = 60) {
    try {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return [];
      const useGames = Array.isArray(gameIds) && gameIds.length > 0;
      const path = useGames
        ? '/mlb/v1/hitter_pitch_type_game_stats'
        : '/mlb/v1/hitter_pitch_type_season_stats';
      const params = useGames
        ? { player_ids: playerIds, game_ids: gameIds, per_page: perPage }
        : { player_ids: playerIds, season, per_page: perPage };
      const cacheKey = `mlb_hitter_pitch_type_v2_${useGames ? 'game' : 'season'}_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`[BDL] Fetching MLB hitter pitch-type ${useGames ? 'game' : 'season'} stats for ${playerIds.length} hitter(s)`);
        const data = [];
        let cursor;
        for (let page = 0; page < 4; page++) {
          const url = `${BALLDONTLIE_API_BASE_URL}${path}${buildQuery(cursor != null ? { ...params, cursor } : params)}`;
          const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
          data.push(...(response.data?.data || []));
          cursor = response.data?.meta?.next_cursor;
          if (cursor == null) break;
        }
        console.log(`[BDL] MLB hitter pitch-type ${useGames ? 'game' : 'season'} stats: ${data.length} records`);
        return data;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbHitterPitchTypeStats', error);
      console.error(`[BDL] MLB hitter pitch-type stats error:`, error?.response?.data || error.message);
      return [];
    }
  },
};
