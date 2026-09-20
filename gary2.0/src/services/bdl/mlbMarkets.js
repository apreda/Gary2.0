import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, buildQuery, bdlHttp, API_KEY } from './transport.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const mlbMarketsMethods = {

  // ═══════════════════════════════════════════════════════════════════════════
  // MLB ENDPOINTS (Ball Don't Lie GOAT Tier)
  // Games, Props, Season Stats, Splits, Player vs Player, Standings, Odds
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get MLB player props from BDL API (GOAT tier)
   * Supports: hits, home_runs, total_bases, rbis, stolen_bases, pitcher_strikeouts, etc.
   */
  async getMlbPlayerProps(gameId, options = {}) {
    try {
      if (!gameId) { console.warn('[BDL] MLB player props requires game_id'); return []; }
      const cacheKey = `mlb_player_props_${gameId}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const params = { game_id: gameId };
        if (options.player_id) params.player_id = options.player_id;
        if (options.prop_type) params.prop_type = options.prop_type;
        if (options.vendors) params.vendors = options.vendors;
        const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/odds/player_props${buildQuery(params)}`;
        console.log(`[BDL] Fetching MLB player props for game ${gameId}`);
        const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
        const props = response.data?.data || [];
        console.log(`[BDL] Retrieved ${props.length} MLB player props for game ${gameId}`);
        return props.map(row => ({ ...row, _gary_observed_at: new Date().toISOString() }));
      }, 2); // 2min cache — props are live
    } catch (error) {
      recordPickDataFailure('BDL:getMlbPlayerProps', error);
      console.error(`[BDL] MLB player props error: ${error?.response?.status} - ${error?.response?.data?.error || error.message}`);
      return [];
    }
  },

  /**
   * Tonight's 1st-inning runs market (the NRFI/YRFI number) from the full
   * markets catalog — key `runs_-_1st_inning`, line 0.5, DK first then FD.
   * Returns { overOdds, underOdds, vendor } or null. Cached 20 min.
   */
  async getMlbFirstInningRunsMarket(gameId) {
    if (!gameId) return null;
    const cacheKey = `mlb_first_inning_market_${gameId}`;
    return await getCachedOrFetch(cacheKey, async () => {
      for (const vendor of ['draftkings', 'fanduel']) {
        let cursor;
        for (let page = 0; page < 10; page++) {
          const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/odds/markets${buildQuery({ game_id: gameId, vendors: [vendor], per_page: 100, ...(cursor != null ? { cursor } : {}) })}`;
          const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
          const market = (response.data?.data || []).find(m => m.key === 'runs_-_1st_inning');
          if (market) {
            const at = (side) => (market.outcomes || []).find(o =>
              String(o.name).toLowerCase() === side && Number(o.line_value) === 0.5 && o.american_odds != null);
            const over = at('over');
            const under = at('under');
            if (over || under) {
              return { overOdds: over?.american_odds ?? null, underOdds: under?.american_odds ?? null, vendor };
            }
          }
          cursor = response.data?.meta?.next_cursor;
          if (cursor == null) break;
        }
      }
      return null;
    }, 20);
  },

  /**
   * Get MLB betting odds for specific games (GOAT tier)
   * Returns: ML, spread (run line), total from DK/FD/BetMGM/Fanatics
   */
  async getMlbGameOdds({ gameIds, dates } = {}, ttlMinutes = 5) {
    try {
      const params = {};
      if (gameIds?.length) params.game_ids = gameIds;
      if (dates?.length) params.dates = dates;
      if (!gameIds?.length && !dates?.length) return [];
      params.per_page = 100; // BDL defaults to 25 → a busy date paginates; pull every page
      const cacheKey = `mlb_odds_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const all = [];
        let cursor = null;
        let pages = 0;
        do {
          const url = `${BALLDONTLIE_API_BASE_URL}/mlb/v1/odds${buildQuery(cursor != null ? { ...params, cursor } : params)}`;
          console.log(`[BDL] Fetching MLB odds${cursor != null ? ` (page ${pages + 1})` : ''}`);
          const response = await bdlHttp.get(url, { headers: { 'Authorization': API_KEY } });
          all.push(...(response.data?.data || []));
          cursor = response.data?.meta?.next_cursor ?? null;
          pages += 1;
        } while (cursor != null && pages < 8);
        console.log(`[BDL] MLB odds: ${all.length} records (${pages} page${pages === 1 ? '' : 's'})`);
        return all;
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getMlbGameOdds', error);
      console.error(`[BDL] MLB odds error:`, error?.response?.data || error.message);
      return [];
    }
  },
};
