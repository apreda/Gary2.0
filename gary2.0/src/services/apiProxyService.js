import axios from 'axios';

// Cache for API responses
const apiCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Makes a cached API request with error handling and retries
 * @param {Object} options - Request options
 * @param {string} options.url - API endpoint URL
 * @param {string} options.method - HTTP method (GET, POST, etc.)
 * @param {Object} options.params - Query parameters
 * @param {Object} options.data - Request body
 * @param {Object} options.headers - Request headers
 * @param {number} options.retries - Number of retry attempts
 * @param {number} options.timeout - Request timeout in ms
 * @returns {Promise<Object>} API response data
 */
const makeCachedRequest = async ({
  url,
  method = 'GET',
  params = {},
  data = null,
  headers = {},
  retries = 2,
  timeout = 10000,
  useCache = true,
  cacheKey = null
}) => {
  // Generate cache key if not provided
  const requestKey = cacheKey || `${method}:${url}:${JSON.stringify(params)}:${JSON.stringify(data)}`;
  
  // Check cache first
  if (useCache) {
    const cached = apiCache.get(requestKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[API] Using cached response for ${requestKey}`);
      return cached.data;
    }
  }

  // Make the request with retries
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios({
        method,
        url,
        params,
        data,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...headers
        },
        timeout,
        // Don't throw on non-2xx status codes
        validateStatus: () => true
      });

      // Handle successful response
      if (response.status >= 200 && response.status < 300) {
        // Cache successful responses
        if (useCache) {
          apiCache.set(requestKey, {
            data: response.data,
            timestamp: Date.now()
          });
        }
        return response.data;
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers['retry-after']) || 5;
        console.warn(`[API] Rate limited, retrying after ${retryAfter} seconds`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }

      // Handle other errors
      throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000); // Exponential backoff
        console.warn(`[API] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw lastError || new Error('API request failed');
};

/**
 * MLB Stats API proxy
 */
const mlbStatsProxy = {
  baseUrl: 'https://statsapi.mlb.com/api/v1',
  
  async getGame(gameId) {
    return makeCachedRequest({
      url: `${this.baseUrl}/game/${gameId}/feed/live`,
      cacheKey: `mlb:game:${gameId}`
    });
  },
  
  async getSchedule(date = new Date().toISOString().slice(0, 10)) {
    return makeCachedRequest({
      url: `${this.baseUrl}/schedule`,
      params: {
        sportId: 1, // MLB
        date,
        hydrate: 'probablePitcher(note),linescore,decisions,stats,team,venue'
      },
      cacheKey: `mlb:schedule:${date}`
    });
  },
  
  async getTeamRoster(teamId) {
    return makeCachedRequest({
      url: `${this.baseUrl}/teams/${teamId}/roster`,
      cacheKey: `mlb:roster:${teamId}`
    });
  }
};

/**
 * Ball Don't Lie API proxy
 */
const ballDontLieProxy = {
  baseUrl: 'https://www.balldontlie.io/api/v1',
  
  async getGames(params = {}) {
    return makeCachedRequest({
      url: `${this.baseUrl}/games`,
      params: {
        per_page: 100,
        ...params
      },
      cacheKey: `bdl:games:${JSON.stringify(params)}`
    });
  },
  
  async getPlayerStats(playerId, params = {}) {
    return makeCachedRequest({
      url: `${this.baseUrl}/stats`,
      params: {
        player_ids: [playerId],
        per_page: 100,
        ...params
      },
      cacheKey: `bdl:player:${playerId}:stats:${JSON.stringify(params)}`
    });
  }
};

export const apiProxyService = {
  mlbStats: mlbStatsProxy,
  ballDontLie: ballDontLieProxy,
  makeCachedRequest
};

export default apiProxyService;
