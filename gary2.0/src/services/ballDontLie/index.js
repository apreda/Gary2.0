import { clearCache as _clearCache, clearCacheByPattern as _clearCacheByPattern, initApi, API_KEY } from './bdlCore.js';
import { oddsMethods } from './bdlOdds.js';
import { gamesMethods } from './bdlGames.js';
import { playersMethods } from './bdlPlayers.js';
import { teamStatsMethods } from './bdlTeamStats.js';
import { injuriesMethods } from './bdlInjuries.js';

const ballDontLieService = {
  // Core methods
  /**
   * Clear all cached data - useful for ensuring fresh injury/lineup data
   */
  clearCache() {
    _clearCache();
  },

  /**
   * Clear cache entries matching a pattern (e.g., 'injuries' to clear all injury caches)
   */
  clearCacheByPattern(pattern) {
    return _clearCacheByPattern(pattern);
  },

  /**
   * Get sport-specific client from the SDK
   */
  _getSportClient(sportKey) {
    const client = initApi();
    if (!client) return null;
    const map = {
      basketball_nba: 'nba',
      icehockey_nhl: 'nhl',
      americanfootball_nfl: 'nfl',
      americanfootball_ncaaf: 'ncaaf',
      basketball_ncaab: 'ncaab'
    };
    const prop = map[sportKey] || sportKey;
    return client[prop] || null;
  },

  /**
   * Initialize the service
   */
  initialize() {
    if (!API_KEY) {
      console.warn('[BDL] No API key found — set BALLDONTLIE_API_KEY');
      return;
    }
    const client = initApi();
    if (!client) {
      console.warn('[BDL] Client initialization failed');
    }
  },

  // Merge all method groups
  ...oddsMethods,
  ...gamesMethods,
  ...playersMethods,
  ...teamStatsMethods,
  ...injuriesMethods,
};

// Initialize on import
ballDontLieService.initialize();

export { ballDontLieService };
