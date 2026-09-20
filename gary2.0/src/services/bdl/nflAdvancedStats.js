import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, bdlHttp, API_KEY } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const nflAdvancedStatsMethods = {

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
              const resp = await bdlHttp.get(endpoint, { headers: { Authorization: API_KEY }, params: httpParams });
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
            const resp = await bdlHttp.get(endpoint, { headers: { Authorization: API_KEY }, params });
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
            try { seasonAll = await sdkFetch({ season, ...(postseason ? { postseason } : {}) }); } catch (e) { console.warn('BDL season-all SDK fetch failed:', e?.message); }
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
      recordPickDataFailure('BDL:getNflAdvancedPassingStats', e);
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
            const resp = await bdlHttp.get(endpoint, { headers: { Authorization: API_KEY }, params });
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
              const resp = await bdlHttp.get(endpoint, { headers: { Authorization: API_KEY }, params: httpParams });
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
            try { seasonAll = await sdkFetch({ season, ...(postseason ? { postseason } : {}) }); } catch (e) { console.warn('BDL season-all SDK fetch failed:', e?.message); }
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
      recordPickDataFailure('BDL:getNflAdvancedRushingStats', e);
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
            const resp = await bdlHttp.get(endpoint, { headers: { Authorization: API_KEY }, params });
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
              const resp = await bdlHttp.get(endpoint, { headers: { Authorization: API_KEY }, params: httpParams });
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
            try { seasonAll = await sdkFetch({ season, ...(postseason ? { postseason } : {}) }); } catch (e) { console.warn('BDL season-all SDK fetch failed:', e?.message); }
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
      recordPickDataFailure('BDL:getNflAdvancedReceivingStats', e);
      if (e?.response?.status === 400) {
        console.warn('[Ball Don\'t Lie] nfl getNflAdvancedReceivingStats 400', e?.response?.data || '');
        return [];
      }
      console.error('[Ball Don\'t Lie] nfl getNflAdvancedReceivingStats error:', e.message);
      return [];
    }
  },
};
