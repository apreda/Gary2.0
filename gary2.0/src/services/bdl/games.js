import { getCachedOrFetch, BALLDONTLIE_API_BASE_URL, API_KEY, BDL_TIMEOUT_MS, buildQuery } from './transport.js';
import { decodeBdlSdkItem, decodeBdlSdkRows, decodeBdlRows } from '../bdlResponse.js';
import { _normalizeGame } from './normalization.js';
import { recordPickDataFailure } from '../pickDataIntegrity.js';
import { waitForBdlRequestSlot } from '../bdlRequestGate.js';
import { fetchFootballGamesBatched } from './footballBatching.js';

// Endpoint methods execute on the shared public service (preserving this calls).
export const gamesMethods = {

  /**
   * Fetch one provider game by its canonical BDL id.
   *
   * Scheduler exact-game runs must not discover one NFL matchup by downloading
   * one or more date/slate pages first. The SDK exposes a dedicated
   * `/games/:id` route, so keep that lookup explicit and independently cached.
   */
  async getGame(sportKey, gameId, ttlMinutes = 1) {
    if (gameId === null || gameId === undefined || String(gameId).trim() === '') {
      throw new Error('getGame requires a provider game id');
    }

    try {
      const normalizedId = /^\d+$/.test(String(gameId)) ? Number(gameId) : gameId;
      const cacheKey = `${sportKey}_game_${String(gameId)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        if (sport?.getGame) {
          const response = await sport.getGame(normalizedId);
          const game = decodeBdlSdkItem(response, `${sportKey} exact game ${gameId}`);
          return _normalizeGame(sportKey, game);
        }

        const endpointMap = {
          icehockey_nhl: 'nhl/v1/games',
          americanfootball_nfl: 'nfl/v1/games',
          americanfootball_ncaaf: 'ncaaf/v1/games',
          basketball_ncaab: 'ncaab/v1/games',
          basketball_nba: 'nba/v1/games',
          baseball_mlb: 'mlb/v1/games',
        };
        const path = endpointMap[sportKey];
        if (!path) throw new Error('getGame not supported');
        const url = `${BALLDONTLIE_API_BASE_URL}/${path}/${encodeURIComponent(String(gameId))}`;
        const response = await fetch(url, {
          headers: { Authorization: API_KEY },
          signal: AbortSignal.timeout(BDL_TIMEOUT_MS),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`HTTP ${response.status} ${body}`);
        }
        const json = await response.json();
        if (!json || typeof json !== 'object' || !Object.hasOwn(json, 'data')) {
          throw new Error(`${sportKey} exact game ${gameId}: invalid response shape`);
        }
        return _normalizeGame(sportKey, json.data ?? null);
      }, ttlMinutes);
    } catch (error) {
      recordPickDataFailure('BDL:getGame', error);
      console.error(`[Ball Don't Lie] ${sportKey} getGame(${gameId}) error:`, error.message);
      throw error;
    }
  },

  async getGames(sportKey, params = {}, ttlMinutes = 10, { signal } = {}) {
    signal?.throwIfAborted();
    try {
      const cacheKey = `${sportKey}_games_${JSON.stringify(params)}`;
      const fetchGames = async (requestParams) => {
        // A caller refreshing a bounded date window can fail closed earlier
        // if a provider ignores its filters. This is transport policy, never
        // a provider query parameter or permission to publish partial pages.
        const maxPages = requestParams?.paginationMaxPages ?? 100;
        if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
          throw new Error('games paginationMaxPages must be an integer from 1 to 100');
        }
        requestParams = { ...requestParams };
        delete requestParams.paginationMaxPages;
        const sport = this._getSportClient(sportKey);
        const endpointMap = {
          icehockey_nhl: 'nhl/v1/games',
          americanfootball_nfl: 'nfl/v1/games',
          americanfootball_ncaaf: 'ncaaf/v1/games',
          basketball_ncaab: 'ncaab/v1/games',
          basketball_nba: 'nba/v1/games',
          baseball_mlb: 'mlb/v1/games'
        };

        const fetchPage = async (pageParams) => {
          signal?.throwIfAborted();
          // The installed SDK has no cancellation argument. A bounded read
          // uses the existing HTTP transport so its deadline reaches fetch.
          if (sport?.getGames && !signal) {
            const resp = await sport.getGames(pageParams);
            const rows = decodeBdlSdkRows(resp, `${sportKey} games page`);
            return {
              rows,
              nextCursor: resp?.meta?.next_cursor ?? resp?.data?.meta?.next_cursor ?? null,
            };
          }

          const path = endpointMap[sportKey];
          if (!path) throw new Error('getGames not supported');
          const qs = buildQuery(pageParams);
          const url = `https://api.balldontlie.io/${path}${qs}`;
          const httpTimeout = AbortSignal.timeout(BDL_TIMEOUT_MS);
          const resp = await fetch(url, { headers: { Authorization: API_KEY }, signal: signal ? AbortSignal.any([signal, httpTimeout]) : httpTimeout });
          signal?.throwIfAborted();
          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error(`HTTP ${resp.status} ${text}`);
          }
          const json = await resp.json();
          signal?.throwIfAborted();
          return {
            rows: decodeBdlRows(json, `${sportKey} games page`),
            nextCursor: json?.meta?.next_cursor ?? null,
          };
        };

        // A full college Saturday includes FCS matchups in the provider feed
        // and can exceed BDL's 100-row page before the FBS policy is applied.
        // Follow every NCAAF cursor first; callers then classify the complete
        // provider result instead of silently publishing only page one.
        // paginateAll (Aug 27, the H2H blindness fix): any caller may opt in
        // — a 100-row page of a ~160-game MLB season made every post-June
        // meeting invisible to MLB_H2H while the same desk narrated the
        // series. The flag never reaches the querystring.
        const paginate = sportKey === 'americanfootball_ncaaf' || requestParams?.paginateAll === true;
        if (requestParams?.paginateAll != null) delete requestParams.paginateAll;
        const allGames = [];
        const seenCursors = new Set();
        let cursor = requestParams?.cursor ?? null;
        let pageCount = 0;

        for (;;) {
          signal?.throwIfAborted();
          if (pageCount > 0) {
            // getCachedOrFetch reserves the first transport. Each additional
            // page must reserve its own account-wide slot as well.
            await waitForBdlRequestSlot(`${cacheKey}:page:${pageCount + 1}`, { signal });
          }
          const pageParams = cursor == null
            ? { ...requestParams }
            : { ...requestParams, cursor };
          const page = await fetchPage(pageParams);
          allGames.push(...page.rows);
          pageCount += 1;

          if (!paginate || page.nextCursor == null) break;
          const cursorKey = String(page.nextCursor);
          if (seenCursors.has(cursorKey)) {
            throw new Error(`NCAAF games pagination repeated cursor ${cursorKey}`);
          }
          seenCursors.add(cursorKey);
          cursor = page.nextCursor;
          if (pageCount >= maxPages) {
            throw new Error(`${sportKey} games pagination exceeded ${maxPages} pages`);
          }
        }

        // Normalize field names to standard (NBA) convention. Dedupe by exact
        // provider game id because adjacent UTC-date pages can overlap.
        const seenGameIds = new Set();
        return allGames
          .map(g => _normalizeGame(sportKey, g))
          .filter((game) => {
            if (!paginate || game?.id == null) return true;
            const key = String(game.id);
            if (seenGameIds.has(key)) return false;
            seenGameIds.add(key);
            return true;
          });
      };
      return await getCachedOrFetch(cacheKey, async () => {
        return signal ? fetchGames(params) : fetchFootballGamesBatched(sportKey, params, fetchGames);
      }, ttlMinutes, { signal });
    } catch (e) {
      recordPickDataFailure('BDL:getGames', e);
      console.error(`[Ball Don't Lie] ${sportKey} getGames error:`, e.message);
      throw e;
    }
  },
};
