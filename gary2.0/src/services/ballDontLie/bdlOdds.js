import { getCachedOrFetch, initApi, buildQuery, normalizeName, getCurrentNhlSeason, axios, BALLDONTLIE_API_BASE_URL, API_KEY } from './bdlCore.js';
import { decodeBdlRows } from '../bdlResponse.js';

export const oddsMethods = {
  /**
   * Odds endpoint helper
   * - NBA: primary at /v2/odds (V2 docs), fallback to /nba/v1/odds
   * - Other sports: use /{sport}/v1/odds
   * Accepts dates[] or game_ids[] (arrays)
   * Handles pagination automatically to ensure all odds rows are retrieved.
   */
  async getOddsV2(params = {}, sport = 'nba', ttlMinutes = 1) {
    try {
      // Normalize sport key (e.g. 'basketball_nba' -> 'nba')
      let sportKey = null;
      const s = String(sport).toLowerCase();
      if (s.includes('nfl')) sportKey = 'nfl';
      else if (s.includes('mlb')) sportKey = 'mlb';
      else if (s.includes('nhl')) sportKey = 'nhl';
      else if (s.includes('ncaaf')) sportKey = 'ncaaf';
      else if (s.includes('ncaab')) sportKey = 'ncaab';
      else if (s.includes('nba')) sportKey = 'nba';
      if (!sportKey) {
        throw new Error(`[Ball Don't Lie] getOddsV2: no odds endpoint mapped for sport "${sport}"`);
      }

      const norm = {};
      // Use plain keys 'dates' / 'game_ids'. 
      // Our buildQuery will append [] automatically for arrays.
      if (Array.isArray(params.dates) && params.dates.length) norm.dates = params.dates;
      if (Array.isArray(params.game_ids) && params.game_ids.length) norm.game_ids = params.game_ids;
      if (params.per_page) norm.per_page = params.per_page;
      if (params.cursor) norm.cursor = params.cursor;

      const cacheKey = `odds_${sportKey}_${JSON.stringify(norm)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        // Helper to fetch ALL pages if pagination is present
        const fetchAllPages = async (baseUrl, baseParams) => {
          const allRows = [];
          let nextCursor = baseParams.cursor || undefined;
          let pageCount = 0;
          const maxPages = 10; // Safety limit
          const seenCursors = new Set();

          for (;;) {
            const currentParams = { ...baseParams };
            if (nextCursor) currentParams.cursor = nextCursor;
            // Ensure we ask for max per page to minimize requests
            if (!currentParams.per_page) currentParams.per_page = 100;

            const qs = buildQuery(currentParams); 
            const fullUrl = `${baseUrl}${qs}`;
            
            console.log(`[Ball Don't Lie] GET ${fullUrl} (Page ${pageCount + 1})`);
            const resp = await axios.get(fullUrl, {
              headers: { Authorization: API_KEY }
            });

            allRows.push(...decodeBdlRows(resp?.data, `${sportKey} odds page ${pageCount + 1}`));
            const cursor = resp?.data?.meta?.next_cursor ?? null;
            pageCount += 1;
            if (cursor == null) return allRows;
            const cursorKey = String(cursor);
            if (seenCursors.has(cursorKey)) {
              throw new Error(`${sportKey} odds pagination repeated cursor ${cursorKey}`);
            }
            seenCursors.add(cursorKey);
            if (pageCount >= maxPages) {
              throw new Error(`${sportKey} odds pagination exceeded ${maxPages} pages`);
            }
            nextCursor = cursor;
          }
        };

        if (sportKey === 'nba') {
          try {
            const v2Url = `${BALLDONTLIE_API_BASE_URL}/v2/odds`;
            const data = await fetchAllPages(v2Url, norm);
            if (data && data.length) return data;
            console.log(`[Ball Don't Lie] NBA v2/odds returned 0 rows for`, norm);
            // Legitimate "no odds" — OK to cache empty result
            return [];
          } catch (v2err) {
            const status = v2err?.response?.status || '';
            const data = v2err?.response?.data ? JSON.stringify(v2err.response.data).slice(0, 400) : '';
            console.warn(`[Ball Don't Lie] NBA v2/odds failed: ${status} ${data}`);
            throw v2err; // Don't cache failed fetches — let outer catch handle
          }
        } else {
          // Non-NBA sports: use V1 sport-scoped endpoint
          const v1Url = `${BALLDONTLIE_API_BASE_URL}/${sportKey}/v1/odds`;
          try {
             return await fetchAllPages(v1Url, norm);
          } catch (err) {
             console.warn(`[Ball Don't Lie] ${sportKey} v1/odds failed: ${err.message}`);
             throw err; // Don't cache failed fetches — let outer catch handle
          }
        }
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] getOdds error (${sport}):`, e?.response?.status || e?.message);
      throw e;
    }
  },
};
