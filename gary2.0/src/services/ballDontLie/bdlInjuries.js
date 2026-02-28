import { getCachedOrFetch, initApi, buildQuery, normalizeName, getCurrentNhlSeason, axios, BALLDONTLIE_API_BASE_URL, API_KEY } from './bdlCore.js';

export const injuriesMethods = {
  async getInjuriesGeneric(sportKey, params = {}, ttlMinutes = 5) {
    try {
      const cacheKey = `${sportKey}_injuries_${JSON.stringify(params)}`;
      return await getCachedOrFetch(cacheKey, async () => {
        const sport = this._getSportClient(sportKey);
        const fn = sport?.getPlayerInjuries || sport?.getInjuries;
        if (fn) {
          const resp = await fn.call(sport, params);
          return resp?.data || [];
        }
        // HTTP fallback for sports with documented injuries endpoints
        const endpointMap = {
          basketball_nba: 'nba/v1/player_injuries',
          americanfootball_nfl: 'nfl/v1/player_injuries',
          icehockey_nhl: 'nhl/v1/player_injuries'
        };
        const path = endpointMap[sportKey];
        if (!path) {
          // NCAAF/NCAAB: Return empty silently - Gemini Grounding provides opt-out/injury context
          return [];
        }
        const qs = buildQuery(params);
        const url = `https://api.balldontlie.io/${path}${qs}`;
        const resp = await fetch(url, { headers: { Authorization: API_KEY } });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status} ${text}`);
        }
        const json = await resp.json().catch(() => ({}));
        return Array.isArray(json?.data) ? json.data : [];
      }, ttlMinutes);
    } catch (e) {
      console.error(`[Ball Don't Lie] ${sportKey} getInjuries error:`, e.message);
      return [];
    }
  },

  /**
   * Get NBA player injuries for current playoff teams
   * @param {Array} teamIds - Array of team IDs to check for injuries
   * @returns {Promise<Array>} - Array of player injury data
   */
  async getNbaPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nba_player_injuries_${teamIds.join('_') || 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏀 Fetching NBA player injuries for teams: ${teamIds.length > 0 ? teamIds.join(', ') : 'ALL'}`);
        
        // ⭐ SDK has bug with team_ids parameter - use HTTP fallback
        // Error: "Cannot read properties of null (reading 'toString')"
        let allInjuries = [];
        let cursor = null;
        let page = 1;
        const maxPages = 10;
        
        do {
          const params = new URLSearchParams();
          params.append('per_page', '100');
          if (cursor) params.append('cursor', cursor);
          // Add team_ids if specified
          for (const tid of teamIds) {
            params.append('team_ids[]', tid);
          }
          
          const url = `https://api.balldontlie.io/v1/player_injuries?${params.toString()}`;
          const resp = await fetch(url, { headers: { Authorization: API_KEY } });
          
          if (!resp.ok) {
            console.error(`🏀 Injuries API error: HTTP ${resp.status}`);
            break;
          }
          
          const json = await resp.json().catch(() => ({}));
          const injuries = Array.isArray(json.data) ? json.data : [];
          allInjuries.push(...injuries);
          
          cursor = json.meta?.next_cursor;
          page++;
          
          if (page > maxPages) {
            console.warn(`🏀 Hit max pages (${maxPages}) for injuries - stopping pagination`);
            break;
          }
        } while (cursor);
        
        console.log(`🏀 Found ${allInjuries.length} player injuries (${page - 1} pages)`);
        
        // ⭐ Log OUT and DOUBTFUL players for debugging
        const outPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'OUT');
        const doubtfulPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'DOUBTFUL');
        const questionablePlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'QUESTIONABLE');
        
        if (outPlayers.length > 0) {
          console.log(`🏀 OUT (${outPlayers.length}): ${outPlayers.slice(0, 10).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${outPlayers.length > 10 ? '...' : ''}`);
        }
        if (doubtfulPlayers.length > 0) {
          console.log(`🏀 DOUBTFUL (${doubtfulPlayers.length}): ${doubtfulPlayers.map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}`);
        }
        if (questionablePlayers.length > 0) {
          console.log(`🏀 QUESTIONABLE (${questionablePlayers.length}): ${questionablePlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${questionablePlayers.length > 5 ? '...' : ''}`);
        }
        
        return allInjuries;
      }, 2); // Cache for 2 minutes — injury status changes rapidly on game day
    } catch (error) {
      console.error('Error fetching NBA player injuries:', error);
      return [];
    }
  },

  /**
   * Get NFL player injuries from BDL (official practice report data)
   * @param {Array} teamIds - Array of NFL team IDs to check for injuries
   * @returns {Promise<Array>} - Array of player injury data with status (Questionable/Doubtful/Out)
   */
  async getNflPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nfl_player_injuries_${teamIds.join('_') || 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏈 Fetching NFL player injuries for teams: ${teamIds.length > 0 ? teamIds.join(', ') : 'ALL'}`);

        // Use HTTP endpoint directly (SDK may have issues)
        let allInjuries = [];
        let cursor = null;
        let page = 1;
        const maxPages = 10;

        do {
          const params = new URLSearchParams();
          params.append('per_page', '100');
          if (cursor) params.append('cursor', cursor);
          // Add team_ids if specified
          for (const tid of teamIds) {
            params.append('team_ids[]', tid);
          }

          const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/player_injuries?${params.toString()}`;
          console.log(`🏈 Fetching NFL player injuries (page ${page})`);

          const response = await axios.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const injuries = response.data?.data || [];
          allInjuries = allInjuries.concat(injuries);
          cursor = response.data?.meta?.next_cursor;
          page++;
        } while (cursor && page <= maxPages);

        console.log(`🏈 Found ${allInjuries.length} NFL player injuries (${page - 1} pages)`);

        // Log injury breakdown
        const outPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'OUT');
        const doubtfulPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'DOUBTFUL');
        const questionablePlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'QUESTIONABLE');

        if (outPlayers.length > 0) {
          console.log(`🏈 OUT (${outPlayers.length}): ${outPlayers.slice(0, 10).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${outPlayers.length > 10 ? '...' : ''}`);
        }
        if (doubtfulPlayers.length > 0) {
          console.log(`🏈 DOUBTFUL (${doubtfulPlayers.length}): ${doubtfulPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${doubtfulPlayers.length > 5 ? '...' : ''}`);
        }
        if (questionablePlayers.length > 0) {
          console.log(`🏈 QUESTIONABLE (${questionablePlayers.length}): ${questionablePlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${questionablePlayers.length > 5 ? '...' : ''}`);
        }

        return allInjuries;
      }, 30); // Cache for 30 minutes - NFL injury reports update less frequently than NBA
    } catch (error) {
      console.error('Error fetching NFL player injuries:', error);
      return [];
    }
  },

  /**
   * Get NHL Player Injuries from BDL
   * Endpoint: GET https://api.balldontlie.io/nhl/v1/player_injuries
   * Returns: player info, status, injury_type, return_date, comment
   *
   * IMPORTANT FOR INJURY INTERPRETATION:
   * - Use return_date to determine if injury is FRESH (0-3 days) or PRICED IN (>3 days)
   * - status: IR, IR-LT, IR-NR, DTD, OUT, LTIR
   * - comment contains detailed injury description
   *
   * @param {Array} teamIds - Array of NHL team IDs to filter (optional)
   * @returns {Promise<Array>} - Array of player injury data
   */
  async getNhlPlayerInjuries(teamIds = []) {
    try {
      const cacheKey = `nhl_player_injuries_${teamIds.join('_') || 'all'}`;
      return await getCachedOrFetch(cacheKey, async () => {
        console.log(`🏒 Fetching NHL player injuries for teams: ${teamIds.length > 0 ? teamIds.join(', ') : 'ALL'}`);

        let allInjuries = [];
        let cursor = null;
        let page = 1;
        const maxPages = 10;

        do {
          const params = new URLSearchParams();
          params.append('per_page', '100');
          if (cursor) params.append('cursor', cursor);
          // Add team_ids if specified
          for (const tid of teamIds) {
            params.append('team_ids[]', tid);
          }

          const url = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/player_injuries?${params.toString()}`;
          console.log(`🏒 Fetching NHL player injuries (page ${page})`);

          const response = await axios.get(url, {
            headers: { 'Authorization': API_KEY }
          });

          const injuries = response.data?.data || [];
          allInjuries = allInjuries.concat(injuries);
          cursor = response.data?.meta?.next_cursor;
          page++;
        } while (cursor && page <= maxPages);

        console.log(`🏒 Found ${allInjuries.length} NHL player injuries (${page - 1} pages)`);

        // Log injury breakdown by status
        const irPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'IR');
        const irLtPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'IR-LT' || i.status?.toUpperCase() === 'LTIR');
        const dtdPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'DTD' || i.status?.toUpperCase() === 'DAY-TO-DAY');
        const outPlayers = allInjuries.filter(i => i.status?.toUpperCase() === 'OUT');

        if (irPlayers.length > 0) {
          console.log(`🏒 IR (${irPlayers.length}): ${irPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${irPlayers.length > 5 ? '...' : ''}`);
        }
        if (irLtPlayers.length > 0) {
          console.log(`🏒 IR-LT/LTIR (${irLtPlayers.length}): ${irLtPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${irLtPlayers.length > 5 ? '...' : ''}`);
        }
        if (dtdPlayers.length > 0) {
          console.log(`🏒 DTD (${dtdPlayers.length}): ${dtdPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${dtdPlayers.length > 5 ? '...' : ''}`);
        }
        if (outPlayers.length > 0) {
          console.log(`🏒 OUT (${outPlayers.length}): ${outPlayers.slice(0, 5).map(i => `${i.player?.first_name} ${i.player?.last_name}`).join(', ')}${outPlayers.length > 5 ? '...' : ''}`);
        }

        return allInjuries;
      }, 30); // Cache for 30 minutes
    } catch (error) {
      console.error('Error fetching NHL player injuries:', error);
      return [];
    }
  },
};
