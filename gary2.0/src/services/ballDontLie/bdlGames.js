import { getCachedOrFetch, buildQuery, axios, BALLDONTLIE_API_BASE_URL, API_KEY } from './bdlCore.js';

export const gamesMethods = {
  /**
   * Get NHL box scores for recent games (for trend analysis)
   * Endpoint: GET /nhl/v1/box_scores?dates[]=YYYY-MM-DD
   * @param {Array<string>} dates - Array of dates in YYYY-MM-DD format
   * @param {Object} options - Optional filters (team_ids, player_ids)
   * @returns {Promise<Array>} - Array of box score entries
   */
  async getNhlRecentBoxScores(dates, options = {}) {
    try {
      if (!dates || dates.length === 0) return [];

      const cacheKey = `nhl_box_scores_${dates.join(',')}_${JSON.stringify(options)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        let allBoxScores = [];
        
        // Fetch box scores for each date (with pagination support)
        for (const date of dates.slice(0, 7)) { // Limit to 7 days
          let cursor = null;
          let pageCount = 0;
          const maxPages = 5;

          do {
            const params = { dates: [date], per_page: 100 };
            if (options.team_ids) params.team_ids = options.team_ids;
            if (options.player_ids) params.player_ids = options.player_ids;
            if (cursor) params.cursor = cursor;

            const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/box_scores${buildQuery(params)}`;
            const response = await axios.get(url, {
              headers: { 'Authorization': API_KEY }
            });

            const data = response.data?.data || [];
            allBoxScores = allBoxScores.concat(data);
            
            cursor = response.data?.meta?.next_cursor;
            pageCount++;

            // Rate limit protection
            if (cursor) await new Promise(resolve => setTimeout(resolve, 50));
          } while (cursor && pageCount < maxPages);
        }

        console.log(`[Ball Don't Lie] Retrieved ${allBoxScores.length} NHL box score entries for ${dates.length} days`);
        return allBoxScores;
      }, 15); // Cache for 15 minutes
    } catch (error) {
      console.error(`[Ball Don't Lie] NHL box scores error:`, error?.response?.data || error.message);
      return [];
    }
  },
};
