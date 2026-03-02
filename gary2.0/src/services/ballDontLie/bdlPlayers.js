import { getCachedOrFetch, initApi, buildQuery, normalizeName, getCurrentNhlSeason, axios, BALLDONTLIE_API_BASE_URL, API_KEY } from './bdlCore.js';

export const playersMethods = {
  /**
   * NFL player per-game stats for specific game_ids
   */
  async getNflPlayerGameStats({ playerId, gameIds } = {}, ttlMinutes = 5) {
    try {
      if (!playerId || !Array.isArray(gameIds) || gameIds.length === 0) return [];
      const key = `nfl_player_game_stats_${playerId}_${gameIds.slice(0, 10).join(',')}`;
      return await getCachedOrFetch(key, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/stats${buildQuery({ player_ids: [playerId], game_ids: gameIds.slice(0, 50), per_page: 100 })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nfl getNflPlayerGameStats error:', e.message);
      return [];
    }
  },

  /**
   * NFL Advanced Passing Stats (season-level; optional player filter)
   * GET /nfl/v1/advanced_stats/passing
   */
  async getNflAdvancedPassingStats({ season, playerId, player_id, postseason = false, week = 0 } = {}, ttlMinutes = 10) {
    try {
      const pid = playerId || player_id || undefined;
      if (!season) return [];
      const cacheKey = `nfl_adv_passing_${season}_${pid || 'all'}_${postseason}_${week}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Prefer SDK per dev docs
        const nfl = this._getSportClient('americanfootball_nfl');
        const endpoint = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/advanced_stats/passing`;
        const baseParams = { season, week: 0, ...(postseason ? { postseason } : {}) };
        // Helper: SDK paginated fetch
        const sdkFetch = async (params) => {
          if (!nfl?.getAdvancedPassingStats) throw new Error('SDK getAdvancedPassingStats not available');
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const req = { ...params, per_page: 100 };
            if (cursor) req.cursor = cursor;
            const resp = await nfl.getAdvancedPassingStats(req);
            const rows = Array.isArray(resp?.data) ? resp.data : [];
            all.push(...rows);
            cursor = resp?.meta?.next_cursor;
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        // Helper: fetch with pagination (season-wide)
        const fetchSeasonAll = async (omitWeek = false) => {
          const params = { season, per_page: 100, ...(postseason ? { postseason } : {}) };
          if (!omitWeek) params.week = 0;
          try {
            if (nfl?.getAdvancedPassingStats) {
              return await sdkFetch(params);
            }
          } catch (sdkErr) {
            // fall through to HTTP
          }
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const httpParams = { season, postseason, per_page: 100, week: omitWeek ? undefined : 0, cursor };
            if (cursor) httpParams.cursor = cursor;
            try {
              const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params: httpParams });
              const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
              all.push(...rows);
              cursor = resp?.data?.meta?.next_cursor;
              if (!cursor) break;
            } catch (httpErr) {
              if (httpErr?.response?.status === 400) {
                console.warn('[Ball Don\'t Lie] nfl advanced passing 400 (season-wide)', httpErr?.response?.data || '');
                break;
              }
              throw httpErr;
            }
            loops += 1;
          }
          return all;
        };
        const httpFetch = async (params) => {
          try {
            const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params });
            const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
            return rows || [];
          } catch (err) {
            if (err?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced passing 400', err?.response?.data || '');
              return [];
            }
            throw err;
          }
        };
        // First: try SDK with targeted params (player_id + week)
        try {
          let data = [];
          try {
            data = await sdkFetch({ ...baseParams, ...(pid ? { player_id: pid } : {}) });
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced passing SDK 400', sdkErr?.response?.data || '');
              data = [];
            } else {
              throw sdkErr;
            }
          }
          if (!data || data.length === 0) {
            data = await httpFetch({ ...baseParams, per_page: 100, ...(pid ? { player_id: pid } : {}) });
          }
          // If still empty and pid set, grab season-all then filter
          if ((!data || data.length === 0) && pid) {
            let seasonAll;
            try { seasonAll = await sdkFetch({ season, ...(postseason ? { postseason } : {}) }); } catch {}
            if (!seasonAll || seasonAll.length === 0) {
              seasonAll = await fetchSeasonAll(true);
              if (!seasonAll || seasonAll.length === 0) seasonAll = await fetchSeasonAll(false);
            }
            data = Array.isArray(seasonAll) ? seasonAll.filter(r => r?.player?.id === pid) : [];
          }
          return data || [];
        } catch (primaryErr) {
          // Fallback: HTTP season-all (no player_id), then filter locally
          try {
            let seasonAll = await fetchSeasonAll(true);
            if ((!seasonAll || seasonAll.length === 0)) {
              seasonAll = await fetchSeasonAll(false);
            }
            if (pid) {
              seasonAll = seasonAll.filter(r => r?.player?.id === pid);
            }
            return seasonAll || [];
          } catch (fallbackErr) {
            if (primaryErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced passing fallback 400', primaryErr?.response?.data || '');
              return [];
            }
            throw primaryErr;
          }
        }
      }, ttlMinutes);
    } catch (e) {
      if (e?.response?.status === 400) {
        console.warn('[Ball Don\'t Lie] nfl getNflAdvancedPassingStats 400', e?.response?.data || '');
        return [];
      }
      console.error('[Ball Don\'t Lie] nfl getNflAdvancedPassingStats error:', e.message);
      return [];
    }
  },

  /**
   * NFL Advanced Rushing Stats (season-level; optional player filter)
   * GET /nfl/v1/advanced_stats/rushing
   */
  async getNflAdvancedRushingStats({ season, playerId, player_id, postseason = false, week = 0 } = {}, ttlMinutes = 10) {
    try {
      const pid = playerId || player_id || undefined;
      if (!season) return [];
      const cacheKey = `nfl_adv_rushing_${season}_${pid || 'all'}_${postseason}_${week}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const nfl = this._getSportClient('americanfootball_nfl');
        const endpoint = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/advanced_stats/rushing`;
        const sdkFetch = async (params) => {
          if (!nfl?.getAdvancedRushingStats) throw new Error('SDK getAdvancedRushingStats not available');
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const req = { ...params, per_page: 100 };
            if (cursor) req.cursor = cursor;
            const resp = await nfl.getAdvancedRushingStats(req);
            const rows = Array.isArray(resp?.data) ? resp.data : [];
            all.push(...rows);
            cursor = resp?.meta?.next_cursor;
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        // Direct HTTP fetch helper (handles pagination via cursor)
        const httpFetch = async (params) => {
          try {
            const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params });
            const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
            return rows || [];
          } catch (err) {
            if (err?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced rushing 400', err?.response?.data || '');
              return [];
            }
            throw err;
          }
        };
        const fetchSeasonAll = async (omitWeek = false) => {
          const params = { season, per_page: 100, ...(postseason ? { postseason } : {}) };
          if (!omitWeek) params.week = 0;
          try {
            if (nfl?.getAdvancedRushingStats) {
              return await sdkFetch(params);
            }
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced rushing SDK 400 (season-wide)', sdkErr?.response?.data || '');
              return [];
            }
          }
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const httpParams = { season, per_page: 100, week: omitWeek ? undefined : 0, ...(postseason ? { postseason } : {}) };
            if (cursor) httpParams.cursor = cursor;
            try {
              const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params: httpParams });
              const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
              all.push(...rows);
              cursor = resp?.data?.meta?.next_cursor;
            } catch (httpErr) {
              if (httpErr?.response?.status === 400) {
                console.warn('[Ball Don\'t Lie] nfl advanced rushing 400 (season-wide)', httpErr?.response?.data || '');
                break;
              }
              throw httpErr;
            }
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        try {
          let data = [];
          try {
            data = await sdkFetch({ season, week: 0, ...(postseason ? { postseason } : {}) , ...(pid ? { player_id: pid } : {}) });
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced rushing SDK 400', sdkErr?.response?.data || '');
              data = [];
            } else {
              throw sdkErr;
            }
          }
          if (!data || data.length === 0) {
            data = await httpFetch({ season, week: 0, ...(postseason ? { postseason } : {}), ...(pid ? { player_id: pid } : {}), per_page: 100 });
          }
          if ((!data || data.length === 0) && pid) {
            let seasonAll;
            try { seasonAll = await sdkFetch({ season, ...(postseason ? { postseason } : {}) }); } catch {}
            if (!seasonAll || seasonAll.length === 0) {
              seasonAll = await fetchSeasonAll(true);
              if ((!seasonAll || seasonAll.length === 0)) {
                seasonAll = await fetchSeasonAll(false);
              }
            }
            data = Array.isArray(seasonAll) ? seasonAll.filter(r => r?.player?.id === pid) : [];
          }
          return data || [];
        } catch (primaryErr) {
          try {
            let seasonAll = await fetchSeasonAll(true);
            if ((!seasonAll || seasonAll.length === 0)) {
              seasonAll = await fetchSeasonAll(false);
            }
            if (pid) {
              seasonAll = seasonAll.filter(r => r?.player?.id === pid);
            }
            return seasonAll || [];
          } catch (fallbackErr) {
            if (primaryErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced rushing fallback 400', primaryErr?.response?.data || '');
              return [];
            }
            throw primaryErr;
          }
        }
      }, ttlMinutes);
    } catch (e) {
      if (e?.response?.status === 400) {
        console.warn('[Ball Don\'t Lie] nfl getNflAdvancedRushingStats 400', e?.response?.data || '');
        return [];
      }
      console.error('[Ball Don\'t Lie] nfl getNflAdvancedRushingStats error:', e.message);
      return [];
    }
  },

  /**
   * NFL Advanced Receiving Stats (season-level; optional player filter)
   * GET /nfl/v1/advanced_stats/receiving
   */
  async getNflAdvancedReceivingStats({ season, playerId, player_id, postseason = false, week = 0 } = {}, ttlMinutes = 10) {
    try {
      const pid = playerId || player_id || undefined;
      if (!season) return [];
      const cacheKey = `nfl_adv_receiving_${season}_${pid || 'all'}_${postseason}_${week}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const nfl = this._getSportClient('americanfootball_nfl');
        const endpoint = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/advanced_stats/receiving`;
        const sdkFetch = async (params) => {
          if (!nfl?.getAdvancedReceivingStats) throw new Error('SDK getAdvancedReceivingStats not available');
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const req = { ...params, per_page: 100 };
            if (cursor) req.cursor = cursor;
            const resp = await nfl.getAdvancedReceivingStats(req);
            const rows = Array.isArray(resp?.data) ? resp.data : [];
            all.push(...rows);
            cursor = resp?.meta?.next_cursor;
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        // Direct HTTP fetch helper (handles pagination via cursor)
        const httpFetch = async (params) => {
          try {
            const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params });
            const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
            return rows || [];
          } catch (err) {
            if (err?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced receiving 400', err?.response?.data || '');
              return [];
            }
            throw err;
          }
        };
        const fetchSeasonAll = async (omitWeek = false) => {
          const params = { season, per_page: 100, ...(postseason ? { postseason } : {}) };
          if (!omitWeek) params.week = 0;
          try {
            if (nfl?.getAdvancedReceivingStats) {
              return await sdkFetch(params);
            }
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced receiving SDK 400 (season-wide)', sdkErr?.response?.data || '');
              return [];
            }
          }
          const all = [];
          let cursor;
          let loops = 0;
          while (loops < 5) {
            const httpParams = { season, per_page: 100, week: omitWeek ? undefined : 0, ...(postseason ? { postseason } : {}) };
            if (cursor) httpParams.cursor = cursor;
            try {
              const resp = await axios.get(endpoint, { headers: { Authorization: API_KEY }, params: httpParams });
              const rows = Array.isArray(resp?.data?.data) ? resp.data.data : [];
              all.push(...rows);
              cursor = resp?.data?.meta?.next_cursor;
            } catch (httpErr) {
              if (httpErr?.response?.status === 400) {
                console.warn('[Ball Don\'t Lie] nfl advanced receiving 400 (season-wide)', httpErr?.response?.data || '');
                break;
              }
              throw httpErr;
            }
            if (!cursor) break;
            loops += 1;
          }
          return all;
        };
        try {
          let data = [];
          try {
            data = await sdkFetch({ season, week: 0, ...(postseason ? { postseason } : {}), ...(pid ? { player_id: pid } : {}) });
          } catch (sdkErr) {
            if (sdkErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced receiving SDK 400', sdkErr?.response?.data || '');
              data = [];
            } else {
              throw sdkErr;
            }
          }
          if (!data || data.length === 0) {
            data = await httpFetch({ season, week: 0, ...(postseason ? { postseason } : {}), ...(pid ? { player_id: pid } : {}), per_page: 100 });
          }
          if ((!data || data.length === 0) && pid) {
            let seasonAll;
            try { seasonAll = await sdkFetch({ season, ...(postseason ? { postseason } : {}) }); } catch {}
            if (!seasonAll || seasonAll.length === 0) {
              seasonAll = await fetchSeasonAll(true);
              if ((!seasonAll || seasonAll.length === 0)) {
                seasonAll = await fetchSeasonAll(false);
              }
            }
            data = Array.isArray(seasonAll) ? seasonAll.filter(r => r?.player?.id === pid) : [];
          }
          return data || [];
        } catch (primaryErr) {
          try {
            let seasonAll = await fetchSeasonAll(true);
            if ((!seasonAll || seasonAll.length === 0)) {
              seasonAll = await fetchSeasonAll(false);
            }
            if (pid) {
              seasonAll = seasonAll.filter(r => r?.player?.id === pid);
            }
            return seasonAll || [];
          } catch (fallbackErr) {
            if (primaryErr?.response?.status === 400) {
              console.warn('[Ball Don\'t Lie] nfl advanced receiving fallback 400', primaryErr?.response?.data || '');
              return [];
            }
            throw primaryErr;
          }
        }
      }, ttlMinutes);
    } catch (e) {
      if (e?.response?.status === 400) {
        console.warn('[Ball Don\'t Lie] nfl getNflAdvancedReceivingStats 400', e?.response?.data || '');
        return [];
      }
      console.error('[Ball Don\'t Lie] nfl getNflAdvancedReceivingStats error:', e.message);
      return [];
    }
  },

  /**
   * NFL Team Roster with Depth Chart
   * GET /nfl/v1/teams/<ID>/roster
   * Returns players organized by position with depth (1=starter, 2=backup, etc.)
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @returns {Array} - Roster entries with player info, position, depth, injury_status
   */
  async getNflTeamRoster(teamId, season = null, ttlMinutes = 30) {
    // Calculate dynamic NFL season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return [];
      const cacheKey = `nfl_team_roster_${teamId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/teams/${encodeURIComponent(teamId)}/roster${buildQuery({ season })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nfl getNflTeamRoster error:', e.message);
      return [];
    }
  },

  /**
   * NFL Season Stats filtered by team
   * GET /nfl/v1/season_stats
   * Returns player season stats for a specific team
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {boolean} postseason - Include postseason stats
   * @returns {Array} - Player season stats
   */
  async getNflSeasonStatsByTeam(teamId, season = null, postseason = false, ttlMinutes = 15) {
    // Calculate dynamic NFL season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return [];
      const cacheKey = `nfl_season_stats_team_${teamId}_${season}_${postseason}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/season_stats${buildQuery({ 
          team_id: teamId, 
          season, 
          postseason,
          per_page: 100
        })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nfl getNflSeasonStatsByTeam error:', e.message);
      return [];
    }
  },

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
          const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });

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
      console.error('[Ball Don\'t Lie] nhl getNhlTeamPlayers error:', e.message);
      return [];
    }
  },

  /**
   * NCAAF Team Players (Roster)
   * GET /ncaaf/v1/players?team_ids[]=<ID>
   * Returns players for a specific team
   * @param {number} teamId - BDL team ID
   * @returns {Array} - Player objects with position, name, etc.
   */
  async getNcaafTeamPlayers(teamId, ttlMinutes = 30) {
    try {
      if (!teamId) return [];
      const cacheKey = `ncaaf_team_players_${teamId}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/players/active${buildQuery({ 
          team_ids: [teamId],
          per_page: 100
        })}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] ncaaf getNcaafTeamPlayers error:', e.message);
      return [];
    }
  },

  /**
   * Generic players fetch with HTTP fallback
   */
  async getPlayersGeneric(sportKey, params = {}, ttlMinutes = 10) {
    try {
      const cacheKey = `${sportKey}_players_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        if (sport?.getPlayers) {
          const resp = await sport.getPlayers(params);
          return resp?.data || [];
        }
        const endpointMap = {
          basketball_nba: 'nba/v1/players',
          basketball_ncaab: 'ncaab/v1/players',
          icehockey_nhl: 'nhl/v1/players',
          americanfootball_nfl: 'nfl/v1/players',
          americanfootball_ncaaf: 'ncaaf/v1/players'
        };
        const path = endpointMap[sportKey];
        if (!path) return [];
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        // ⭐ FIX: Return BOTH data and meta for pagination support
        return { 
          data: response.data?.data || [],
          meta: response.data?.meta
        };
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getPlayers error:`, e.message);
      return [];
    }
  },

  /**
   * Active players (per sport)
   */
  async getPlayersActive(sportKey, params = {}, ttlMinutes = 5) {
    try {
      const cacheKey = `${sportKey}_players_active_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        if (sport?.getActivePlayers) {
          const resp = await sport.getActivePlayers(params);
          // ⭐ FIX: Return BOTH data and meta for pagination support
          return {
            data: Array.isArray(resp?.data) ? resp.data : [],
            meta: resp?.meta
          };
        }
        const endpointMap = {
          basketball_nba: 'nba/v1/players/active',
          basketball_ncaab: 'ncaab/v1/players/active',
          americanfootball_nfl: 'nfl/v1/players/active',
          americanfootball_ncaaf: 'ncaaf/v1/players/active',
          icehockey_nhl: 'nhl/v1/players/active',
          baseball_mlb: 'mlb/v1/players/active'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getPlayersActive not supported');
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        // ⭐ FIX: Return BOTH data and meta for pagination support
        return { 
          data: Array.isArray(json?.data) ? json.data : [],
          meta: json?.meta
        };
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getPlayersActive error:`, e.message);
      return { data: [], meta: null };
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
        const params = { season, season_type, type, per_page: 100 };
        if (Array.isArray(player_ids) && player_ids.length) {
          params['player_ids[]'] = player_ids.slice(0, 100);
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return Array.isArray(resp?.data?.data) ? resp.data.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] nba getNbaSeasonAverages error:', e.message);
      return [];
    }
  },

  /**
   * Get NBA roster depth for two teams - top 10 players per team with base + advanced stats
   * Used for scout report to show Gary the full rotation (starters + key bench)
   * Includes: base stats (PPG, RPG, APG) + advanced stats (eFG%, TS%, +/-, net_rating, usage)
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2025 for 2025-26 season)
   * @returns {Promise<Object>} - { home: [...], away: [...] } arrays of player stats with advanced metrics
   */
  async getNbaRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏀 [Ball Don't Lie] Fetching NBA roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);

      // Get team IDs first
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByName(homeTeamName),
        this.getTeamByName(awayTeamName)
      ]);

      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: [], away: [] };
      }

      console.log(`🏀 [Ball Don't Lie] Team IDs: ${homeTeam.full_name} (${homeTeam.id}) vs ${awayTeam.full_name} (${awayTeam.id})`);

      const cacheKey = `nba_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch active players for both teams separately (limit 25 per team to catch returning bench players with low season minutes)
        console.log(`🏀 [Ball Don't Lie] Fetching active players...`);

        const [homePlayersResp, awayPlayersResp] = await Promise.all([
          axios.get(`${BALLDONTLIE_API_BASE_URL}/nba/v1/players/active?team_ids[]=${homeTeam.id}&per_page=25`, { headers: { 'Authorization': API_KEY } }),
          axios.get(`${BALLDONTLIE_API_BASE_URL}/nba/v1/players/active?team_ids[]=${awayTeam.id}&per_page=25`, { headers: { 'Authorization': API_KEY } })
        ]);

        const homePlayers = Array.isArray(homePlayersResp?.data?.data) ? homePlayersResp.data.data : [];
        const awayPlayers = Array.isArray(awayPlayersResp?.data?.data) ? awayPlayersResp.data.data : [];

        if (homePlayers.length === 0 && awayPlayers.length === 0) {
          console.warn('[Ball Don\'t Lie] No active players found for teams');
          return { home: [], away: [] };
        }

        const allPlayers = [...homePlayers, ...awayPlayers];
        console.log(`🏀 [Ball Don't Lie] Found ${allPlayers.length} active players (${homePlayers.length} + ${awayPlayers.length})`);

        // Get all player IDs for season averages fetch
        const allPlayerIds = allPlayers.map(p => p.id);

        if (allPlayerIds.length === 0) {
          return { home: [], away: [] };
        }

        // Fetch base, advanced, AND usage season averages in parallel
        console.log(`🏀 [Ball Don't Lie] Fetching base + advanced + usage season averages for ${allPlayerIds.length} players...`);
        const [baseAverages, advancedAverages, usageAverages] = await Promise.all([
          // Base stats: pts, reb, ast, min, fg_pct, etc.
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'base',
            season,
            season_type: 'regular',
            player_ids: allPlayerIds.slice(0, 100)
          }),
          // Advanced stats: efg_pct, ts_pct, off_rating, def_rating, net_rating, usg_pct, pace, pie
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'advanced',
            season,
            season_type: 'regular',
            player_ids: allPlayerIds.slice(0, 100)
          }),
          // Usage/team-share stats: pct_pts, pct_fga, pct_reb, pct_ast, pct_stl, pct_blk, pct_tov, pct_fta
          this.getNbaSeasonAverages({
            category: 'general',
            type: 'usage',
            season,
            season_type: 'regular',
            player_ids: allPlayerIds.slice(0, 100)
          })
        ]);

        // Filter out players with 0 games played (haven't actually played this season)
        const relevantBaseAverages = baseAverages.filter(avg => (avg.stats?.gp || 0) > 0);
        console.log(`🏀 [Ball Don't Lie] Got base averages for ${relevantBaseAverages.length} players, advanced for ${advancedAverages.length} players, usage for ${(usageAverages || []).length} players`);

        // Build maps of player ID -> stats
        const baseStatsMap = {};
        for (const avg of relevantBaseAverages) {
          if (avg.player?.id) {
            baseStatsMap[avg.player.id] = {
              pts: avg.stats?.pts || 0,
              reb: avg.stats?.reb || 0,
              ast: avg.stats?.ast || 0,
              min: avg.stats?.min || 0,
              stl: avg.stats?.stl || 0,
              blk: avg.stats?.blk || 0,
              fg_pct: avg.stats?.fg_pct || 0,
              fg3_pct: avg.stats?.fg3_pct || 0,
              fgm: avg.stats?.fgm || 0,
              fga: avg.stats?.fga || 0,
              fg3m: avg.stats?.fg3m || 0,
              fta: avg.stats?.fta || 0,
              ftm: avg.stats?.ftm || 0,
              tov: avg.stats?.turnover || avg.stats?.tov || 0,
              oreb: avg.stats?.oreb || 0,
              dreb: avg.stats?.dreb || 0,
              gp: avg.stats?.gp || 0,
              plus_minus: avg.stats?.plus_minus || 0
            };
          }
        }

        // Build advanced stats map
        const advStatsMap = {};
        for (const avg of advancedAverages) {
          if (avg.player?.id) {
            advStatsMap[avg.player.id] = {
              efg_pct: avg.stats?.efg_pct || 0,
              ts_pct: avg.stats?.ts_pct || 0,
              off_rating: avg.stats?.off_rating || avg.stats?.offensive_rating || 0,
              def_rating: avg.stats?.def_rating || avg.stats?.defensive_rating || 0,
              net_rating: avg.stats?.net_rating || 0,
              usg_pct: avg.stats?.usg_pct || avg.stats?.usage_pct || 0,
              pace: avg.stats?.pace || 0,
              pie: avg.stats?.pie || 0
            };
          }
        }

        // Build usage/team-share stats map (pct_pts, pct_fga, pct_reb, pct_ast, etc.)
        const usageStatsMap = {};
        for (const avg of (usageAverages || [])) {
          if (avg.player?.id) {
            usageStatsMap[avg.player.id] = {
              pct_pts: avg.stats?.pct_pts || 0,
              pct_fga: avg.stats?.pct_fga || 0,
              pct_reb: avg.stats?.pct_reb || 0,
              pct_ast: avg.stats?.pct_ast || 0,
              pct_stl: avg.stats?.pct_stl || 0,
              pct_blk: avg.stats?.pct_blk || 0,
              pct_tov: avg.stats?.pct_tov || 0,
              pct_fta: avg.stats?.pct_fta || 0
            };
          }
        }

        // Helper to format player with base + advanced + usage stats
        const formatPlayer = (player) => {
          const base = baseStatsMap[player.id] || {};
          const adv = advStatsMap[player.id] || {};
          const usg = usageStatsMap[player.id] || {};

          // Calculate eFG% if not provided: eFG% = (FGM + 0.5 * FG3M) / FGA
          let efgPct = adv.efg_pct || 0;
          if (!efgPct && base.fga > 0) {
            efgPct = (base.fgm + 0.5 * base.fg3m) / base.fga;
          }

          return {
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            position: player.position || '?',
            jersey: player.jersey_number || '?',
            // Base stats
            pts: base.pts || 0,
            reb: base.reb || 0,
            ast: base.ast || 0,
            min: base.min || 0,
            stl: base.stl || 0,
            blk: base.blk || 0,
            fg_pct: base.fg_pct || 0,
            fg3_pct: base.fg3_pct || 0,
            gp: base.gp || 0,
            plus_minus: base.plus_minus || 0,
            tov: base.tov || 0,
            oreb: base.oreb || 0,
            // Advanced stats
            efg_pct: efgPct,
            ts_pct: adv.ts_pct || 0,
            off_rating: adv.off_rating || 0,
            def_rating: adv.def_rating || 0,
            net_rating: adv.net_rating || 0,
            usg_pct: adv.usg_pct || 0,
            pace: adv.pace || 0,
            pie: adv.pie || 0,
            // Team-share percentages (from type=usage endpoint)
            pct_pts: usg.pct_pts || 0,
            pct_fga: usg.pct_fga || 0,
            pct_reb: usg.pct_reb || 0,
            pct_ast: usg.pct_ast || 0,
            pct_stl: usg.pct_stl || 0,
            pct_blk: usg.pct_blk || 0,
            pct_tov: usg.pct_tov || 0,
            pct_fta: usg.pct_fta || 0
          };
        };

        // Format ALL active players (for injury roster filter)
        const homeAllPlayers = homePlayers.map(formatPlayer).filter(p => p.gp > 0);
        const awayAllPlayers = awayPlayers.map(formatPlayer).filter(p => p.gp > 0);

        // Top 10 by minutes for scout report display
        const homeRoster = homeAllPlayers
          .filter(p => p.min > 5)
          .sort((a, b) => b.min - a.min)
          .slice(0, 10);

        const awayRoster = awayAllPlayers
          .filter(p => p.min > 5)
          .sort((a, b) => b.min - a.min)
          .slice(0, 10);

        console.log(`🏀 [Ball Don't Lie] Roster depth ready: ${homeTeam.name} (${homeRoster.length} display, ${homeAllPlayers.length} total), ${awayTeam.name} (${awayRoster.length} display, ${awayAllPlayers.length} total)`);

        return {
          home: homeRoster,
          away: awayRoster,
          homeAllPlayers: homeAllPlayers,   // Full list for injury roster filter
          awayAllPlayers: awayAllPlayers,   // Full list for injury roster filter
          homeTeamName: homeTeam.full_name,
          awayTeamName: awayTeam.full_name,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id
        };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaRosterDepth error:', e.message);
      return { home: [], away: [] };
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
                const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
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
      console.error('[Ball Don\'t Lie] getNhlRosterDepth error:', e.message);
      return { home: { skaters: [], goalies: [] }, away: { skaters: [], goalies: [] } };
    }
  },

  /**
   * Get NCAAB roster depth for two teams - top 9 players with season stats
   * Used for scout report to show Gary the full rotation
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Object>} - { home: [...], away: [...], homeTeamName, awayTeamName }
   */
  async getNcaabRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏀 [Ball Don't Lie] Fetching NCAAB roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);
      
      // Get team IDs first (NCAAB teams)
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByNameGeneric('basketball_ncaab', homeTeamName),
        this.getTeamByNameGeneric('basketball_ncaab', awayTeamName)
      ]);
      
      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find NCAAB team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: [], away: [] };
      }
      
      console.log(`🏀 [Ball Don't Lie] Team IDs: ${homeTeam.full_name || homeTeam.name} (${homeTeam.id}) vs ${awayTeam.full_name || awayTeam.name} (${awayTeam.id})`);
      
      const cacheKey = `ncaab_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch active players for both teams (limit to 25 total, we only need top 9 per team)
        const activePlayersUrl = `${BALLDONTLIE_API_BASE_URL}/ncaab/v1/players/active?team_ids[]=${homeTeam.id}&team_ids[]=${awayTeam.id}&per_page=25`;
        const playersResp = await axios.get(activePlayersUrl, { headers: { 'Authorization': API_KEY } });
        const allPlayers = Array.isArray(playersResp?.data?.data) ? playersResp.data.data : [];
        
        if (allPlayers.length === 0) {
          console.warn('[Ball Don\'t Lie] No active NCAAB players found');
          return { home: [], away: [] };
        }
        
        console.log(`🏀 [Ball Don't Lie] Found ${allPlayers.length} active NCAAB players`);
        
        // Separate by team
        const homePlayers = allPlayers.filter(p => p.team?.id === homeTeam.id);
        const awayPlayers = allPlayers.filter(p => p.team?.id === awayTeam.id);
        
        // Fetch season stats for both teams
        console.log(`🏀 [Ball Don't Lie] Fetching NCAAB player season stats...`);
        const [homeStats, awayStats] = await Promise.all([
          this.getNcaabPlayerSeasonStats({ teamId: homeTeam.id, season }),
          this.getNcaabPlayerSeasonStats({ teamId: awayTeam.id, season })
        ]);
        
        // Build stats map
        const statsMap = {};
        for (const stat of [...homeStats, ...awayStats]) {
          if (stat.player?.id) {
            statsMap[stat.player.id] = stat;
          }
        }
        
        // Format player with stats
        const formatPlayer = (player) => {
          const stats = statsMap[player.id] || {};
          const gp = stats.games_played || 1;
          const fgm = stats.fgm || 0;
          const fga = stats.fga || 0;
          const fg3m = stats.fg3m || 0;
          const fta = stats.fta || 0;
          const efgPct = fga > 0 ? ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1) : null;
          const tsa = 2 * (fga + 0.44 * fta);
          const tsPct = tsa > 0 ? ((stats.pts || 0) / tsa * 100).toFixed(1) : null;
          const fgaPg = gp > 0 ? (fga / gp).toFixed(1) : '0.0';
          return {
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            position: player.position || '?',
            jersey: player.jersey_number || '?',
            gp: stats.games_played || 0,
            pts: stats.pts || (gp > 0 ? (stats.pts || 0) / gp : 0),
            ppg: gp > 0 ? ((stats.pts || 0) / gp).toFixed(1) : '0.0',
            reb: gp > 0 ? ((stats.reb || 0) / gp).toFixed(1) : '0.0',
            ast: gp > 0 ? ((stats.ast || 0) / gp).toFixed(1) : '0.0',
            min: stats.min ? parseFloat(stats.min).toFixed(1) : '0.0',
            fgPct: stats.fg_pct ? stats.fg_pct.toFixed(1) : 'N/A',
            fg3Pct: stats.fg3_pct ? stats.fg3_pct.toFixed(1) : 'N/A',
            efgPct,
            tsPct,
            fgaPg
          };
        };
        
        // Sort by PPG (total points as proxy for importance) and take top 9
        const homeRoster = homePlayers
          .map(formatPlayer)
          .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
          .slice(0, 9);
          
        const awayRoster = awayPlayers
          .map(formatPlayer)
          .sort((a, b) => parseFloat(b.ppg) - parseFloat(a.ppg))
          .slice(0, 9);
        
        console.log(`🏀 [Ball Don't Lie] NCAAB roster depth ready: ${homeTeam.full_name || homeTeam.name} (${homeRoster.length} players), ${awayTeam.full_name || awayTeam.name} (${awayRoster.length} players)`);

        // Build GP map for ALL players (not just top 9) — used by narrative scrubber
        // to distinguish "never played this season" (gp=0) from "played but now injured"
        const gpMap = {};
        for (const player of allPlayers) {
          const name = `${player.first_name} ${player.last_name}`.trim();
          const stats = statsMap[player.id] || {};
          gpMap[name] = stats.games_played || 0;
        }

        // Compute team-level Four Factors from team_season_stats (per-game averages)
        // player_season_stats does NOT have oreb/dreb — only team_season_stats does
        // team_season_stats returns per-game averages, so ratios (eFG%, TOV Rate, etc.) work directly
        const [homeTeamSeasonStats, awayTeamSeasonStats] = await Promise.all([
          this.getTeamSeasonStats('basketball_ncaab', { teamId: homeTeam.id, season }),
          this.getTeamSeasonStats('basketball_ncaab', { teamId: awayTeam.id, season })
        ]);

        // Compute Four Factors using Dean Oliver formulas (Basketball Reference)
        // eFG% = (FGM + 0.5 * FG3M) / FGA
        // TOV% = TOV / (FGA + 0.44 * FTA + TOV)
        // FTA Rate = FTA / FGA (KenPom convention — measures getting to the line)
        // ORB% = Team_ORB / (Team_ORB + Opponent_DRB) — requires cross-referencing both teams
        const computeTeamFourFactors = (teamStatsArr, opponentStatsArr) => {
          const ts = Array.isArray(teamStatsArr) ? teamStatsArr[0] : teamStatsArr;
          const opp = Array.isArray(opponentStatsArr) ? opponentStatsArr[0] : opponentStatsArr;
          if (!ts) return { efgPct: null, tovRate: null, ftaRate: null, orebPct: null };
          const fgm = ts.fgm || 0;
          const fga = ts.fga || 0;
          const fg3m = ts.fg3m || 0;
          const fta = ts.fta || 0;
          const oreb = ts.oreb || 0;
          const tov = ts.turnover || 0;
          // ORB% uses opponent's DRB (correct formula), falls back to own DRB if opponent data unavailable
          const oppDreb = opp ? (opp.dreb || 0) : (ts.dreb || 0);
          const orebDenom = oreb + oppDreb;
          return {
            efgPct: fga > 0 ? ((fgm + 0.5 * fg3m) / fga * 100).toFixed(1) : null,
            tovRate: fga > 0 ? (tov / (fga + 0.44 * fta + tov) * 100).toFixed(1) : null,
            ftaRate: fga > 0 ? (fta / fga * 100).toFixed(1) : null,
            orebPct: orebDenom > 0 ? (oreb / orebDenom * 100).toFixed(1) : null,
          };
        };

        const homeTeamFourFactors = computeTeamFourFactors(homeTeamSeasonStats, awayTeamSeasonStats);
        const awayTeamFourFactors = computeTeamFourFactors(awayTeamSeasonStats, homeTeamSeasonStats);

        return {
          home: homeRoster,
          away: awayRoster,
          homeTeamName: homeTeam.full_name || homeTeam.name,
          awayTeamName: awayTeam.full_name || awayTeam.name,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          homeConferenceId: homeTeam.conference_id,
          awayConferenceId: awayTeam.conference_id,
          gpMap,
          homeTeamFourFactors,
          awayTeamFourFactors
        };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNcaabRosterDepth error:', e.message);
      return { home: [], away: [] };
    }
  },

  /**
   * Get NFL roster depth for two teams - top players by position with stats
   * Uses team roster endpoint (depth chart)
   * @param {string} homeTeamName - Home team name
   * @param {string} awayTeamName - Away team name
   * @param {number} season - Season year (e.g., 2025)
   * @returns {Promise<Object>} - { home: [...], away: [...] }
   */
  async getNflRosterDepth(homeTeamName, awayTeamName, season, ttlMinutes = 30) {
    try {
      console.log(`🏈 [Ball Don't Lie] Fetching NFL roster depth for ${awayTeamName} @ ${homeTeamName} (${season} season)`);
      
      // Get team IDs first (NFL teams)
      const [homeTeam, awayTeam] = await Promise.all([
        this.getTeamByNameGeneric('americanfootball_nfl', homeTeamName),
        this.getTeamByNameGeneric('americanfootball_nfl', awayTeamName)
      ]);
      
      if (!homeTeam?.id || !awayTeam?.id) {
        console.warn(`[Ball Don't Lie] Could not find NFL team IDs for ${homeTeamName} or ${awayTeamName}`);
        return { home: [], away: [] };
      }
      
      console.log(`🏈 [Ball Don't Lie] Team IDs: ${homeTeam.full_name} (${homeTeam.id}) vs ${awayTeam.full_name} (${awayTeam.id})`);
      
      const cacheKey = `nfl_roster_depth_${homeTeam.id}_${awayTeam.id}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Fetch team rosters (depth charts)
        console.log(`🏈 [Ball Don't Lie] Fetching NFL team rosters...`);
        
        const fetchRoster = async (teamId) => {
          try {
            const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/teams/${teamId}/roster?season=${season}`;
            const resp = await axios.get(url, { headers: { 'Authorization': API_KEY } });
            return resp.data?.data || [];
          } catch (e) {
            console.warn(`[Ball Don't Lie] Could not fetch roster for team ${teamId}:`, e.message);
            return [];
          }
        };
        
        const [homeRoster, awayRoster] = await Promise.all([
          fetchRoster(homeTeam.id),
          fetchRoster(awayTeam.id)
        ]);
        
        // Format player from depth chart
        const formatPlayer = (entry) => {
          const player = entry.player || {};
          return {
            id: player.id,
            name: `${player.first_name} ${player.last_name}`,
            position: entry.position || player.position_abbreviation || '?',
            depth: entry.depth || 1,
            jersey: player.jersey_number || '?',
            college: player.college || '',
            experience: player.experience || '',
            injuryStatus: entry.injury_status || null
          };
        };
        
        // Get key skill position players (depth 1-2 only for QB, RB, WR, TE)
        const keyPositions = ['QB', 'RB', 'WR', 'TE'];
        const filterKeyPlayers = (roster) => {
          return roster
            .filter(entry => keyPositions.includes(entry.position) && entry.depth <= 2)
            .map(formatPlayer)
            .sort((a, b) => {
              // Sort by position order, then depth
              const posOrder = { QB: 1, RB: 2, WR: 3, TE: 4 };
              if (posOrder[a.position] !== posOrder[b.position]) {
                return (posOrder[a.position] || 99) - (posOrder[b.position] || 99);
              }
              return a.depth - b.depth;
            })
            .slice(0, 12); // Top 12 skill players
        };
        
        const homeKeyPlayers = filterKeyPlayers(homeRoster);
        const awayKeyPlayers = filterKeyPlayers(awayRoster);
        
        console.log(`🏈 [Ball Don't Lie] NFL roster depth ready: ${homeTeam.full_name} (${homeKeyPlayers.length} key players), ${awayTeam.full_name} (${awayKeyPlayers.length} key players)`);
        
        return {
          home: homeKeyPlayers,
          away: awayKeyPlayers,
          homeTeamName: homeTeam.full_name,
          awayTeamName: awayTeam.full_name
        };
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNflRosterDepth error:', e.message);
      return { home: [], away: [] };
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
      console.error('[Ball Don\'t Lie] nba getNbaPlayerSeasonStatsForProps error:', e.message);
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
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
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
  async getNflPlayerGameLogsBatch(playerIds, season = null, numGames = 5, ttlMinutes = 15) {
    // Calculate dynamic NFL season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!Array.isArray(playerIds) || playerIds.length === 0) return {};
      
      const results = {};
      
      // Fetch game logs for each player in parallel (batch of 5 at a time to avoid rate limits)
      const batchSize = 5;
      for (let i = 0; i < playerIds.length; i += batchSize) {
        const batch = playerIds.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (playerId) => {
          const cacheKey = `nfl_player_game_logs_${playerId}_${season}_${numGames}`;
          
          try {
            const logs = await getCachedOrFetch(cacheKey, async () => {
              // Fetch player's game stats using the stats endpoint
              // NOTE: BDL NFL stats API requires "seasons[]" (array format), not "season"
              // CRITICAL FIX: Must fetch ALL season games (25+) because BDL API returns oldest-first
              // by default. Only then can we sort and get the ACTUAL most recent 5 games.
              const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/stats${buildQuery({
                player_ids: [playerId],
                seasons: [season], // CRITICAL: Must use seasons[] array format per BDL docs
                per_page: 25 // Fetch full season (17 regular + some extra) to ensure we get ALL games
              })}`;
              
              const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
              // CRITICAL: BDL returns stats oldest-first, so we MUST sort by date DESCENDING
              // to get the actual most recent games (Dec games, not Sept games)
              const allStats = (response.data?.data || [])
                .filter(g => g.game?.date) // Ensure valid date
                .sort((a, b) => new Date(b.game.date) - new Date(a.game.date));
              const gameStats = allStats.slice(0, numGames);
              
              if (gameStats.length === 0) return null;
              
              // Calculate averages and consistency
              const gp = gameStats.length;
              const totals = {
                pass_yds: 0, pass_tds: 0, pass_att: 0, pass_comp: 0, ints: 0,
                rush_yds: 0, rush_att: 0, rush_tds: 0,
                rec_yds: 0, receptions: 0, targets: 0, rec_tds: 0
              };
              
              const gameByGame = gameStats.map(g => {
                const stats = {
                  gameId: g.game?.id,
                  date: g.game?.date || g.game?.datetime,
                  opponent: g.game?.home_team?.id === g.player?.team?.id 
                    ? g.game?.visitor_team?.abbreviation 
                    : g.game?.home_team?.abbreviation,
                  isHome: g.game?.home_team?.id === g.player?.team?.id,
                  pass_yds: g.passing_yards || 0,
                  pass_tds: g.passing_touchdowns || 0,
                  pass_att: g.passing_attempts || 0,
                  pass_comp: g.passing_completions || 0,
                  ints: g.passing_interceptions || 0,
                  rush_yds: g.rushing_yards || 0,
                  rush_att: g.rushing_attempts || 0,
                  rush_tds: g.rushing_touchdowns || 0,
                  rec_yds: g.receiving_yards || 0,
                  receptions: g.receptions || 0,
                  targets: g.receiving_targets || 0,
                  rec_tds: g.receiving_touchdowns || 0
                };
                
                // Accumulate totals
                Object.keys(totals).forEach(k => { totals[k] += stats[k]; });
                
                return stats;
              });
              
              // Calculate averages
              const averages = {};
              Object.keys(totals).forEach(k => {
                averages[k] = gp > 0 ? (totals[k] / gp).toFixed(1) : '0.0';
              });
              
              // Calculate consistency (coefficient of variation - lower = more consistent)
              // For key stats: pass_yds, rush_yds, rec_yds, receptions
              const calcConsistency = (statKey) => {
                const values = gameByGame.map(g => g[statKey]);
                const mean = values.reduce((a, b) => a + b, 0) / values.length;
                if (mean === 0) return 1.0;
                const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
                const stdDev = Math.sqrt(variance);
                // Convert CV to consistency score (1 - normalized CV, capped at 0-1)
                const cv = stdDev / mean;
                return Math.max(0, Math.min(1, 1 - cv)).toFixed(2);
              };
              
              const consistency = {
                pass_yds: calcConsistency('pass_yds'),
                rush_yds: calcConsistency('rush_yds'),
                rec_yds: calcConsistency('rec_yds'),
                receptions: calcConsistency('receptions')
              };
              
              // Home/Away splits
              const homeGames = gameByGame.filter(g => g.isHome);
              const awayGames = gameByGame.filter(g => !g.isHome);
              
              const calcSplitAvg = (games, statKey) => {
                if (games.length === 0) return 'N/A';
                return (games.reduce((sum, g) => sum + g[statKey], 0) / games.length).toFixed(1);
              };
              
              const splits = {
                home: {
                  games: homeGames.length,
                  pass_yds: calcSplitAvg(homeGames, 'pass_yds'),
                  rush_yds: calcSplitAvg(homeGames, 'rush_yds'),
                  rec_yds: calcSplitAvg(homeGames, 'rec_yds'),
                  receptions: calcSplitAvg(homeGames, 'receptions')
                },
                away: {
                  games: awayGames.length,
                  pass_yds: calcSplitAvg(awayGames, 'pass_yds'),
                  rush_yds: calcSplitAvg(awayGames, 'rush_yds'),
                  rec_yds: calcSplitAvg(awayGames, 'rec_yds'),
                  receptions: calcSplitAvg(awayGames, 'receptions')
                }
              };
              
              // TARGET SHARE TRENDING - Detect usage spikes for WR/TE/RB
              // Compare L2 targets vs L5 average
              let targetTrend = null;
              const targetValues = gameByGame.map(g => g.targets || 0);
              if (targetValues.some(t => t > 0)) {
                const l5TargetsAvg = targetValues.reduce((a, b) => a + b, 0) / gp;
                const l2TargetsAvg = gp >= 2 
                  ? targetValues.slice(0, 2).reduce((a, b) => a + b, 0) / 2 
                  : l5TargetsAvg;
                const l3TargetsAvg = gp >= 3
                  ? targetValues.slice(0, 3).reduce((a, b) => a + b, 0) / 3
                  : l5TargetsAvg;
                
                // Calculate target share trend
                const targetChange = l5TargetsAvg > 0 
                  ? ((l2TargetsAvg - l5TargetsAvg) / l5TargetsAvg * 100).toFixed(0) 
                  : 0;
                
                // Detect spike (L2 avg > L5 avg by 20%+)
                const isSpike = parseFloat(targetChange) >= 20;
                const isDeclining = parseFloat(targetChange) <= -20;
                
                targetTrend = {
                  l5Avg: l5TargetsAvg.toFixed(1),
                  l3Avg: l3TargetsAvg.toFixed(1),
                  l2Avg: l2TargetsAvg.toFixed(1),
                  lastGame: targetValues[0],
                  change: targetChange,
                  trend: isSpike ? 'SPIKE' : isDeclining ? 'DECLINING' : 'STABLE',
                  gameByGame: targetValues.slice(0, 5)
                };
              }
              
              // USAGE TRACKING - Proxy for snap counts using touches + targets
              // Higher total touches = more involvement = likely more snaps
              let usageTrend = null;
              const usageValues = gameByGame.map(g => 
                (g.targets || 0) + (g.rush_att || 0) + (g.receptions || 0)
              );
              if (usageValues.some(u => u > 0)) {
                const l5UsageAvg = usageValues.reduce((a, b) => a + b, 0) / gp;
                const l2UsageAvg = gp >= 2 
                  ? usageValues.slice(0, 2).reduce((a, b) => a + b, 0) / 2 
                  : l5UsageAvg;
                
                const usageChange = l5UsageAvg > 0 
                  ? ((l2UsageAvg - l5UsageAvg) / l5UsageAvg * 100).toFixed(0) 
                  : 0;
                
                // Categorize usage level
                let usageLevel = 'LOW';
                if (l5UsageAvg >= 15) usageLevel = 'ELITE';
                else if (l5UsageAvg >= 10) usageLevel = 'HIGH';
                else if (l5UsageAvg >= 5) usageLevel = 'MODERATE';
                
                usageTrend = {
                  l5Avg: l5UsageAvg.toFixed(1),
                  l2Avg: l2UsageAvg.toFixed(1),
                  lastGame: usageValues[0],
                  change: usageChange,
                  level: usageLevel,
                  trend: parseFloat(usageChange) >= 15 ? 'INCREASING' : 
                         parseFloat(usageChange) <= -15 ? 'DECREASING' : 'STABLE',
                  gameByGame: usageValues.slice(0, 5)
                };
              }
              
              return {
                gamesAnalyzed: gp,
                games: gameByGame,
                averages,
                consistency,
                splits,
                targetTrend, // NEW: Target share trending
                usageTrend,  // NEW: Usage/touch tracking (snap count proxy)
                lastGame: gameByGame[0] || null
              };
            }, ttlMinutes);
            
            if (logs) results[playerId] = logs;
          } catch (e) {
            console.warn(`[Ball Don't Lie] NFL game logs fetch failed for player ${playerId}:`, e.message);
          }
        }));
      }
      
      console.log(`[Ball Don't Lie] NFL game logs: fetched for ${Object.keys(results).length}/${playerIds.length} players`);
      return results;
    } catch (e) {
      console.error('[Ball Don\'t Lie] nfl getNflPlayerGameLogsBatch error:', e.message);
      return {};
    }
  },

  /**
   * Get the starting QB from team roster/depth chart (PREFERRED METHOD)
   * Uses BDL's /teams/<ID>/roster endpoint which has depth chart positions
   * depth=1 is the starter, depth=2 is backup, etc.
   * Also checks injury_status to automatically promote backup if starter is out
   * 
   * @param {number} teamId - BDL team ID
   * @param {number} season - Season year (calculated dynamically if not provided)
   * @param {string} sportKey - Sport key ('americanfootball_nfl' or 'americanfootball_ncaaf')
   * @returns {Object|null} - { id, name, firstName, lastName, team, depth, injuryStatus, isBackup }
   */
  async getStartingQBFromDepthChart(teamId, season = null, sportKey = 'americanfootball_nfl') {
    // Calculate dynamic NFL/NCAAF season: Aug-Feb spans years
    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month <= 7 ? year - 1 : year;
    }
    try {
      if (!teamId) return null;
      
      // Get the team roster with depth chart - use correct roster function for sport
      const isNCAAF = sportKey === 'americanfootball_ncaaf' || sportKey === 'NCAAF';
      let roster;
      if (isNCAAF) {
        // NCAAF uses getNcaafTeamPlayers (BDL doesn't have depth chart for NCAAF)
        roster = await this.getNcaafTeamPlayers(teamId);
      } else {
        // NFL has proper depth chart roster
        roster = await this.getNflTeamRoster(teamId, season);
      }
      if (!roster || roster.length === 0) {
        console.warn(`[Ball Don't Lie] No roster data for team ${teamId}`);
        return null;
      }
      
      // Filter to QBs only
      const qbs = roster.filter(entry => 
        entry.position === 'QB' || 
        entry.player?.position_abbreviation === 'QB' ||
        entry.player?.position === 'Quarterback'
      );
      
      if (qbs.length === 0) {
        console.warn(`[Ball Don't Lie] No QBs found in roster for team ${teamId}`);
        return null;
      }
      
      // Sort by depth (1 = starter, 2 = backup, 3 = 3rd string, etc.)
      qbs.sort((a, b) => (a.depth || 99) - (b.depth || 99));
      
      // Injury statuses that mean the player is OUT
      // BDL uses single-letter codes: "O" = Out, "D" = Doubtful, "Q" = Questionable, "IR" = Injured Reserve
      const isOut = (status) => {
        if (!status) return false;
        const s = status.toLowerCase().trim();
        // Single letter codes
        if (s === 'o' || s === 'd' || s === 'ir') return true;
        // Full word matches
        return s.includes('out') || s.includes('ir') || s.includes('injured reserve') || 
               s.includes('doubtful') || s.includes('pup');
      };
      
      // Find the first HEALTHY QB in the depth chart
      // Iterate through depth=1, depth=2, depth=3, etc. until we find one not injured
      let selectedQB = null;
      let isBackupStarting = false;
      const injuredQBs = [];
      
      for (const qb of qbs) {
        const qbName = `${qb.player?.first_name} ${qb.player?.last_name}`;
        
        if (isOut(qb.injury_status)) {
          injuredQBs.push({ name: qbName, status: qb.injury_status, depth: qb.depth });
          console.log(`[Ball Don't Lie] ⚠️ Depth ${qb.depth} QB ${qbName} is ${qb.injury_status} - checking next`);
          continue;
        }
        
        // Found a healthy (or at least not OUT) QB
        selectedQB = qb;
        isBackupStarting = qb.depth > 1;
        
        if (isBackupStarting) {
          const depthLabel = qb.depth === 2 ? 'Backup' : `${qb.depth}${qb.depth === 3 ? 'rd' : 'th'} String`;
          console.log(`[Ball Don't Lie] ✓ Using ${depthLabel} QB: ${qbName} (depth=${qb.depth})`);
        }
        break;
      }
      
      // If no healthy QB found, log all injured and use the top of depth chart anyway
      if (!selectedQB) {
        console.log(`[Ball Don't Lie] ⚠️ All QBs appear injured:`, injuredQBs.map(q => `${q.name} (${q.status})`).join(', '));
        selectedQB = qbs[0]; // Use depth=1 even if injured
        console.log(`[Ball Don't Lie] ⚠️ Using depth=1 ${selectedQB?.player?.first_name} ${selectedQB?.player?.last_name} despite injury`);
      }
      
      if (!selectedQB) {
        console.warn(`[Ball Don't Lie] Could not determine starting QB for team ${teamId}`);
        return null;
      }
      
      const player = selectedQB.player;
      const result = {
        id: player?.id,
        firstName: player?.first_name,
        lastName: player?.last_name,
        name: `${player?.first_name} ${player?.last_name}`,
        position: player?.position || 'Quarterback',
        positionAbbr: player?.position_abbreviation || 'QB',
        team: player?.team?.full_name || player?.team?.name,
        teamAbbr: player?.team?.abbreviation,
        teamId: teamId,
        jerseyNumber: player?.jersey_number,
        college: player?.college,
        experience: player?.experience,
        age: player?.age,
        depth: selectedQB.depth,
        injuryStatus: selectedQB.injury_status,
        isBackup: isBackupStarting,
        // Note: Depth chart doesn't have stats - need to fetch separately
        passingYards: null,
        passingTds: null,
        gamesPlayed: null
      };
      
      const statusLabel = isBackupStarting ? 'BACKUP Starting QB' : 'Starting QB';
      const injuryNote = selectedQB.injury_status ? ` (${selectedQB.injury_status})` : '';
      console.log(`[Ball Don't Lie] ${statusLabel} from depth chart for team ${teamId}: ${result.name}${injuryNote}`);
      
      return result;
    } catch (e) {
      console.error(`[Ball Don't Lie] getStartingQBFromDepthChart error for team ${teamId}:`, e.message);
      return null;
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
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
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

        const response = await axios.get(url, {
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
      console.error('[Ball Don\'t Lie] getNcaabPlayerGameLogs error:', e.message);
      return null;
    }
  },

  /**
   * NCAAF player season stats (single season, optional player filter)
   */
  async getNcaafPlayerSeasonStats({ playerIds, playerId, teamIds, teamId, season } = {}, ttlMinutes = 10) {
    try {
      if (!season) return [];
      const pidArr = playerIds || (playerId ? [playerId] : undefined);
      const tidArr = teamIds || (teamId ? [teamId] : undefined);
      if ((!pidArr || pidArr.length === 0) && (!tidArr || tidArr.length === 0)) {
        return [];
      }
      const cacheKey = `ncaaf_player_season_stats_${(pidArr || []).join('-')}_${(tidArr || []).join('-')}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const query = { season, per_page: 100 };
        if (Array.isArray(pidArr) && pidArr.length) {
          query['player_ids[]'] = pidArr.slice(0, 100);
        }
        if (Array.isArray(tidArr) && tidArr.length) {
          query['team_ids[]'] = tidArr.slice(0, 100);
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/player_season_stats${buildQuery(query)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error('[Ball Don\'t Lie] ncaaf getNcaafPlayerSeasonStats error:', e.message);
      return [];
    }
  },

  /**
   * Generic helpers (multi-sport)
   */
  async getTeams(sportKey, params = {}) {
    try {
      const cacheKey = `${sportKey}_teams_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        // Prefer SDK if available
        if (sport?.getTeams) {
          const resp = await sport.getTeams(params);
          return resp?.data || [];
        }
        // Fallback to direct HTTP for sports where SDK lacks getTeams
        const endpointMap = {
          americanfootball_ncaaf: 'ncaaf/v1/teams',
          basketball_ncaab: 'ncaab/v1/teams',
          icehockey_nhl: 'nhl/v1/teams',
          americanfootball_nfl: 'nfl/v1/teams',
          baseball_mlb: 'mlb/v1/teams'
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getTeams not supported');

        const qs = Object.keys(params).length > 0 ? buildQuery(params) : '';
        const url = `https://api.balldontlie.io/${path}${qs}`;
        const resp = await fetch(url, {
          headers: { Authorization: API_KEY }
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, 60);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeams error:`, e.message);
      return [];
    }
  },

  async getTeamByNameGeneric(sportKey, nameOrId) {
    try {
      if (nameOrId == null || nameOrId === '') return null;
      const nameStr = String(nameOrId).toLowerCase();
      const idNum = !isNaN(Number(nameStr)) ? Number(nameStr) : null;
      let teams = await this.getTeams(sportKey);
      // HTTP fallback if SDK path empty
      if (!Array.isArray(teams) || teams.length === 0) {
        const endpointMap = {
          americanfootball_ncaaf: 'ncaaf/v1/teams',
          basketball_ncaab: 'ncaab/v1/teams',
          icehockey_nhl: 'nhl/v1/teams',
          americanfootball_nfl: 'nfl/v1/teams',
          basketball_nba: 'nba/v1/teams',
          baseball_mlb: 'mlb/v1/teams'
        };
        const path = endpointMap[sportKey];
        if (path) {
          const url = `https://api.balldontlie.io/${path}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          if (resp.ok) {
            const json = await resp.json().catch(() => ({}));
            teams = Array.isArray(json?.data) ? json.data : [];
          }
        }
      }
      if (!Array.isArray(teams) || teams.length === 0) return null;
      if (idNum !== null) {
        const byId = teams.find(t => t.id === idNum);
        if (byId) return byId;
      }
      // Enhanced matching across common fields + normalization
      const target = normalizeName(nameOrId);
      const exact = teams.find(t => {
        const fields = [
          t.name,
          t.full_name,
          t.abbreviation,
          t.city,
          t.college
        ].filter(Boolean).map(normalizeName);
        return fields.includes(target);
      });
      if (exact) return exact;
      const partial = teams.find(t => {
        const fields = [
          t.name,
          t.full_name,
          t.abbreviation,
          t.city,
          t.college
        ].filter(Boolean).map(normalizeName);
        return fields.some(f => f.includes(target) || target.includes(f));
      });
      return partial || null;
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getTeamByName error:`, e.message);
      return null;
    }
  },

  async getPlayerStats(sportKey, params = {}, ttlMinutes = 10) {
    try {
      const cacheKey = `${sportKey}_player_stats_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        const fn = sport?.getPlayerStats || sport?.getStats;
        if (fn) {
          const resp = await fn.call(sport, params);
          return resp?.data || [];
        }
        // HTTP fallback for sports with documented player_stats endpoints
        // NOTE: NHL uses /nhl/v1/player_stats/leaders for player stat leaders (goals, assists, save_pct, etc.)
        const endpointMap = {
          basketball_nba: 'nba/v1/stats', // ⭐ FIX: Use correct endpoint per BDL docs
          basketball_ncaab: 'ncaab/v1/player_stats',
          americanfootball_nfl: 'nfl/v1/stats',
          americanfootball_ncaaf: 'ncaaf/v1/player_stats',
          icehockey_nhl: 'nhl/v1/player_stats/leaders' // NHL uses leaders endpoint with type param
        };
        const path = endpointMap[sportKey];
        if (!path) {
          throw new Error('player stats not supported for this sport');
        }
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}${buildQuery(params)}`;
        const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
        // ⭐ FIX: Always return data array, not object with data/meta
        return response.data?.data || [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getPlayerStats error:`, e.message);
      return [];
    }
  },

  /**
   * Get team by name, abbreviation, or ID
   * @param {string|number} nameOrId - Team name, abbreviation, or ID
   * @returns {Promise<Object>} - Team details or null if not found
   */
  async getTeamByName(nameOrId) {
    try {
      // Validate input - prevent toString() errors
      if (nameOrId == null || nameOrId === '') {
        console.warn('getTeamByName: Invalid input provided (null/undefined/empty)');
        return null;
      }
      
      // Convert input to string for consistency
      const nameOrIdStr = String(nameOrId).toLowerCase();
      const idNum = typeof nameOrId === 'number' ? nameOrId : (!isNaN(Number(nameOrIdStr)) ? Number(nameOrIdStr) : null);
      
      // Use different cache keys based on input type
      const cacheKey = idNum !== null ? `team_by_id_${idNum}` : `team_by_name_${nameOrIdStr}`;
      
      return getCachedOrFetch(cacheKey, async () => {
        // Always get full teams list - the API doesn't have a getTeamById method
        const client = initApi();
        const response = await client.nba.getTeams();
        const teams = response.data || [];
        
        // If we have a numeric ID, search by ID first
        if (idNum !== null) {
          const teamById = teams.find(team => team.id === idNum);
          if (teamById) return teamById;
        }
        
        // If no numeric ID or team not found by ID, try string matching
        if (typeof nameOrId === 'string' || !idNum) {
          // Try to find by exact name or abbreviation
          const team = teams.find(
            team => 
              team.name.toLowerCase() === nameOrIdStr || 
              team.full_name.toLowerCase() === nameOrIdStr ||
              team.abbreviation.toLowerCase() === nameOrIdStr
          );
          
          if (team) return team;
          
          // Try to find by partial name match
          const partialMatch = teams.find(
            team => 
              team.name.toLowerCase().includes(nameOrIdStr) || 
              team.full_name.toLowerCase().includes(nameOrIdStr) ||
              team.abbreviation.toLowerCase().includes(nameOrIdStr)
          );
          
          if (partialMatch) return partialMatch;
        }
        
        // If no match found, return null
        return null;
      });
    } catch (error) {
      console.error(`Error getting team by name/id ${nameOrId}:`, error);
      return null;
    }
  },

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
        
        const response = await axios.get(url, { 
          headers: { 'Authorization': API_KEY } 
        });
        
        const props = response.data?.data || [];
        console.log(`[Ball Don't Lie] Retrieved ${props.length} NHL player props for game ${gameId}`);
        return props;
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
      const status = error?.response?.status;
      const msg = error?.response?.data?.error || error.message;
      console.error(`[Ball Don't Lie] NHL player props error: ${status} - ${msg}`);
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
        
        const response = await axios.get(url, { 
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
      console.error(`[Ball Don't Lie] NHL players error:`, error?.response?.data || error.message);
      return {};
    }
  },

  /**
   * Get NHL player season stats for a specific player
   * Endpoint: GET /nhl/v1/players/:id/season_stats?season=YYYY
   * Returns: goals, assists, points, shots, time_on_ice_per_game, power_play_points, etc.
   * @param {number} playerId - BDL player ID
   * @param {number} season - Season year (e.g., 2024 for 2024-25 season)
   * @returns {Promise<Object>} - Player season stats as key-value object
   */
  async getNhlPlayerSeasonStats(playerId, season) {
    try {
      if (!playerId || !season) {
        console.warn('[Ball Don\'t Lie] NHL player season stats requires playerId and season');
        return null;
      }

      const cacheKey = `nhl_player_season_stats_${playerId}_${season}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/players/${playerId}/season_stats?season=${season}`;
        console.log(`[Ball Don't Lie] Fetching NHL player season stats: ${url}`);

        const response = await axios.get(url, {
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
   * Batch fetch NHL player season stats for multiple players
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} season - Season year
   * @returns {Promise<Object>} - Map of playerId to season stats
   */
  async getNhlPlayersSeasonStatsBatch(playerIds, season) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 25); // Limit to 25 players
      console.log(`[Ball Don't Lie] Batch fetching NHL season stats for ${uniqueIds.length} players`);

      // Fetch in parallel with rate limiting
      const results = {};
      const batchSize = 5; // Fetch 5 at a time to avoid rate limits
      
      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => this.getNhlPlayerSeasonStats(id, season).catch(() => null))
        );
        
        batch.forEach((id, idx) => {
          if (batchResults[idx]) {
            results[id] = batchResults[idx];
          }
        });

        // Small delay between batches to avoid rate limits
        if (i + batchSize < uniqueIds.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log(`[Ball Don't Lie] Retrieved season stats for ${Object.keys(results).length}/${uniqueIds.length} NHL players`);
      return results;
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL batch season stats error:`, error.message);
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
          const response = await axios.get(url, {
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
              const statsResp = await axios.get(statsUrl, {
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
      console.error(`[Ball Don't Lie] NHL team goalies error:`, error?.response?.data || error.message);
      return {};
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
      console.error(`[Ball Don't Lie] NHL player stats leaders error:`, error.message);
      return {};
    }
  },

  /**
   * Get NBA player game logs with enhanced stats for prop analysis
   * Includes: individual game stats, consistency metrics, hit rates, home/away splits
   * @param {number} playerId - Player ID
   * @param {number} numGames - Number of recent games (default 10)
   * @param {Object} propLines - Optional prop lines to calculate hit rates { points: 24.5, rebounds: 8.5 }
   * @returns {Promise<Object>} - Enhanced game log data
   */
  async getNbaPlayerGameLogs(playerId, numGames = 10, propLines = {}) {
    try {
      if (!playerId) return null;

      const cacheKey = `nba_game_logs_${playerId}_${numGames}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Get stats for last 30 days to ensure we capture enough games
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        const url = `${BALLDONTLIE_API_BASE_URL}/nba/v1/stats${buildQuery({
          player_ids: [playerId],
          start_date: startDate.toISOString().slice(0, 10),
          end_date: endDate.toISOString().slice(0, 10),
          per_page: 25
        })}`;

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const allStats = response.data?.data || [];
        if (allStats.length === 0) return null;

        // Sort by date (most recent first) and take last N
        const games = allStats
          .filter(g => g.min && parseInt(g.min) > 0) // Only games where player played
          .sort((a, b) => new Date(b.game?.date) - new Date(a.game?.date))
          .slice(0, numGames);

        if (games.length === 0) return null;

        // Extract individual game stats
        const gameStats = games.map(g => ({
          date: g.game?.date,
          opponent: g.game?.home_team?.id === g.team?.id 
            ? g.game?.visitor_team?.abbreviation 
            : g.game?.home_team?.abbreviation,
          isHome: g.game?.home_team?.id === g.team?.id,
          pts: g.pts || 0,
          reb: g.reb || 0,
          ast: g.ast || 0,
          stl: g.stl || 0,
          blk: g.blk || 0,
          fg3m: g.fg3m || 0,
          min: parseInt(g.min) || 0,
          pra: (g.pts || 0) + (g.reb || 0) + (g.ast || 0)
        }));

        // Calculate averages
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
        const gp = gameStats.length;
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

        // Calculate standard deviations for consistency
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

        // Calculate consistency scores (1 - CV, where CV = stdDev/mean)
        const consistency = {
          pts: avgs.pts > 0 ? Math.max(0, 1 - (stdDevs.pts / avgs.pts)).toFixed(2) : '0.00',
          reb: avgs.reb > 0 ? Math.max(0, 1 - (stdDevs.reb / avgs.reb)).toFixed(2) : '0.00',
          ast: avgs.ast > 0 ? Math.max(0, 1 - (stdDevs.ast / avgs.ast)).toFixed(2) : '0.00',
          fg3m: avgs.fg3m > 0 ? Math.max(0, 1 - (stdDevs.fg3m / avgs.fg3m)).toFixed(2) : '0.00',
          pra: avgs.pra > 0 ? Math.max(0, 1 - (stdDevs.pra / avgs.pra)).toFixed(2) : '0.00'
        };

        // Calculate home/away splits
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

        // Calculate hit rates for prop lines if provided
        const hitRates = {};
        if (propLines.points !== undefined) {
          const hits = gameStats.filter(g => g.pts > propLines.points).length;
          hitRates.points = { line: propLines.points, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.rebounds !== undefined) {
          const hits = gameStats.filter(g => g.reb > propLines.rebounds).length;
          hitRates.rebounds = { line: propLines.rebounds, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.assists !== undefined) {
          const hits = gameStats.filter(g => g.ast > propLines.assists).length;
          hitRates.assists = { line: propLines.assists, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.threes !== undefined) {
          const hits = gameStats.filter(g => g.fg3m > propLines.threes).length;
          hitRates.threes = { line: propLines.threes, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }
        if (propLines.pra !== undefined) {
          const hits = gameStats.filter(g => g.pra > propLines.pra).length;
          hitRates.pra = { line: propLines.pra, hits, total: gp, rate: (hits / gp * 100).toFixed(0) + '%' };
        }

        console.log(`[Ball Don't Lie] Got ${gp} NBA game logs for player ${playerId}`);

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
          hitRates,
          lastGame: gameStats[0] || null
        };
      }, 15); // Cache for 15 minutes
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaPlayerGameLogs error:', e.message);
      return null;
    }
  },

  /**
   * Batch fetch NBA game logs for multiple players
   * @param {Array<number>} playerIds - Array of player IDs
   * @param {number} numGames - Number of recent games per player
   * @returns {Promise<Object>} - Map of playerId to game logs
   */
  async getNbaPlayerGameLogsBatch(playerIds, numGames = 10) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 20); // Limit to 20 players
      console.log(`[Ball Don't Lie] Batch fetching NBA game logs for ${uniqueIds.length} players`);

      const results = {};
      const failures = [];
      const batchSize = 5;

      // Helper to fetch with retry on rate limit
      const fetchWithRetry = async (id, maxRetries = 2) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await this.getNbaPlayerGameLogs(id, numGames);
          } catch (e) {
            const isRateLimit = e?.response?.status === 429;
            if (isRateLimit && attempt < maxRetries) {
              console.warn(`[Ball Don't Lie] Rate limited on player ${id}, retrying in 2s...`);
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
            throw e;
          }
        }
        return null;
      };

      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => fetchWithRetry(id).catch(e => {
            failures.push({ id, error: e.message });
            return null;
          }))
        );

        batch.forEach((id, idx) => {
          if (batchResults[idx]) {
            results[id] = batchResults[idx];
          }
        });

        if (i + batchSize < uniqueIds.length) {
          await new Promise(resolve => setTimeout(resolve, 150)); // Slightly longer delay
        }
      }

      const successCount = Object.keys(results).length;
      console.log(`[Ball Don't Lie] Retrieved game logs for ${successCount}/${uniqueIds.length} NBA players`);
      if (failures.length > 0) {
        console.warn(`[Ball Don't Lie] Failed to get logs for ${failures.length} players`);
      }
      return results;
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNbaPlayerGameLogsBatch error:', e.message);
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
      console.error('[Ball Don\'t Lie] getNhlPlayerGameLogs error:', e.message);
      return null;
    }
  },

  /**
   * Batch fetch NHL game logs for multiple players
   * @param {Array<number>} playerIds - Array of player IDs  
   * @param {number} numGames - Number of recent games per player
   * @returns {Promise<Object>} - Map of playerId to game logs
   */
  async getNhlPlayerGameLogsBatch(playerIds, numGames = 10) {
    try {
      if (!playerIds || playerIds.length === 0) return {};

      const uniqueIds = [...new Set(playerIds)].slice(0, 20);
      console.log(`[Ball Don't Lie] Batch fetching NHL game logs for ${uniqueIds.length} players`);

      const results = {};
      const failures = [];
      const batchSize = 5;

      // Helper to fetch with retry on rate limit
      const fetchWithRetry = async (id, maxRetries = 2) => {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await this.getNhlPlayerGameLogs(id, numGames);
          } catch (e) {
            const isRateLimit = e?.response?.status === 429;
            if (isRateLimit && attempt < maxRetries) {
              console.warn(`[Ball Don't Lie] Rate limited on player ${id}, retrying in 2s...`);
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
            throw e;
          }
        }
        return null;
      };

      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(id => fetchWithRetry(id).catch(e => {
            failures.push({ id, error: e.message });
            return null;
          }))
        );

        batch.forEach((id, idx) => {
          if (batchResults[idx]) {
            results[id] = batchResults[idx];
          }
        });

        if (i + batchSize < uniqueIds.length) {
          await new Promise(resolve => setTimeout(resolve, 150)); // Slightly longer delay
        }
      }

      const successCount = Object.keys(results).length;
      console.log(`[Ball Don't Lie] Retrieved game logs for ${successCount}/${uniqueIds.length} NHL players`);
      if (failures.length > 0) {
        console.warn(`[Ball Don't Lie] Failed to get logs for ${failures.length} players`);
      }
      return results;
    } catch (e) {
      console.error('[Ball Don\'t Lie] getNhlPlayerGameLogsBatch error:', e.message);
      return {};
    }
  },

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

        const response = await axios.get(url, {
          headers: { 'Authorization': API_KEY }
        });

        const props = response.data?.data || [];
        console.log(`[Ball Don't Lie] Retrieved ${props.length} NFL player props for game ${gameId}`);
        return props;
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
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

        const response = await axios.get(url, {
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
      console.error(`[Ball Don't Lie] NFL players error:`, error?.response?.data || error.message);
      return {};
    }
  },

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

          const response = await axios.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const props = response.data?.data || [];
          allProps = allProps.concat(props);
          nextCursor = response.data?.meta?.next_cursor;
          pageCount++;
        } while (nextCursor && pageCount < maxPages);

        console.log(`[Ball Don't Lie] Retrieved ${allProps.length} NBA player props for game ${gameId} (${pageCount} page${pageCount > 1 ? 's' : ''})`);
        return allProps;
      }, 2); // Cache for 2 minutes since props are live
    } catch (error) {
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

        const response = await axios.get(url, {
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
      console.error(`[Ball Don't Lie] NBA players error:`, error?.response?.data || error.message);
      return {};
    }
  },
};
